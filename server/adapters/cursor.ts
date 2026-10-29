import type { Adapter } from './types.ts';
import { binFor, parseJson, runProcess, summarize } from './process.ts';

/** tool_call 里是 { shellToolCall: { args, result } } 这样的结构，取出工具名和参数 */
function describeTool(toolCall: any): { name: string; args: unknown; failed: boolean } {
  const [key, body] = Object.entries(toolCall ?? {})[0] ?? ['tool', {}];
  const b = body as any;
  if (key === 'function') return { name: b?.name ?? 'tool', args: b?.arguments, failed: false };
  return { name: key.replace(/ToolCall$/, ''), args: b?.args, failed: !!b?.result?.error || !!b?.result?.rejected };
}

// cursor-agent -p，提示词从 stdin 读（本机实测：cursor-agent 2026.10，stream-json）
export const cursor: Adapter = {
  keepsSession: true,
  async run({ agent, prompt, sessionId, signal, emit }) {
    const args = ['-p', '--output-format', 'stream-json', '--stream-partial-output', '--trust'];
    if (sessionId) args.push('--resume', sessionId);
    if (agent.model) args.push('--model', agent.model);
    if (agent.permission === 'readonly') args.push('--mode', 'ask');
    if (agent.permission === 'full') args.push('--force');

    let streamed = false;
    let afterTool = false;

    await runProcess({
      command: [binFor(agent), ...args],
      cwd: agent.cwd,
      stdin: prompt,
      signal,
      onLine(line) {
        const ev = parseJson(line);
        if (!ev) return;
        if (ev.session_id) emit({ type: 'session', id: ev.session_id });
        switch (ev.type) {
          case 'assistant': {
            const text = (ev.message?.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
            // 带 timestamp_ms 的是增量；不带的是整段汇总，流式过就跳过
            const isDelta = ev.timestamp_ms !== undefined;
            if (!text || (!isDelta && streamed)) return;
            if (isDelta) streamed = true;
            if (afterTool) emit({ type: 'block' });
            afterTool = false;
            emit({ type: 'text', text });
            break;
          }
          case 'tool_call': {
            const t = describeTool(ev.tool_call);
            if (ev.subtype === 'started') emit({ type: 'tool', id: ev.call_id, name: t.name, detail: summarize(t.args) });
            else if (ev.subtype === 'completed') emit({ type: 'tool_done', id: ev.call_id, ok: !t.failed });
            afterTool = true;
            break;
          }
          case 'result':
            if (ev.is_error) emit({ type: 'error', message: String(ev.result ?? '运行失败') });
            else if (typeof ev.result === 'string') emit({ type: 'final', text: ev.result });
            break;
        }
      },
    });
  },
};
