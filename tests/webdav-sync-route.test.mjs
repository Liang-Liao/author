import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

import { OutboundRequestBlockedError } from '../app/lib/server-security.mjs';

const routeUrl = new URL('../app/api/sync/webdav/route.js', import.meta.url);
let instance = 0;

// 官网与桌面端走 proxyFetch 的不同分支，失败原因必须能从返回里区分出来，
// 否则"桌面能同步、官网不能"只剩一句无法排查的 "WebDAV 请求失败"。
async function fixture(t) {
    const id = ++instance;
    const env = { respond: null };
    const mockUrl = `data:text/javascript,${encodeURIComponent(`
        let impl; export const configure = value => { impl = value; };
        export const proxyFetch = (...args) => impl.respond(...args);
        export const NextResponse = { json: (data, init) => Response.json(data, init) };
        // fixture ${id}
    `)}`;
    (await import(mockUrl)).configure(env);

    const hooks = registerHooks({ resolve(specifier, context, nextResolve) {
        if (context.parentURL?.startsWith(routeUrl.href)
            && ['next/server', '../../../lib/proxy-fetch'].includes(specifier)) {
            return { url: mockUrl, shortCircuit: true };
        }
        return nextResolve(specifier, context);
    } });

    const warn = console.warn;
    console.warn = () => {};
    t.after(() => { hooks.deregister(); console.warn = warn; });

    const api = await import(`${routeUrl.href}?fixture=${id}`);
    const call = async (payload = {}) => {
        const body = {
            action: 'get',
            path: 'AuthorSync/manifest.json',
            config: { endpoint: 'https://dav.example.com/dav/', username: 'u@example.com', password: 'app-secret-pw' },
            ...payload,
        };
        const res = await api.POST(new Request('https://app.example.com/api/sync/webdav', {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
        }));
        return { status: res.status, data: await res.json() };
    };
    return { env, call };
}

test('上游认证失败带稳定机器码，而不是只回一句请求失败', async t => {
    const { env, call } = await fixture(t);
    env.respond = async () => new Response('denied', { status: 401 });
    const { status, data } = await call();
    assert.equal(status, 502);
    assert.equal(data.code, 'WEBDAV_AUTH_FAILED');
    assert.equal(data.upstreamStatus, 401);
});

test('其他上游状态码原样带回，供排查区分', async t => {
    const { env, call } = await fixture(t);
    env.respond = async () => new Response('insufficient storage', { status: 507 });
    const { status, data } = await call();
    assert.equal(status, 502);
    assert.equal(data.code, 'WEBDAV_UPSTREAM_ERROR');
    assert.equal(data.upstreamStatus, 507);
});

test('连不上上游归类为 UNREACHABLE，与配置写错分开', async t => {
    const { env, call } = await fixture(t);
    env.respond = async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } }); };
    const { status, data } = await call();
    assert.equal(status, 502);
    assert.equal(data.code, 'WEBDAV_UPSTREAM_UNREACHABLE');
});

test('出站策略拦截保留自己的机器码', async t => {
    const { env, call } = await fixture(t);
    env.respond = async () => { throw new OutboundRequestBlockedError(); };
    const { status, data } = await call();
    assert.equal(status, 400);
    assert.equal(data.code, 'OUTBOUND_REQUEST_BLOCKED');
});

test('路径非法属于请求问题，不是上游不可达', async t => {
    const { env, call } = await fixture(t);
    env.respond = async () => new Response('', { status: 200 });
    const { status, data } = await call({ path: '../../etc/passwd' });
    assert.equal(status, 400);
    assert.equal(data.code, 'WEBDAV_REQUEST_INVALID');
});

test('读取 404 仍是明确的 missing，不伪装成读到了内容', async t => {
    const { env, call } = await fixture(t);
    env.respond = async () => new Response('', { status: 404 });
    const { status, data } = await call();
    assert.equal(status, 200);
    assert.equal(data.missing, true);
    assert.equal(data.body, undefined);
});

test('上游返回体里的凭据不会随错误回传给浏览器', async t => {
    const { env, call } = await fixture(t);
    env.respond = async () => new Response('auth failed for Basic dXNlcjpwYXNzd29yZA==', { status: 500 });
    const { data } = await call();
    assert.equal(JSON.stringify(data).includes('dXNlcjpwYXNzd29yZA=='), false);
});
