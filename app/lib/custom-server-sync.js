'use client';

// ==================== 自建服务器（Author Cloud）同步层 ====================
// 使用变动防抖、空闲暂停、手动同步和首次登录强制同步；后端采用“按条目增量”的
// Author Cloud（/api/free/sync/push|pull）。
//
// 本地按 key 存数组（章节/设定/记忆组）；本模块把变化的数组"拆成条目"只推改动/新增/
// 删除的条目，拉取时把云端条目"重组"回数组合并进本地。拆分/合并的纯逻辑在
// custom-sync-core.js（可单元测试），这里只负责定时器 / 网络 / localStorage 状态。
//
// 数据安全铁律见 custom-sync-core.js 顶部说明。

import { anySignal } from './abort-signal-compat';
import { isSyncableKey } from './sync-key-policy';
import { authorizedFetch, isCustomSignedIn, getCustomAuthContext, assertCustomAuthContext, isCustomAuthContextCurrent } from './custom-auth';
import { fingerprint, parseKey, itemToKey, diffKeyToItems, matchPushResults, mergeItemsIntoLocal, latestItemsById, locallyChangedItemIds } from './custom-sync-core';

// ==================== 配置 ====================

const SYNC_INTERVAL = 5 * 60 * 1000; // 5 分钟（push 去抖）
const PULL_INTERVAL = 90 * 1000;     // 90 秒：前台自动拉取云端新变动（别的设备刚改的）
const IDLE_TIMEOUT = 5 * 60 * 1000;  // 5 分钟无变化后停止自动同步
const PUSH_BATCH = 100;              // 单次 push 的条目数（配合后端 ~1MB 请求体上限）
const PULL_LIMIT = 200;
const SYNC_STATE_PREFIX = 'author-cloud-sync-state-v2:'; // 本地增量状态，绝不上云

// ==================== 状态 & 队列 ====================

const _pendingKeys = new Set(); // 变化的 key（待拆分对账）
let _syncTimer = null;
let _pullTimer = null;
let _idleTimer = null;
let _isSyncing = false;
let _firstSyncAfterLogin = true;
let _autoSetupDone = false;     // 全局监听（beforeunload/visibilitychange）只装一次
let _localGet = null;           // 由 persistence 注入，避免循环依赖
let _localSet = null;
let _syncOperation = Promise.resolve();
let _syncGeneration = 0;
let _syncController = new AbortController();
let _boundEpoch = null;

function assertOperation(context) {
    assertCustomAuthContext(context.auth);
    context.signal.throwIfAborted();
    if (context.generation !== _syncGeneration) throw new Error('同步已停止');
}

function operationIsCurrent(context) {
    return isCustomAuthContextCurrent(context.auth) && !context.signal.aborted && context.generation === _syncGeneration;
}

function serializeSync(operation) {
    const auth = getCustomAuthContext();
    if (!auth) return Promise.resolve(0);
    const context = { auth, generation: _syncGeneration, signal: anySignal([auth.signal, _syncController.signal]) };
    const result = _syncOperation.then(() => {
        assertOperation(context);
        ensureAccountBound(auth);
        return operation(context);
    });
    _syncOperation = result.catch(() => {});
    return result;
}

async function readLocal(key, context) {
    assertOperation(context);
    const value = await _localGet(key, { signal: context.signal, assertCurrent: () => assertOperation(context) });
    assertOperation(context);
    return value;
}

async function writeLocal(key, value, context) {
    assertOperation(context);
    await _localSet(key, value, {
        signal: context.signal, assertCurrent: () => assertOperation(context),
        bypassForcePull: context.forcePull === true, awaitServerWrite: context.forcePull === true,
    });
    assertOperation(context);
}

// 诊断：推送失败要能还原"多大的批、什么状态码"，否则只剩一句"部分内容尚未同步"。
// 诊断本身绝不能让同步失败，因此动态载入并吞掉自身错误。
function recordSyncDiagnostic(event, message, metadata, level = 'info') {
    import('./diagnostics')
        .then(({ recordDiagnosticEvent }) => recordDiagnosticEvent(event, message, metadata, level))
        .catch(() => {});
}

let _syncStatusCallback = null;
export function onCustomSyncStatusChange(cb) { _syncStatusCallback = cb; }
function notifyStatus(status) {
    if (_syncStatusCallback) _syncStatusCallback({ ...status, keys: Array.from(_pendingKeys) });
}

// persistence 层注入本地读写函数
export function bindLocalIO(localGet, localSet) { _localGet = localGet; _localSet = localSet; }

