import type { Adapter } from './types.ts';
import { binFor, parseJson, runProcess, summarize } from './process.ts';

// agy 的 -p 只收命令行参数；改用 --input-format=stream-json，从 stdin 传一行
// {"event":"user","message":{...}}。输出是 init / step_update / result 三种事件
// （本机实测：Antigravity CLI 1.4.3；--conversation=<id> 能续上之前的会话）
export const antigravity: Adapter = {
  keepsSession: true,
  async run({ agent, prompt, sessionId, signal, emit }) {
    const args = ['--output-format=stream-json', '--input-format=stream-json', '--print='];
    if (sessionId) args.push(`--conversation=${sessionId}`);
    if (agent.model) args.push(`--model=${agent.model}`);
    if (agent.permission === 'readonly') args.push('--mode=plan');
    if (agent.permission === 'edit') args.push('--mode=accept-edits');
    if (agent.permission === 'full') args.push('--dangerously-skip-permissions');

    let lastTextStep = -1;
    let hasText = false;

    await runProcess({
      command: [binFor(agent), ...args],
      cwd: agent.cwd,
      stdin: `${JSON.stringify({ event: 'user', message: { role: 'user', content: prompt } })}\n`,
      signal,
      onLine(line) {
        const ev = parseJson(line);
        if (!ev) return;
        if (ev.event === 'init' && ev.conversation_id) emit({ type: 'session', id: ev.conversation_id });
        if (ev.event === 'step_update') {
          const s = ev.step_update ?? {};
          if (s.step_type === 'agent_response' && s.text_delta) {
            if (hasText && s.step_index !== lastTextStep) emit({ type: 'block' });
            lastTextStep = s.step_index;
            hasText = true;
            emit({ type: 'text', text: s.text_delta });
          } else if (s.step_type === 'tool') {
            const id = `step-${s.step_index}`;
            emit({ type: 'tool', id, name: s.tool_name ?? s.tool_info?.name ?? 'tool', detail: summarize(s.tool_info?.parameters) });
            if (s.state === 'DONE') emit({ type: 'tool_done', id, ok: true });
            else if (s.state && s.state !== 'ACTIVE') emit({ type: 'tool_done', id, ok: false });
          }
        }
        if (ev.event === 'result') {
          const r = ev.result ?? {};
          if (r.status === 'ERROR') emit({ type: 'error', message: r.error || '运行失败' });
          else if (typeof r.response === 'string') emit({ type: 'final', text: r.response });
        }
      },
    });
  },
};
