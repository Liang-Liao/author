/**
 * 带代理支持的 fetch 封装
 * Node.js Runtime 下，如果指定了 proxyUrl，使用 undici 的 ProxyAgent
 */
import { Agent } from 'undici';
import {
    assertSafeOutboundUrl,
    isPrivateNetworkAllowedByDeployment,
    OutboundRequestBlockedError,
    redactSensitiveText,
    rejectOfficialProxy,
    secureDnsLookup,
} from './server-security.mjs';

let secureDispatcher;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 5;

function getSecureDispatcher() {
    secureDispatcher ||= new Agent({ connect: { lookup: secureDnsLookup } });
    return secureDispatcher;
}

async function fetchPublicUrl(url, options) {
    let currentUrl = url;
    let requestOptions = { ...options };
    const redirectMode = options.redirect || 'follow';
    if (!['follow', 'manual', 'error'].includes(redirectMode)) throw new TypeError('Invalid redirect mode');

    for (let count = 0; ; count++) {
        options.signal?.throwIfAborted();
        // Every hop is validated here and again by the connection DNS hook.
        currentUrl = await assertSafeOutboundUrl(currentUrl);
        const response = await fetch(currentUrl, {
            ...requestOptions, redirect: 'manual', dispatcher: getSecureDispatcher(),
        });
        if (!REDIRECT_STATUSES.has(response.status) || redirectMode === 'manual') return response;
        const location = response.headers.get('location');
        if (location === null) return response;

        // Release the intermediate response even when its next URL is blocked.
        await response.body?.cancel().catch(() => {});
        if (redirectMode === 'error') throw new OutboundRequestBlockedError('API 地址发生跳转，请直接填写最终地址');
        if (count >= MAX_REDIRECTS) throw new OutboundRequestBlockedError('API 地址跳转次数过多，请检查地址配置');

        let nextUrl;
        try { nextUrl = new URL(location, currentUrl); }
        catch { throw new OutboundRequestBlockedError('API 返回了无效的跳转地址'); }
        // These requests may carry provider-specific keys or manuscript bodies.
        // Keep same-origin redirects, but never forward them to another origin.
        if (nextUrl.origin !== currentUrl.origin) {
            throw new OutboundRequestBlockedError('API 地址跳转到了其他站点，请直接填写最终地址');
        }

        const method = String(requestOptions.method || 'GET').toUpperCase();
        if (((response.status === 301 || response.status === 302) && method === 'POST')
            || (response.status === 303 && method !== 'GET' && method !== 'HEAD')) {
            const headers = new Headers(requestOptions.headers);
            for (const name of ['content-encoding', 'content-language', 'content-location', 'content-type', 'content-length']) headers.delete(name);
            requestOptions = { ...requestOptions, method: 'GET', body: undefined, headers };
        } else if (requestOptions.body?.getReader || requestOptions.body?.[Symbol.asyncIterator]) {
            throw new OutboundRequestBlockedError('此请求无法在跳转后重新发送，请直接填写最终地址');
        }
        currentUrl = nextUrl;
    }
}

export async function proxyFetch(url, options = {}, proxyUrl, policy = {}) {
    options.signal?.throwIfAborted();
    // Electron's proxy.js gate authenticates every request with a per-launch
    // HttpOnly capability before route code can run. Other deployments stay
    // public-network-only unless a narrowly scoped caller opts in, or a trusted
    // self-hosted operator sets AUTHOR_ALLOW_PRIVATE_NETWORK (ignored on official web).
    const allowPrivateNetwork = policy?.allowPrivateNetwork === true
        || Boolean(process.env.AUTHOR_DESKTOP_CAPABILITY)
        || isPrivateNetworkAllowedByDeployment();
    if (!allowPrivateNetwork) {
        rejectOfficialProxy(proxyUrl);
        if (String(proxyUrl || '').trim()) {
            throw new OutboundRequestBlockedError('未授权的请求不能使用自定义代理');
        }
        return fetchPublicUrl(url, options);
    }

    await assertSafeOutboundUrl(url, { allowPrivateNetwork: true });

    if (proxyUrl) {
        try {
            const { ProxyAgent } = await import('undici');
            const agent = new ProxyAgent(proxyUrl);
            return fetch(url, { ...options, dispatcher: agent });
        } catch (e) {
            console.warn('[proxy-fetch] ProxyAgent 创建失败，回退到直连:', redactSensitiveText(e?.message || e, 200));
            return fetch(url, options);
        }
    }
    return fetch(url, options);
}