// ==================== 增量状态 ====================
// keys stores confirmed baselines; pending stores unconfirmed upload attempts.
// Both contain per-item { hash } | { deleted:true }, never document contents.

function stateStorageKey(identity) {
    return `${SYNC_STATE_PREFIX}${encodeURIComponent(JSON.stringify([identity.serverUrl, identity.product, identity.userId ?? identity.accountId]))}`;
}

function emptyState(auth) {
    return { cursor: 0, keys: {}, pending: {}, serverUrl: auth.serverUrl, product: auth.product, accountId: auth.userId };
}

function loadState(auth) {
    if (typeof window === 'undefined') return emptyState(auth);
    try {
        const s = JSON.parse(localStorage.getItem(stateStorageKey(auth)) || 'null');
        if (s?.serverUrl === auth.serverUrl && s?.product === auth.product && s?.accountId === auth.userId) {
            return { ...emptyState(auth), cursor: Number(s.cursor) || 0, keys: s.keys || {}, pending: s.pending || {} };
        }
    } catch {}
    return emptyState(auth);
}
function saveState() {
    if (typeof window === 'undefined') return;
    // Do not start an upload or advance a cursor if its recovery state cannot
    // be saved. The caller reports the storage error and retains local data.
    localStorage.setItem(stateStorageKey(_state), JSON.stringify(_state));
}
let _state = null;

// 显式重置当前身份的增量状态；普通退出保留各身份的记录。
export function resetSyncState() {
    stopCustomSync();
    const auth = getCustomAuthContext();
    if (!auth) { _state = null; return; }
    _state = emptyState(auth);
    _boundEpoch = auth.epoch;
    saveState();
}

// 按服务器、产品和账号加载增量状态，不给没有来源信息的旧状态猜测归属。
function ensureAccountBound(auth = getCustomAuthContext()) {
    assertCustomAuthContext(auth);
    if (!_state || stateStorageKey(_state) !== stateStorageKey(auth) || _boundEpoch !== auth.epoch) {
        _pendingKeys.clear();
        _state = loadState(auth);
        _boundEpoch = auth.epoch;
    }
    for (const [key, items] of Object.entries(_state.pending)) {
        if (isSyncableKey(key) && items && Object.keys(items).length > 0) _pendingKeys.add(key);
    }
}

function pushedItemState(item) {
    return item.deleted ? { deleted: true } : { hash: item.contentHash };
}

async function preservePendingConflict(key, kind, localValue, remote, context) {
    const value = kind === 'works_index'
        ? localValue
        : (Array.isArray(localValue) ? localValue.find(item => item?.id != null && String(item.id) === String(remote.itemId)) : undefined);
    const local = value === undefined ? { deleted: true } : { value };
    if (local.deleted ? remote.deleted === true : !remote.deleted && fingerprint(value) === fingerprint(remote.value)) return;
    const identity = [context.auth.serverUrl, context.auth.product, context.auth.userId, key, String(remote.itemId)].map(part => encodeURIComponent(String(part))).join(':');
    const backupKey = `author-cloud-conflict-backup:${identity}:${fingerprint({ local, remote })}`;
    // Non-syncable keys use browser storage. Save both branches before allowing
    // the pull cursor to pass this remote version, including local deletions.
    await writeLocal(backupKey, {
        version: 1, accountId: context.auth.userId, serverUrl: context.auth.serverUrl, product: context.auth.product, key, itemId: String(remote.itemId),
        local, remote, savedAt: new Date().toISOString(),
    }, context);
}

// 把某 key 的增量状态推进到"与云端一致"（pull 应用后调用）
function commitPulledState(key, items) {
    const cur = _state.keys[key] || {};
    for (const it of latestItemsById(items)) {
        const id = String(it.itemId);
        if (it.deleted) cur[id] = { deleted: true };
        else cur[id] = { hash: fingerprint(it.value) };
    }
    _state.keys[key] = cur;
}

// ==================== 触发机制 ====================

export function customEnqueue(key) {
    if (!isCustomSignedIn() || !isSyncableKey(key)) return;
    ensureAccountBound();
    _pendingKeys.add(key); // 值稍后由 _localGet 现取，保证推的是最新
    notifyStatus({ pending: _pendingKeys.size });
    ensureSyncTimer();
    resetIdleTimer();
}

export function customDel(key) {
    if (!isCustomSignedIn() || !isSyncableKey(key)) return;
    ensureAccountBound();
    // 删除整个 key：入队，flush 时取到 undefined → diff 产出该 key 全部 tombstone
    _pendingKeys.add(key);
    ensureSyncTimer();
    resetIdleTimer();
}

