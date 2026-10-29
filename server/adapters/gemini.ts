import type { Adapter } from './types.ts';
import { binFor, parseJson, runProcess, summarize } from './process.ts';

// gemini -o stream-json；stdin 不是终端时自动进入无头模式，提示词从 stdin 读
// 事件定义见 gemini-cli packages/core/src/output/types.ts
export const gemini: Adapter = {
  keepsSession: true,
  async run({ agent, prompt, sessionId, signal, emit }) {
    const args = ['-o', 'stream-json'];
    if (agent.model) args.push('-m', agent.model);
    if (agent.permission === 'edit') args.push('--approval-mode', 'auto_edit');
    if (agent.permission === 'full') args.push('--approval-mode', 'yolo');
    if (sessionId) args.push('-r', sessionId);

    let lastRole = '';

    await runProcess({
      command: [binFor(agent), ...args],
      cwd: agent.cwd,
      stdin: prompt,
      signal,
      onLine(line) {
        const ev = parseJson(line);
        if (!ev) return;
        switch (ev.type) {
          case 'init':
            if (ev.session_id) emit({ type: 'session', id: ev.session_id });
            break;
          case 'message':
            if (ev.role === 'assistant' && ev.content) {
              if (lastRole === 'tool') emit({ type: 'block' });
              emit({ type: 'text', text: ev.content });
              lastRole = 'assistant';
            }
            break;
          case 'tool_use':
            emit({ type: 'tool', id: ev.tool_id, name: ev.tool_name, detail: summarize(ev.parameters) });
            lastRole = 'tool';
            break;
          case 'tool_result':
            emit({ type: 'tool_done', id: ev.tool_id, ok: ev.status === 'success' });
            break;
          case 'error':
            if (ev.severity === 'error') emit({ type: 'error', message: ev.message });
            break;
          case 'result':
            if (ev.status === 'error') emit({ type: 'error', message: ev.error?.message ?? '运行失败' });
            break;
        }
      },
    });
  },
};
