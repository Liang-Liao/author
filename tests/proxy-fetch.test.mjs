import assert from 'node:assert/strict';
import http from 'node:http';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { Agent } from 'undici';

const proxyUrl = new URL('../app/lib/proxy-fetch.js', import.meta.url);
const securityUrl = new URL('../app/lib/server-security.mjs', import.meta.url);
const endpoint = 'https://api.example.test/v1';
let instance = 0;

async function fixture(t, { agent = class {}, lookup = async () => [{ address: '93.184.216.34', family: 4 }], env = {} } = {}) {
    for (const [name, value] of Object.entries({
        AUTHOR_DESKTOP_CAPABILITY: undefined,
        AUTHOR_ALLOW_PRIVATE_NETWORK: undefined,
        NEXT_PUBLIC_DEPLOYMENT_TARGET: 'official-web',
        ...env,
    })) {
        const previous = process.env[name];
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
        t.after(() => {
            if (previous === undefined) delete process.env[name];
            else process.env[name] = previous;
        });
    }
    const id = ++instance;
    const mockUrl = `data:text/javascript,${encodeURIComponent(`
        // fixture ${id}
        export let Agent, lookup;
        export function configure(agent, resolver) { Agent = agent; lookup = resolver; }
    `)}`;
    (await import(mockUrl)).configure(agent, lookup);
    const securityInstance = `${securityUrl.href}?test=${id}`;
    const hooks = registerHooks({
        resolve(specifier, context, nextResolve) {
            if (context.parentURL?.startsWith(proxyUrl.href)) {
                if (specifier === 'undici') return { url: mockUrl, shortCircuit: true };
                if (specifier === './server-security.mjs') return { url: securityInstance, shortCircuit: true };
            }
            if (context.parentURL === securityInstance && specifier === 'node:dns/promises') {
                return { url: mockUrl, shortCircuit: true };
            }
            return nextResolve(specifier, context);
        },
    });
    try { return await import(`${proxyUrl.href}?test=${id}`); }
    finally { hooks.deregister(); }
}

const blocked = error => error?.code === 'OUTBOUND_REQUEST_BLOCKED';
const redirect = (location, status = 302) => new Response('redirect body', { status, headers: { location } });

test('pre-aborted transport does not resolve DNS or start a request', async t => {
    const { proxyFetch } = await fixture(t, { lookup: async () => { throw new Error('Must not resolve'); } });
    const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Must not fetch'); });
    const controller = new AbortController(); controller.abort();
    await assert.rejects(proxyFetch(endpoint, { signal: controller.signal }), { name: 'AbortError' });
    assert.equal(fetch.mock.callCount(), 0);
});

test('cancellation between redirects prevents another request', async t => {
    const { proxyFetch } = await fixture(t);
    const controller = new AbortController();
    const response = redirect('/next');
    t.mock.method(response.body, 'cancel', async () => controller.abort());
    const fetch = t.mock.method(globalThis, 'fetch', async (_url, options) => {
        assert.equal(options.signal, controller.signal);
        return response;
    });
    await assert.rejects(proxyFetch(endpoint, { signal: controller.signal }), { name: 'AbortError' });
    assert.equal(fetch.mock.callCount(), 1);
});

test('private, non-HTTP and credential-bearing initial URLs do not start a request', async t => {
    const { proxyFetch } = await fixture(t);
    const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Must not fetch'); });
    for (const url of ['http://127.0.0.1/', 'http://10.0.0.1/', 'http://[::1]/', 'file:///test', 'https://user:pass@api.example.test/']) {
        await assert.rejects(proxyFetch(url), blocked);
    }
    assert.equal(fetch.mock.callCount(), 0);
});

test('redirects cannot reach private, link-local, encoded loopback or non-HTTP targets', async t => {
    for (const location of [
        'http://127.0.0.1/', 'http://10.0.0.1/', 'http://169.254.169.254/',
        'http://[::1]/', 'http://[fd00::1]/', 'http://[fe80::1]/',
        'http://2130706433/', 'http://0x7f000001/', '//localhost/', 'file:///test',
    ]) {
        await t.test(location, async t => {
            const { proxyFetch } = await fixture(t);
            const result = redirect(location);
            let cancelled = false;
            t.mock.method(result.body, 'cancel', async () => { cancelled = true; });
            const calls = [];
            t.mock.method(globalThis, 'fetch', async (url, options) => {
                calls.push({ url, options });
                return result;
            });
            await assert.rejects(proxyFetch(endpoint, { redirect: 'follow' }), blocked);
            assert.equal(calls.length, 1);
            assert.equal(calls[0].options.redirect, 'manual');
            assert.equal(cancelled, true);
        });
    }
});

