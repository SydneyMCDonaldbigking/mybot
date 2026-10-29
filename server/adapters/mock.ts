import type { Adapter } from './types.ts';

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => (clearTimeout(t), reject(new Error('已停止'))), { once: true });
  });

/**
 * 不调用任何模型的测试机器人：模拟一次工具调用，再逐字回显最后一条消息。
 * 回显会带上原文里的 @，所以两个测试机器人互相 @ 时能用来验证跳数上限。
 */
export const mock: Adapter = {
  keepsSession: true,
  async run({ agent, prompt, sessionId, signal, emit }) {
    emit({ type: 'session', id: sessionId ?? `mock-${Date.now()}` });
    const lines = prompt.trim().split('\n').filter((l) => l.trim() && !l.startsWith('['));
    const last = lines.at(-1) ?? '';

    const toolId = `t${Date.now()}`;
    emit({ type: 'tool', id: toolId, name: 'think', detail: `读到 ${lines.length} 行新消息` });
    await sleep(400, signal);
    emit({ type: 'tool_done', id: toolId, ok: true });

    const reply = `我是 **${agent.name}**（测试机器人）。你刚才说：\n\n> ${last}`;
    for (const ch of reply) {
      emit({ type: 'text', text: ch });
      await sleep(15, signal);
    }
  },
};