function ensureSyncTimer() {
    if (!_syncTimer) _syncTimer = setInterval(() => { flushSync().catch(() => {}); }, SYNC_INTERVAL);
}
function clearSyncTimer() {
    if (_syncTimer) { clearInterval(_syncTimer); _syncTimer = null; }
}

// 前台自动拉取定时器（只在页面可见时拉，后台标签不拉、省资源）。
// 补上"5 分钟定时器只上传、不下载"的缺口：别的设备改了，已登录的本端能被动发现。
function ensurePullTimer() {
    if (_pullTimer) return;
    _pullTimer = setInterval(() => {
        if (typeof document !== 'undefined' && document.hidden) return;
        if (isCustomSignedIn()) pullFromCloud().catch(() => {});
    }, PULL_INTERVAL);
}
function clearPullTimer() {
    if (_pullTimer) { clearInterval(_pullTimer); _pullTimer = null; }
}

function resetIdleTimer() {
    if (_idleTimer) clearTimeout(_idleTimer);
    _idleTimer = setTimeout(() => {
        flushSync({ throwOnError: true }).then(() => {
            clearSyncTimer();
            notifyStatus({ syncing: false, pending: _pendingKeys.size, lastSync: Date.now(), idle: true });
        }).catch(() => {});
    }, IDLE_TIMEOUT);
}

// ==================== push（增量） ====================

export function flushSync(options = {}) {
    return serializeSync(context => flushPendingSync(options, context));
}

async function flushPendingSync(options, context) {
    const { throwOnError = false } = options;
    if (!isCustomSignedIn() || !_localGet) return;
    if (_isSyncing) return;
    assertOperation(context);

    if (_firstSyncAfterLogin) _firstSyncAfterLogin = false;

    if (_pendingKeys.size === 0) {
        notifyStatus({ syncing: false, pending: 0, lastSync: Date.now() });
        return;
    }

    _isSyncing = true;
    notifyStatus({ syncing: true, pending: _pendingKeys.size });
    const keys = Array.from(_pendingKeys);
    _pendingKeys.clear();
    const now = new Date().toISOString();
    let sawStale = false;
    let unconfirmed = false;

    try {
        for (const key of keys) {
            if (!isSyncableKey(key)) continue;
            const value = await readLocal(key, context);
            const { items, nextItemState } = diffKeyToItems(key, value, now, _state.keys[key] || {}, _state.pending[key] || {});
            if (items.length === 0) { _state.keys[key] = nextItemState; continue; }

            for (const item of items) {
                _state.pending[key] = { ..._state.pending[key], [item.itemId]: pushedItemState(item) };
            }
            saveState(); // Persist retry/merge protection before the request can reach the server.
            for (let i = 0; i < items.length; i += PUSH_BATCH) {
                const batch = items.slice(i, i + PUSH_BATCH);
                const res = await authorizedFetch('/api/free/sync/push', { method: 'POST', body: { items: batch }, authContext: context.auth, signal: context.signal });
                assertOperation(context);
                if (!res.ok) {
                    // 批次只按条数切分，不按字节；后端有请求体上限时，超限的批会一直
                    // 重试一直失败。记下条数与序列化长度，才能把 413 和别的失败分开。
                    recordSyncDiagnostic('sync.cloud.push', '云端推送批次失败', {
                        key, kind: batch[0]?.kind || '', status: res.status,
                        batchItems: batch.length, batchIndex: i / PUSH_BATCH,
                        batchChars: JSON.stringify({ items: batch }).length,
                        totalItems: items.length,
                    }, 'error');
                    unconfirmed = true;
                    break;
                }
                const data = await res.json().catch(() => null);
                assertOperation(context);
                const results = matchPushResults(batch, data);
                for (let index = 0; index < batch.length; index++) {
                    const item = batch[index];
                    const result = results[index];
                    if (result?.accepted === true) {
                        _state.keys[key] = { ..._state.keys[key], [item.itemId]: pushedItemState(item) };
                        delete _state.pending[key][item.itemId];
                    } else {
                        unconfirmed = true;
                        if (result?.reason === 'stale') sawStale = true;
                        // 条目级未确认：服务器收下了请求却没确认这一条（stale / 缺应答 /
                        // 单条超限），与整批失败是两回事，分开记录才好定位。
                        recordSyncDiagnostic('sync.cloud.push-item', '云端未确认该条目', {
                            key, kind: item.kind, itemId: item.itemId,
                            reason: result?.reason || (result ? 'not-accepted' : 'no-result'),
                            itemChars: JSON.stringify(item).length,
                        }, 'warn');
                    }
                }
                saveState(); // A later batch failure must not erase earlier confirmations.
            }
            if (Object.keys(_state.pending[key]).length > 0) {
                _pendingKeys.add(key);
            } else {
                delete _state.pending[key];
            }
        }
        saveState();
        // 有 stale（别的设备推了更新版）→ 立即拉一次把新版合并到本地
        if (sawStale) { try { await pullCloudItems(context); } catch {} }
        assertOperation(context);
        if (unconfirmed) throw new Error('部分内容尚未同步，本地修改已保留，请稍后重试');
        notifyStatus({ syncing: false, pending: _pendingKeys.size, lastSync: Date.now() });
    } catch (err) {
        if (operationIsCurrent(context)) {
            keys.forEach((k) => _pendingKeys.add(k));
            notifyStatus({ syncing: false, pending: _pendingKeys.size, error: err.message });
        }
        if (throwOnError) throw err;
    } finally {
        _isSyncing = false;
    }
}

