import { localizeApiError } from './api-error-i18n.js';

const MAX_EVENT_CHARS = 1024 * 1024;
const encoder = new TextEncoder();

export function aiStreamError(code = 'AI_STREAM_INCOMPLETE') {
    return Object.assign(new Error('AI generation did not complete'), { code });
}

// Demand-driven parsing: retain at most one input chunk and a bounded event,
// and stop the underlying reader on abort or when the consumer leaves early.
export async function* readSseData(body, { signal, maxEventChars = MAX_EVENT_CHARS, onActivity } = {}) {
    signal?.throwIfAborted();
    if (!body) throw aiStreamError();
    const reader = body.getReader();
    const decoder = new TextDecoder();
    const cancel = () => { reader.cancel(signal?.reason).catch(() => {}); };
    signal?.addEventListener('abort', cancel, { once: true });
    let buffer = '', data = '', hasData = false;
    try {
        while (true) {
            signal?.throwIfAborted();
            const { done, value } = await reader.read();
            signal?.throwIfAborted();
            // 心跳注释也算上游还活着
            if (!done && value?.length) onActivity?.();
            buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
            let end;
            while ((end = buffer.indexOf('\n')) !== -1) {
                const line = buffer.slice(0, end).replace(/\r$/, '');
                buffer = buffer.slice(end + 1);
                if (line.length > maxEventChars) throw aiStreamError('AI_STREAM_TOO_LARGE');
                if (!line) {
                    if (hasData) yield data.slice(0, -1);
                    data = ''; hasData = false;
                } else if (line.startsWith('data:')) {
                    data += line.slice(5).replace(/^ /, '') + '\n';
                    hasData = true;
                    if (data.length > maxEventChars) throw aiStreamError('AI_STREAM_TOO_LARGE');
                }
            }
            if (buffer.length > maxEventChars) throw aiStreamError('AI_STREAM_TOO_LARGE');
            if (done) {
                // Some compatible providers omit the final blank line. A
                // complete terminal payload still has to be recognized below.
                if (buffer.startsWith('data:')) { data += buffer.slice(5).replace(/^ /, '') + '\n'; hasData = true; }
                if (data.length > maxEventChars) throw aiStreamError('AI_STREAM_TOO_LARGE');
                if (hasData) yield data.slice(0, -1);
                return;
            }
        }
    } finally {
        signal?.removeEventListener('abort', cancel);
        await reader.cancel().catch(() => {});
        reader.releaseLock();
    }
}

function parsePayload(data) {
    try { return JSON.parse(data); }
    catch { throw aiStreamError('AI_STREAM_INVALID'); }
}

export async function* readAiEvents(response, signal, text) {
    try {
        for await (const data of readSseData(response.body, { signal })) {
            if (data === '[DONE]') return;
            const event = parsePayload(data);
            if (event.error || ['failed', 'incomplete', 'cancelled'].includes(event.status)) {
                const error = aiStreamError(event.code || 'AI_STREAM_FAILED');
                error.payload = event;
                if (event.status === 'cancelled') error.name = 'AbortError';
                throw error;
            }
            yield event;
        }
        throw aiStreamError();
    } catch (error) {
        signal?.throwIfAborted();
        const knownCode = typeof error?.code === 'string' && /^(AI_STREAM_|AI_GENERATION_)/.test(error.code);
        const failure = knownCode || error?.name === 'AbortError' ? error : aiStreamError();
        if (text) failure.message = localizeApiError(failure.payload || { code: failure.code }, text) || failure.message;
        throw failure;
    }
}

function failureEvent(error, signal) {
    const reason = signal.aborted ? signal.reason : error;
    if (reason?.name === 'AbortError') return { status: 'cancelled', code: 'AI_GENERATION_CANCELLED', error: '已停止生成。' };
    if (reason?.name === 'TimeoutError') return { status: 'incomplete', code: 'AI_GENERATION_TIMEOUT', error: '生成超时，内容尚未完成。' };
    const code = String(reason?.code || '').startsWith('AI_STREAM_') ? reason.code : 'AI_STREAM_INCOMPLETE';
    return { status: code === 'AI_STREAM_FAILED' ? 'failed' : 'incomplete', code, error: '生成中断，内容尚未完成，请重试。' };
}

