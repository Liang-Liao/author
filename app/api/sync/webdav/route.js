import { withApiResources } from '../../../lib/api-resource-guard.js';
import { NextResponse } from 'next/server';
import { proxyFetch } from '../../../lib/proxy-fetch';
import { isAuthorizedDesktopRequest, isOutboundRequestBlocked, redactSensitiveText } from '../../../lib/server-security.mjs';

export const runtime = 'nodejs';

const ALLOWED_ACTIONS = new Set(['get', 'put', 'delete', 'mkcol', 'propfind']);
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);
const MKCOL_OK_STATUSES = new Set([200, 201, 204, 207, 301, 302, 405]);

function isLocalHost(hostname) {
    const host = String(hostname || '').toLowerCase();
    if (LOCAL_HOSTNAMES.has(host)) return true;
    if (host.endsWith('.local')) return true;
    if (/^10\./.test(host)) return true;
    if (/^192\.168\./.test(host)) return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
    if (/^169\.254\./.test(host)) return true;
    if (/^0\./.test(host)) return true;
    if (host === '[::1]') return true;
    if (host.includes(':') && (host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80'))) return true;
    return false;
}

function normalizePath(inputPath) {
    const raw = String(inputPath || '').trim().replace(/\\/g, '/');
    if (!raw || raw === '/') return '';
    if (raw.includes('\0')) {
        throw new Error('Invalid WebDAV path');
    }
    return raw
        .split('/')
        .map(segment => segment.trim())
        .filter(Boolean)
        .map(segment => {
            let decoded = segment;
            try {
                decoded = decodeURIComponent(segment);
            } catch {
                decoded = segment;
            }
            if (
                !decoded ||
                decoded === '.' ||
                decoded === '..' ||
                decoded.includes('/') ||
                decoded.includes('\\') ||
                decoded.includes('\0')
            ) {
                throw new Error('Invalid WebDAV path');
            }
            return encodeURIComponent(decoded);
        })
        .join('/');
}

function normalizeEndpointBaseUrl(parsedBase) {
    const normalizedPath = normalizePath(parsedBase.pathname);
    parsedBase.pathname = normalizedPath ? `/${normalizedPath}/` : '/';
    parsedBase.search = '';
    parsedBase.hash = '';
    return parsedBase.toString();
}

function buildWebDavUrl(endpoint, inputPath, options = {}) {
    const base = String(endpoint || '').trim();
    if (!/^https?:\/\//i.test(base)) {
        throw new Error('WebDAV 地址必须以 http:// 或 https:// 开头');
    }
    const parsedBase = new URL(base);
    if (!options.allowPrivateNetwork && isLocalHost(parsedBase.hostname)) {
        throw new Error('公网部署不允许代理访问本机或内网 WebDAV 地址');
    }
    const normalizedBase = normalizeEndpointBaseUrl(parsedBase);
    let normalizedPath = normalizePath(inputPath);
    if (options.collection && normalizedPath && !normalizedPath.endsWith('/')) {
        normalizedPath = `${normalizedPath}/`;
    }
    return new URL(normalizedPath, normalizedBase).toString();
}

function createAuthHeader(username, password) {
    return `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`;
}

async function proxyWebDav({ action, path, body, config }, options = {}) {
    if (!ALLOWED_ACTIONS.has(action)) {
        throw new Error('Unsupported WebDAV action');
    }
    const endpoint = config?.endpoint;
    const username = config?.username;
    const password = config?.password;
    if (!endpoint || !username || !password) {
        throw new Error('WebDAV 配置不完整');
    }

    const isCollectionAction = action === 'mkcol' || action === 'propfind';
    const url = buildWebDavUrl(endpoint, path, {
        ...options,
        collection: isCollectionAction,
    });
    const headers = {
        Authorization: createAuthHeader(username, password),
        'User-Agent': 'Author-WebDAV-Sync/1.0',
    };
    let method = 'GET';
    let requestBody;

    if (action === 'put') {
        method = 'PUT';
        headers['Content-Type'] = 'application/json; charset=utf-8';
        requestBody = typeof body === 'string' ? body : JSON.stringify(body ?? null);
    } else if (action === 'delete') {
        method = 'DELETE';
    } else if (action === 'mkcol') {
        method = 'MKCOL';
    } else if (action === 'propfind') {
        method = 'PROPFIND';
        headers.Depth = '0';
    }

    const response = await proxyFetch(url, {
        method,
        headers,
        body: requestBody,
        cache: 'no-store',
    }, undefined, { allowPrivateNetwork: options.allowPrivateNetwork === true });

    if (action === 'get') {
        if (response.status === 404) return { ok: true, missing: true, status: 404 };
        if (!response.ok) {
            return { ok: false, status: response.status, body: await response.text().catch(() => '') };
        }
        return { ok: true, status: response.status, body: await response.text() };
    }

    if (action === 'propfind') {
        if (response.status === 404) return { ok: true, missing: true, status: 404 };
        if ([200, 207, 301, 302].includes(response.status)) {
            return { ok: true, status: response.status, exists: true };
        }
        return { ok: false, status: response.status, body: await response.text().catch(() => '') };
    }

    if (action === 'mkcol') {
        if (MKCOL_OK_STATUSES.has(response.status)) {
            return { ok: true, status: response.status };
        }
        if (response.status === 409) {
            const exists = await proxyFetch(url, {
                method: 'PROPFIND',
                headers: {
                    ...headers,
                    Depth: '0',
                },
                cache: 'no-store',
            }, undefined, { allowPrivateNetwork: options.allowPrivateNetwork === true });
            if ([200, 207, 301, 302].includes(exists.status)) {
                return { ok: true, status: response.status, existed: true };
            }
            return { ok: false, status: 409, body: await response.text().catch(() => '') };
        }
    }

    if (action === 'delete' && response.status === 404) {
        return { ok: true, missing: true, status: 404 };
    }

    if (![200, 201, 204].includes(response.status)) {
        return { ok: false, status: response.status, body: await response.text().catch(() => '') };
    }

    return { ok: true, status: response.status };
}

// 失败分类：桌面端与官网走的是 proxyFetch 的两条不同分支（桌面端带
// AUTHOR_DESKTOP_CAPABILITY 直连，官网要过 DNS / 公网 IP 校验），所以"桌面能同步、
// 官网不能"必须能从返回里区分出来。每条失败都带稳定 code 与上游状态，
// 前端按 code 出三语文案并写入诊断日志，不再只剩一句"WebDAV 请求失败"。
function upstreamFailure(result) {
    if (result?.status === 401 || result?.status === 403) {
        return { code: 'WEBDAV_AUTH_FAILED', error: 'WebDAV 认证失败，请检查账号和应用密码' };
    }
    if (result?.status === 404) return { code: 'WEBDAV_PATH_NOT_FOUND', error: 'WebDAV 路径不存在' };
    if (result?.status === 409) return { code: 'WEBDAV_COLLECTION_CONFLICT', error: 'WebDAV 目录不存在或无法创建' };
    if (!result?.status) return { code: 'WEBDAV_UPSTREAM_ERROR', error: 'WebDAV 请求失败' };
    return { code: 'WEBDAV_UPSTREAM_ERROR', error: `WebDAV 请求失败 (${result.status})` };
}

// 上游连不上（DNS 失败、连接被拒、超时）与"地址或配置写错"是两类问题，
// 排障方向不同：前者查网络与出站策略，后者查用户填的配置。
function isUpstreamUnreachable(error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return true;
    if (error?.cause) return true;
    return /fetch failed|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNRESET|socket hang up/i
        .test(String(error?.message || ''));
}

function logWebDav(fields) {
    console.warn('[webdav]', JSON.stringify(fields));
}

async function handlePOST(request) {
    const started = Date.now();
    let action = '';
    try {
        const payload = await request.json();
        action = String(payload?.action || '');
        const result = await proxyWebDav(payload || {}, {
            allowPrivateNetwork: isAuthorizedDesktopRequest(request),
        });
        if (!result.ok) {
            const failure = upstreamFailure(result);
            logWebDav({
                action, phase: 'upstream', code: failure.code, upstreamStatus: result.status,
                ms: Date.now() - started, detail: redactSensitiveText(result.body || '', 200),
            });
            return NextResponse.json(
                { ...failure, status: result.status, upstreamStatus: result.status },
                { status: 502 },
            );
        }
        return NextResponse.json(result);
    } catch (error) {
        if (isOutboundRequestBlocked(error)) {
            logWebDav({
                action, phase: 'outbound-blocked', code: error.code, ms: Date.now() - started,
                detail: redactSensitiveText(error.message || '', 200),
            });
            return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
        }
        const unreachable = isUpstreamUnreachable(error);
        const code = unreachable ? 'WEBDAV_UPSTREAM_UNREACHABLE' : 'WEBDAV_REQUEST_INVALID';
        logWebDav({
            action, phase: unreachable ? 'connect' : 'request', code, ms: Date.now() - started,
            detail: redactSensitiveText(error?.message || '', 200),
            cause: redactSensitiveText(error?.cause?.code || error?.cause?.message || '', 120),
        });
        return NextResponse.json(
            { error: redactSensitiveText(error?.message || 'WebDAV 请求失败', 200), code },
            { status: unreachable ? 502 : 400 },
        );
    }
}

export const POST = withApiResources('/api/sync/webdav', handlePOST);