test('cross-origin redirects never forward credentials or request content', async t => {
    const { proxyFetch } = await fixture(t);
    const calls = [];
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        calls.push({ url, options });
        return redirect('https://other.example.test/collect', 307);
    });
    await assert.rejects(proxyFetch(endpoint, {
        method: 'POST', headers: { Authorization: 'Bearer synthetic', 'x-api-key': 'synthetic' }, body: 'synthetic draft',
    }), blocked);
    assert.equal(calls.length, 1);
});

test('same-origin redirects are manually checked and preserve the caller options', async t => {
    let lookups = 0;
    const { proxyFetch } = await fixture(t, { lookup: async () => { lookups++; return [{ address: '93.184.216.34', family: 4 }]; } });
    const calls = [];
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        calls.push({ url: String(url), options });
        return calls.length === 1 ? redirect('/v2', 307) : new Response('ok');
    });
    const options = { method: 'POST', body: 'synthetic draft', headers: { Authorization: 'Bearer synthetic' }, signal: AbortSignal.timeout(3000) };
    assert.equal(await (await proxyFetch(endpoint, options)).text(), 'ok');
    assert.equal(calls[1].url, 'https://api.example.test/v2');
    assert.equal(calls[1].options.body, options.body);
    assert.equal(new Headers(calls[1].options.headers).get('authorization'), 'Bearer synthetic');
    assert.equal(calls[1].options.signal, options.signal);
    assert.ok(calls.every(call => call.options.redirect === 'manual'));
    assert.ok(lookups >= 2);
    assert.equal(options.redirect, undefined);
});

test('a later hop and a DNS change are checked before another fetch', async t => {
    let lookups = 0;
    const { proxyFetch } = await fixture(t, { lookup: async () => [{ address: ++lookups === 1 ? '93.184.216.34' : '127.0.0.1', family: 4 }] });
    const fetch = t.mock.method(globalThis, 'fetch', async () => redirect('/next'));
    await assert.rejects(proxyFetch(endpoint), blocked);
    assert.equal(fetch.mock.callCount(), 1);
});

test('a private target is blocked after multiple same-origin hops', async t => {
    const { proxyFetch } = await fixture(t);
    const calls = [];
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        calls.push({ url, options });
        return redirect(calls.length < 3 ? `/hop${calls.length}` : 'http://127.0.0.1/');
    });
    await assert.rejects(proxyFetch(endpoint), blocked);
    assert.equal(calls.length, 3);
    assert.ok(calls.every(call => call.options.redirect === 'manual'));
});

test('public requests cannot override the protected dispatcher or use an untrusted proxy', async t => {
    const { proxyFetch } = await fixture(t);
    const suppliedDispatcher = {};
    const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
        assert.notEqual(options.dispatcher, suppliedDispatcher);
        return new Response('ok');
    });
    await proxyFetch(endpoint, { dispatcher: suppliedDispatcher });
    await assert.rejects(proxyFetch(endpoint, {}, 'http://127.0.0.1:8888'), blocked);
    assert.equal(fetch.mock.callCount(), 1);
});

test('redirect method and body handling matches HTTP semantics', async t => {
    for (const [method, status, nextMethod] of [
        ['POST', 301, 'GET'], ['POST', 302, 'GET'], ['PUT', 303, 'GET'],
        ['HEAD', 303, 'HEAD'], ['POST', 307, 'POST'], ['PUT', 308, 'PUT'], ['PROPFIND', 301, 'PROPFIND'],
    ]) {
        await t.test(`${method} ${status}`, async t => {
            const { proxyFetch } = await fixture(t);
            const calls = [];
            t.mock.method(globalThis, 'fetch', async (url, options) => {
                calls.push(options);
                return calls.length === 1 ? redirect('/next', status) : new Response('ok');
            });
            const body = method === 'HEAD' ? undefined : 'synthetic';
            await proxyFetch(endpoint, { method, body, headers: { 'Content-Type': 'text/plain', 'Content-Length': '9' } });
            assert.equal(calls[1].method, nextMethod);
            if (nextMethod === 'GET') {
                assert.equal(calls[1].body, undefined);
                assert.equal(new Headers(calls[1].headers).has('content-type'), false);
                assert.equal(new Headers(calls[1].headers).has('content-length'), false);
            } else {
                assert.equal(calls[1].body, body);
            }
        });
    }
});

test('manual and error redirect modes do not follow and redirect loops are bounded', async t => {
    const { proxyFetch } = await fixture(t);
    const calls = [];
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        calls.push(options);
        return redirect('/loop');
    });
    assert.equal((await proxyFetch(endpoint, { redirect: 'manual' })).status, 302);
    assert.equal(calls.length, 1);
    await assert.rejects(proxyFetch(endpoint, { redirect: 'error' }));
    assert.equal(calls.length, 2);
    await assert.rejects(proxyFetch(endpoint));
    assert.ok(calls.length <= 8);
});

