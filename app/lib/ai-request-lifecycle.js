// 上游连续这么久没有任何输出才判超时；流式输出期间每收到数据就重新计时，
// 慢速模型（如只用 CPU 的本地模型）持续输出时不会被中途切断。
export const AI_REQUEST_TIMEOUT_MS = 120_000;

export function createGenerationLifecycle(parentSignal, timeoutMs = AI_REQUEST_TIMEOUT_MS) {
    const controller = new AbortController();
    let timer;
    let disposed = false;
    const dispose = () => {
        disposed = true;
        clearTimeout(timer);
        parentSignal?.removeEventListener('abort', onAbort);
    };
    const abort = (reason = new DOMException('Generation cancelled', 'AbortError')) => {
        controller.abort(reason);
        dispose();
    };
    const onAbort = () => abort(new DOMException('Generation cancelled', 'AbortError'));
    const armTimer = () => {
        clearTimeout(timer);
        timer = setTimeout(() => abort(new DOMException('Generation timed out', 'TimeoutError')), timeoutMs);
    };
    const touch = () => {
        if (!disposed && !controller.signal.aborted) armTimer();
    };
    if (parentSignal?.aborted) onAbort();
    else {
        parentSignal?.addEventListener('abort', onAbort, { once: true });
        armTimer();
    }
    return { signal: controller.signal, abort, dispose, touch, streaming: false };
}

export function generationAbortResponse(lifecycle) {
    if (!lifecycle.signal.aborted) return null;
    const timeout = lifecycle.signal.reason?.name === 'TimeoutError';
    return Response.json({
        status: timeout ? 'incomplete' : 'cancelled',
        code: timeout ? 'AI_GENERATION_TIMEOUT' : 'AI_GENERATION_CANCELLED',
        error: timeout ? '生成超时，内容尚未完成。' : '已停止生成。',
    }, { status: timeout ? 504 : 499 });
}
