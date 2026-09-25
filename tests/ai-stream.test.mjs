import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { createGenerationLifecycle, generationAbortResponse } from '../app/lib/ai-request-lifecycle.js';
import { readSseData, readAiEvents, streamAiResponse, createOpenAiMapper, createClaudeMapper, createGeminiMapper } from '../app/lib/ai-stream.js';

const encode = value => new TextEncoder().encode(value);
const sse = value => `data: ${typeof value === 'string' ? value : JSON.stringify(value)}\n\n`;
const openText = text => ({ choices: [{ delta: { content: text } }] });
const collect = async iterator => { const values = []; for await (const value of iterator) values.push(value); return values; };
const forward = (data, mapper = createOpenAiMapper()) => streamAiResponse(new Response(data), createGenerationLifecycle(), mapper);

test('SSE parser handles split UTF-8, CRLF, comments and multiple data lines', async () => {
    const bytes = encode(': heartbeat\r\ndata: 你\r\ndata: 好\r\n\r\ndata: [DONE]');
    const stream = new ReadableStream({ start(c) { for (const b of bytes) c.enqueue(Uint8Array.of(b)); c.close(); } });
    assert.deepEqual(await collect(readSseData(stream)), ['你\n好', '[DONE]']);
});

test('SSE parser rejects oversized unfinished frames and cancels the reader', async () => {
    let cancelled = false;
    const stream = new ReadableStream({ start(c) { c.enqueue(encode('data: ' + 'x'.repeat(33))); }, cancel() { cancelled = true; } });
    await assert.rejects(collect(readSseData(stream, { maxEventChars: 32 })), { code: 'AI_STREAM_TOO_LARGE' });
    assert.equal(cancelled, true);
});