// 全量上传：迁移/首次把本地所有 syncable key 推上云端
export async function pushAllToCloud(keys = []) {
    if (!isCustomSignedIn() || !_localGet) return 0;
    ensureAccountBound();
    let queued = 0;
    for (const key of keys) {
        if (!isSyncableKey(key)) continue;
        _pendingKeys.add(key);
        queued++;
    }
    await flushSync({ throwOnError: true });
    return queued;
}

// ==================== pull（增量 + 合并） ====================

export function pullFromCloud() {
    return serializeSync(pullCloudItems);
}

async function pullCloudItems(context) {
    if (!isCustomSignedIn() || !_localGet || !_localSet) return 0;
    assertOperation(context);
    let since = _state.cursor || 0;
    let hasMore = true;
    const byKey = new Map(); // key → items[]

    try {
        while (hasMore) {
            const res = await authorizedFetch('/api/free/sync/pull', { method: 'GET', query: { since, limit: PULL_LIMIT }, authContext: context.auth, signal: context.signal });
            assertOperation(context);
            if (!res.ok) throw new Error(`pull HTTP ${res.status}`);
            const data = await res.json().catch(() => null);
            assertOperation(context);
            if (!data?.ok) throw new Error('pull 响应异常');
            for (const it of (data.items || [])) {
                const key = itemToKey(it);
                if (!key || !isSyncableKey(key)) continue;
                if (!byKey.has(key)) byKey.set(key, []);
                byKey.get(key).push(it);
            }
            since = data.nextSince ?? since;
            hasMore = Boolean(data.hasMore);
        }

        let merged = 0;
        for (const [key, items] of byKey) {
            const meta = parseKey(key);
            if (!meta) continue;
            let localValue = await readLocal(key, context);
            const localChanges = meta.kind === 'works_index' ? new Set() : locallyChangedItemIds(localValue, _state.keys[key] || {});
            const applicable = [];
            for (const item of latestItemsById(items)) {
                const id = String(item.itemId);
                if (localChanges.has(id) && !Object.hasOwn(_state.pending[key] || {}, id)) {
                    const localItem = localValue?.find(value => value?.id != null && String(value.id) === id);
                    _state.pending[key] ||= {};
                    _state.pending[key][id] = localItem ? { hash: fingerprint(localItem) } : { deleted: true };
                    _pendingKeys.add(key);
                    // Persist discovered edits/deletions before advancing past
                    // their remote versions, so retries survive app restarts.
                    saveState();
                }
                if (Object.hasOwn(_state.pending[key] || {}, id)) {
                    await preservePendingConflict(key, meta.kind, localValue, item, context);
                    _pendingKeys.add(key);
                } else {
                    applicable.push(item);
                }
            }
            // Saving a conflict copy yields to the editor. Merge unrelated
            // remote items into the current local array, not that older read.
            if (applicable.length !== items.length) localValue = await readLocal(key, context);
            const { changed, value } = mergeItemsIntoLocal(meta.kind, localValue, applicable, _state.keys[key] || {});
            if (changed) {
                // works_index 是"云端整份覆盖本地"，刚从 WebDAV 拉回来的作品列表同样会被盖掉。
                // 这类覆盖必须留痕，否则对用户就表现为"拉取成功但数据没变"。
                recordSyncDiagnostic('sync.cloud.merge', '云端合并改写了本地数据', {
                    key, kind: meta.kind, fullOverwrite: meta.kind === 'works_index',
                    appliedItems: applicable.length,
                    localItems: Array.isArray(localValue) ? localValue.length : null,
                    mergedItems: Array.isArray(value) ? value.length : null,
                }, meta.kind === 'works_index' ? 'warn' : 'debug');
                await writeLocal(key, value, context);
                merged++;
            }
            commitPulledState(key, applicable); // Unconfirmed items keep their previous common baseline.
        }
        const previousCursor = _state.cursor;
        _state.cursor = since;
        try { saveState(); }
        catch (error) { _state.cursor = previousCursor; throw error; }
        return merged;
    } catch (err) {
        // 自动拉取容错：不中断流程，但错误通过状态回调暴露（不再静默假成功）
        recordSyncDiagnostic('sync.cloud.pull', '云端自动拉取失败', {
            manual: false, cursor: _state?.cursor ?? null, message: String(err?.message || ''),
        }, 'error');
        if (operationIsCurrent(context)) notifyStatus({ syncing: false, error: err?.message || '云端拉取失败' });
        return 0;
    }
}