test('a consumed streaming request body is not replayed on redirect', async t => {
    const { proxyFetch } = await fixture(t);
    const fetch = t.mock.method(globalThis, 'fetch', async () => redirect('/next', 307));
    await assert.rejects(proxyFetch(endpoint, { method: 'POST', body: new ReadableStream(), duplex: 'half' }));
    assert.equal(fetch.mock.callCount(), 1);
});

test('an explicitly trusted private endpoint still works', async t => {
    const { proxyFetch } = await fixture(t);
    const fetch = t.mock.method(globalThis, 'fetch', async () => new Response('local model'));
    const result = await proxyFetch('http://127.0.0.1:8000/v1', {}, undefined, { allowPrivateNetwork: true });
    assert.equal(await result.text(), 'local model');
    assert.equal(fetch.mock.callCount(), 1);
});

test('self-hosted operators can opt in to LAN and loopback model endpoints', async t => {
    const { proxyFetch } = await fixture(t, { env: { NEXT_PUBLIC_DEPLOYMENT_TARGET: undefined, AUTHOR_ALLOW_PRIVATE_NETWORK: '1' } });
    const fetch = t.mock.method(globalThis, 'fetch', async () => new Response('local model'));
    for (const url of ['http://192.168.1.10:11434/v1', 'http://host.docker.internal:1234/v1', 'http://127.0.0.1:8000/v1']) {
        assert.equal(await (await proxyFetch(url)).text(), 'local model');
    }
    assert.equal(fetch.mock.callCount(), 3);
});

test('self-hosted builds stay public-only without the opt-in and say how to enable it', async t => {
    const { proxyFetch } = await fixture(t, { env: { NEXT_PUBLIC_DEPLOYMENT_TARGET: undefined } });
    const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Must not fetch'); });
    await assert.rejects(proxyFetch('http://192.168.1.10:11434/v1'), error => blocked(error)
        && error.message.includes('AUTHOR_ALLOW_PRIVATE_NETWORK'));
    assert.equal(fetch.mock.callCount(), 0);
});

test('the official web build ignores the private-network opt-in', async t => {
    const { proxyFetch } = await fixture(t, { env: { AUTHOR_ALLOW_PRIVATE_NETWORK: '1' } });
    const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Must not fetch'); });
    await assert.rejects(proxyFetch('http://192.168.1.10:11434/v1'), error => blocked(error)
        && !error.message.includes('AUTHOR_ALLOW_PRIVATE_NETWORK'));
    await assert.rejects(proxyFetch(endpoint, {}, 'http://127.0.0.1:8888'), blocked);
    assert.equal(fetch.mock.callCount(), 0);
});

test('actual fetch and installed Agent cannot follow a synthetic public hop into loopback', async t => {
    const hostname = 'fixture.example.test';
    const lookups = [];
    const agents = [];
    let targetHits = 0;
    const target = http.createServer((req, res) => { targetHits++; res.end('synthetic target'); });
    const first = http.createServer((req, res) => {
        if (req.url === '/ok') { res.end('synthetic public endpoint'); return; }
        res.writeHead(302, { Location: req.url === '/start' ? '/ok' : `http://127.0.0.1:${target.address().port}/` });
        res.end();
    });
    const listen = server => new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    t.after(async () => {
        await Promise.allSettled(agents.map(agent => agent.destroy()));
        first.closeAllConnections(); target.closeAllConnections();
        await Promise.allSettled([new Promise(resolve => first.close(resolve)), new Promise(resolve => target.close(resolve))]);
    });
    await listen(first); await listen(target);
    class FixtureAgent extends Agent {
        constructor(options) {
            const checkedLookup = options.connect.lookup;
            super({ ...options, connect: { ...options.connect, lookup(host, opts, callback) {
                lookups.push(host);
                checkedLookup(host, opts, (error, address, family) => {
                    if (error) return callback(error);
                    if (host !== hostname) return callback(new Error('Unexpected fixture target'));
                    // Route only the approved synthetic first hop to our local test server.
                    if (Array.isArray(address)) callback(null, address.map(record => ({ ...record, address: '127.0.0.1' })));
                    else callback(null, '127.0.0.1', family);
                });
            } } });
            agents.push(this);
        }
    }
    const { proxyFetch } = await fixture(t, { agent: FixtureAgent, lookup: async host => {
        assert.equal(host, hostname);
        return [{ address: '93.184.216.34', family: 4 }];
    } });
    const base = `http://${hostname}:${first.address().port}`;
    const options = { signal: AbortSignal.timeout(5000) };
    assert.equal(await (await proxyFetch(`${base}/start`, options)).text(), 'synthetic public endpoint');
    await assert.rejects(proxyFetch(`${base}/private`, options), blocked);
    assert.equal(targetHits, 0);
    assert.ok(lookups.every(host => host === hostname));
});