test('completed OpenAI stream preserves reasoning, usage and explicit completion', async () => {
    const input = sse({ choices: [{ delta: { content: '正文', reasoning_content: '思考' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14, prompt_cache_hit_tokens: 3 } }) + sse('[DONE]');
    const events = await collect(readAiEvents(forward(input)));
    assert.equal(events.find(e => e.text)?.text, '正文');
    assert.equal(events.find(e => e.thinking)?.thinking, '思考');
    assert.equal(events.find(e => e.usage)?.usage.cacheMissTokens, 7);
    assert.deepEqual(events.at(-1), { status: 'done' });
});

for (const [name, suffix, code] of [
    ['EOF', '', 'AI_STREAM_INCOMPLETE'],
    ['invalid JSON', sse('{invalid'), 'AI_STREAM_INVALID'],
    ['upstream error', sse({ error: { message: 'private provider detail' } }), 'AI_STREAM_FAILED'],
    ['token limit', sse({ choices: [{ finish_reason: 'length' }] }) + sse('[DONE]'), 'AI_STREAM_INCOMPLETE'],
]) test(`OpenAI ${name} preserves partial text and never signals done`, async () => {
    const response = forward(sse(openText('已收到的文字')) + suffix);
    const events = [];
    await assert.rejects(async () => { for await (const event of readAiEvents(response)) events.push(event); }, { code });
    assert.equal(events[0].text, '已收到的文字');
    assert.equal(events.some(e => e.status === 'done'), false);
});

test('raw network failure becomes a visible incomplete event without leaking details', async () => {
    let pulls = 0;
    const upstream = new Response(new ReadableStream({ pull(c) { if (pulls++ === 0) c.enqueue(encode(sse(openText('partial')))); else c.error(new Error('secret-provider-token')); } }));
    const result = await streamAiResponse(upstream, createGenerationLifecycle(), createOpenAiMapper()).text();
    assert.match(result, /partial/);
    assert.match(result, /AI_STREAM_INCOMPLETE/);
    assert.doesNotMatch(result, /\[DONE\]|secret-provider-token/);
});

test('manual abort interrupts a blocked upstream read and reports cancelled', async () => {
    let cancelled = false;
    const parent = new AbortController();
    const lifecycle = createGenerationLifecycle(parent.signal);
    const upstream = new Response(new ReadableStream({ cancel() { cancelled = true; } }));
    const result = streamAiResponse(upstream, lifecycle, createOpenAiMapper()).text();
    await delay(0);
    parent.abort();
    assert.match(await result, /AI_GENERATION_CANCELLED/);
    assert.equal(cancelled, true);
    assert.equal(lifecycle.signal.aborted, true);
});

test('timeout interrupts a blocked read and reports incomplete instead of cancelled', async () => {
    let cancelled = false;
    const lifecycle = createGenerationLifecycle(undefined, 10);
    const upstream = new Response(new ReadableStream({ cancel() { cancelled = true; } }));
    const result = await streamAiResponse(upstream, lifecycle, createOpenAiMapper()).text();
    assert.match(result, /AI_GENERATION_TIMEOUT/);
    assert.doesNotMatch(result, /\[DONE\]/);
    assert.equal(cancelled, true);
    assert.equal(generationAbortResponse(lifecycle).status, 504);
});

test('a slow model that keeps producing output is not cut off by the timeout', async () => {
    const lifecycle = createGenerationLifecycle(undefined, 40);
    const upstream = new Response(new ReadableStream({
        async start(c) {
            for (let i = 0; i < 8; i++) {
                await delay(15);
                c.enqueue(encode(sse(openText(`片段${i}`))));
            }
            // 心跳注释同样说明上游还活着
            for (let i = 0; i < 3; i++) {
                await delay(15);
                c.enqueue(encode(': keep-alive\n\n'));
            }
            c.enqueue(encode(sse({ choices: [{ delta: {}, finish_reason: 'stop' }] }) + sse('[DONE]')));
            c.close();
        },
    }));
    const result = await streamAiResponse(upstream, lifecycle, createOpenAiMapper()).text();
    assert.match(result, /片段7/);
    assert.match(result, /\[DONE\]/);
    assert.doesNotMatch(result, /AI_GENERATION_TIMEOUT/);
});

test('silence after partial output still times out and keeps the partial text', async () => {
    let cancelled = false;
    const lifecycle = createGenerationLifecycle(undefined, 20);
    const upstream = new Response(new ReadableStream({
        start(c) { c.enqueue(encode(sse(openText('已写部分')))); },
        cancel() { cancelled = true; },
    }));
    const result = await streamAiResponse(upstream, lifecycle, createOpenAiMapper()).text();
    assert.match(result, /已写部分/);
    assert.match(result, /AI_GENERATION_TIMEOUT/);
    assert.doesNotMatch(result, /\[DONE\]/);
    assert.equal(cancelled, true);
});

test('activity after a generation has finished does not restart its timer', async () => {
    const lifecycle = createGenerationLifecycle(undefined, 10);
    lifecycle.dispose();
    lifecycle.touch();
    await delay(30);
    assert.equal(lifecycle.signal.aborted, false);
});

test('cancelling downstream aborts the upstream fetch signal and reader', async () => {
    let cancelled = false;
    const lifecycle = createGenerationLifecycle();
    const upstream = new Response(new ReadableStream({ start(c) { c.enqueue(encode(sse(openText('first')))); }, cancel() { cancelled = true; } }));
    const reader = streamAiResponse(upstream, lifecycle, createOpenAiMapper()).body.getReader();
    assert.match(new TextDecoder().decode((await reader.read()).value), /first/);
    await reader.cancel();
    assert.equal(lifecycle.signal.aborted, true);
    assert.equal(cancelled, true);
});

test('a paused downstream does not eagerly drain upstream', async () => {
    let pulled = 0, cancelled = false;
    const upstream = new Response(new ReadableStream({ pull(c) { pulled++; c.enqueue(encode(sse(openText('x')))); }, cancel() { cancelled = true; } }));
    const response = streamAiResponse(upstream, createGenerationLifecycle(), createOpenAiMapper());
    await delay(10);
    assert.ok(pulled <= 2, `unexpectedly drained ${pulled} chunks`);
    await response.body.cancel();
    assert.equal(cancelled, true);
});

test('client rejects EOF without the terminal marker even after a done status', async () => {
    await assert.rejects(collect(readAiEvents(new Response(sse({ status: 'done' })))), { code: 'AI_STREAM_INCOMPLETE' });
});

test('client transport errors with native error codes still report incomplete', async () => {
    const response = new Response(new ReadableStream({ start(c) { c.error(Object.assign(new Error('Connection reset'), { code: 'ECONNRESET' })); } }));
    await assert.rejects(collect(readAiEvents(response, undefined, (_zh, en) => en)), error => {
        assert.equal(error.code, 'AI_STREAM_INCOMPLETE');
        assert.match(error.message, /incomplete/);
        return true;
    });
});

test('client cancellation stops reads and keeps AbortError semantics', async () => {
    const controller = new AbortController();
    let cancelled = false;
    const response = new Response(new ReadableStream({ cancel() { cancelled = true; } }));
    const result = collect(readAiEvents(response, controller.signal));
    controller.abort();
    await assert.rejects(result, { name: 'AbortError' });
    assert.equal(cancelled, true);
});

for (const [provider, mapper, textEvent, success, limited] of [
    ['Claude', createClaudeMapper, { type: 'content_block_delta', delta: { type: 'text_delta', text: '正文' } },
        [{ type: 'message_delta', delta: { stop_reason: 'end_turn' } }, { type: 'message_stop' }],
        [{ type: 'message_delta', delta: { stop_reason: 'max_tokens' } }, { type: 'message_stop' }]],
    ['Gemini', createGeminiMapper, { candidates: [{ content: { parts: [{ text: '正文' }] } }] },
        [{ candidates: [{ finishReason: 'STOP' }] }], [{ candidates: [{ finishReason: 'MAX_TOKENS' }] }]],
]) {
    test(`${provider} recognizes its native terminal event`, async () => {
        const events = await collect(readAiEvents(forward([textEvent, ...success].map(sse).join(''), mapper())));
        assert.equal(events[0].text, '正文');
        assert.deepEqual(events.at(-1), { status: 'done' });
    });
    test(`${provider} rejects truncated streams and token-limited completions`, async () => {
        for (const tail of [[], limited]) {
            const events = [];
            await assert.rejects(async () => { for await (const event of readAiEvents(forward([textEvent, ...tail].map(sse).join(''), mapper()))) events.push(event); }, { code: 'AI_STREAM_INCOMPLETE' });
            assert.equal(events[0].text, '正文');
        }
    });
}