export function streamAiResponse(upstream, lifecycle, mapper, initialEvents = []) {
    lifecycle.streaming = true;
    let cancelled = false;
    async function* packets() {
        try {
            lifecycle.signal.throwIfAborted();
            for (const event of initialEvents) yield event;
            for await (const data of readSseData(upstream.body, { signal: lifecycle.signal, onActivity: lifecycle.touch })) {
                const { events = [], done = false, error } = mapper(data);
                for (const event of events) yield event;
                if (error) throw error;
                if (done) {
                    yield { status: 'done' };
                    yield '[DONE]';
                    return;
                }
            }
            throw aiStreamError();
        } catch (error) {
            if (!cancelled) yield failureEvent(error, lifecycle.signal);
        } finally {
            lifecycle.dispose();
        }
    }
    const iterator = packets();
    return new Response(new ReadableStream({
        async pull(controller) {
            const next = await iterator.next();
            if (cancelled) return;
            if (next.done) controller.close();
            else controller.enqueue(encoder.encode(`data: ${next.value === '[DONE]' ? '[DONE]' : JSON.stringify(next.value)}\n\n`));
        },
        async cancel() {
            cancelled = true;
            lifecycle.abort();
            if (!upstream.body?.locked) await upstream.body?.cancel().catch(() => {});
            await iterator.return();
        },
    }), { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' } });
}

export function createOpenAiMapper() {
    let finishReason;
    return data => {
        if (data === '[DONE]') {
            if (finishReason && finishReason !== 'stop') throw aiStreamError();
            return { done: true };
        }
        const json = parsePayload(data);
        if (json.error) throw aiStreamError('AI_STREAM_FAILED');
        const choice = json.choices?.[0];
        if (choice?.finish_reason) finishReason = choice.finish_reason;
        const delta = choice?.delta;
        const events = [];
        if (delta?.reasoning_content) events.push({ thinking: delta.reasoning_content });
        if (delta?.content) events.push({ text: delta.content });
        if (json.usage) {
            const usage = json.usage;
            const cachedTokens = usage.prompt_cache_hit_tokens || usage.prompt_tokens_details?.cached_tokens || 0;
            events.push({ usage: {
                promptTokens: usage.prompt_tokens || 0, completionTokens: usage.completion_tokens || 0,
                totalTokens: usage.total_tokens || 0, cachedTokens,
                cacheMissTokens: usage.prompt_cache_miss_tokens ?? Math.max(0, (usage.prompt_tokens || 0) - cachedTokens),
            } });
        }
        const sources = (delta?.annotations || []).filter(a => a.type === 'url_citation' && a.url_citation)
            .map(a => ({ title: a.url_citation.title || '', uri: a.url_citation.url || '' }));
        if (sources.length) events.push({ grounding: { searchQueries: [], sources, supports: [] } });
        return { events };
    };
}

export function createClaudeMapper() {
    let stopReason, promptTokens = 0, cachedTokens = 0;
    return data => {
        const json = parsePayload(data), events = [];
        if (json.type === 'error' || json.error) throw aiStreamError('AI_STREAM_FAILED');
        if (json.type === 'content_block_delta') {
            if (json.delta?.type === 'text_delta') events.push({ text: json.delta.text });
            if (json.delta?.type === 'thinking_delta') events.push({ thinking: json.delta.thinking });
        }
        if (json.type === 'message_start') {
            promptTokens = json.message?.usage?.input_tokens || 0;
            cachedTokens = json.message?.usage?.cache_read_input_tokens || 0;
        }
        if (json.type === 'message_delta') {
            stopReason = json.delta?.stop_reason || stopReason;
            const completionTokens = json.usage?.output_tokens || 0;
            events.push({ usage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens, cachedTokens } });
        }
        if (json.type === 'message_stop') {
            if (stopReason && !['end_turn', 'stop_sequence'].includes(stopReason)) throw aiStreamError();
            return { events, done: true };
        }
        return { events };
    };
}

export function createGeminiMapper() {
    return data => {
        const json = parsePayload(data), events = [];
        if (json.error) throw aiStreamError('AI_STREAM_FAILED');
        const candidate = json.candidates?.[0];
        for (const part of candidate?.content?.parts || []) {
            if (part.thought && part.text) events.push({ thinking: part.text });
            else if (part.executableCode) events.push({ codeExec: { code: part.executableCode.code, language: part.executableCode.language || 'python' } });
            else if (part.codeExecutionResult) events.push({ codeResult: { output: part.codeExecutionResult.output, outcome: part.codeExecutionResult.outcome } });
            else if (part.text) events.push({ text: part.text });
        }
        const grounding = candidate?.groundingMetadata;
        if (grounding) events.push({ grounding: {
            searchQueries: grounding.webSearchQueries || [],
            sources: (grounding.groundingChunks || []).map(c => ({ title: c.web?.title || '', uri: c.web?.uri || '' })),
            supports: (grounding.groundingSupports || []).map(s => ({ text: s.segment?.text || '', indices: s.groundingChunkIndices || [] })),
        } });
        const usage = json.usageMetadata;
        if (usage) events.push({ usage: {
            promptTokens: usage.promptTokenCount || 0,
            completionTokens: (usage.candidatesTokenCount || 0) + (usage.thoughtsTokenCount || 0),
            totalTokens: usage.totalTokenCount || 0, cachedTokens: usage.cachedContentTokenCount || 0,
        } });
        if (json.promptFeedback?.blockReason || (candidate?.finishReason && candidate.finishReason !== 'STOP')) {
            return { events, error: aiStreamError() };
        }
        return { events, done: candidate?.finishReason === 'STOP' };
    };
}