// 强制从云端覆盖恢复：无视本地改动/删除，用云端数据重建本地（供“从云端同步”手动触发）。
// 与 pullFromCloud 的区别：把本地当作空（localValue=undefined），云端有的一律写回本地，
// 从而能把本地误删的作品从云端拉回来。本地独有、云端没有的 key 不动（不删）。
export function forcePullFromCloud() {
    return serializeSync(forcePullCloudItems);
}

async function forcePullCloudItems(context) {
    context = { ...context, forcePull: true };
    if (!isCustomSignedIn() || !_localGet || !_localSet) return 0;
    assertOperation(context);
    _state = emptyState(context.auth);
    saveState();
    let since = 0;
    let hasMore = true;
    const byKey = new Map();
    try {
        while (hasMore) {
            const res = await authorizedFetch('/api/free/sync/pull', { method: 'GET', query: { since, limit: PULL_LIMIT }, authContext: context.auth, signal: context.signal });
            assertOperation(context);
            if (!res.ok) throw new Error(`从云端拉取失败（HTTP ${res.status}）`);
            const data = await res.json().catch(() => null);
            assertOperation(context);
            if (!data?.ok) throw new Error('从云端拉取失败：服务器响应异常');
            for (const it of (data.items || [])) {
                const key = itemToKey(it);
                if (!key || !isSyncableKey(key)) continue;
                if (!byKey.has(key)) byKey.set(key, []);
                byKey.get(key).push(it);
            }
            since = data.nextSince ?? since;
            hasMore = Boolean(data.hasMore);
        }

        let restored = 0;
        for (const [key, items] of byKey) {
            const meta = parseKey(key);
            if (!meta) continue;
            // localValue=undefined + prevState={} → 从零用云端条目重建（云端优先覆盖）
            const { value } = mergeItemsIntoLocal(meta.kind, undefined, items, {});
            if (value !== undefined) { await writeLocal(key, value, context); restored++; }
            commitPulledState(key, items);
        }
        _pendingKeys.clear(); // 云端已覆盖本地，放弃本地待推改动，避免把刚覆盖的又推回云端
        _state.cursor = since;
        saveState();
        return restored;
    } catch (err) {
        // 手动触发失败必须让用户知道：报状态并把错误抛给调用方（Sidebar 会提示“拉取失败”），
        // 绝不能静默返回 0 假装成功、还错误推进游标。
        recordSyncDiagnostic('sync.cloud.pull', '云端手动拉取失败', {
            manual: true, cursor: _state?.cursor ?? null, message: String(err?.message || ''),
        }, 'error');
        if (operationIsCurrent(context)) notifyStatus({ syncing: false, error: err?.message || '从云端拉取失败' });
        throw err;
    }
}

// ==================== 清理 ====================

export function stopCustomSync() {
    _syncController.abort();
    _syncController = new AbortController();
    _syncGeneration++;
    clearSyncTimer();
    clearPullTimer();
    if (_idleTimer) { clearTimeout(_idleTimer); _idleTimer = null; }
    _pendingKeys.clear();
    _firstSyncAfterLogin = true;
    notifyStatus({ pending: 0, syncing: false });
}

export function setupCustomBeforeUnloadSync() {
    if (typeof window === 'undefined') return;
    if (!_autoSetupDone) {
        _autoSetupDone = true;
        window.addEventListener('beforeunload', () => {
            if (_pendingKeys.size > 0) flushSync().catch(() => {});
        });
        // 页面从后台切回前台时立即拉一次：别的设备刚改的能马上被发现
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && isCustomSignedIn()) pullFromCloud().catch(() => {});
        });
    }
    // 前台定时轮询拉取 + 恢复会话/启动后先拉一次（补上“只上传不下载”的缺口）
    ensurePullTimer();
    if (isCustomSignedIn()) pullFromCloud().catch(() => {});
}
