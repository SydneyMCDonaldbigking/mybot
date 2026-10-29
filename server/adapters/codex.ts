import type { Adapter } from './types.ts';
import { binFor, parseJson, runProcess, summarize } from './process.ts';

// codex exec --json，stdout 是 JSONL 事件；提示词用 "-" 从 stdin 读
// https://learn.chatgpt.com/docs/non-interactive-mode
export const codex: Adapter = {
  keepsSession: true,
  async run({ agent, prompt, sessionId, signal, emit }) {
    const args = ['exec', '--json', '--skip-git-repo-check'];
    if (agent.model) args.push('-m', agent.model);
    if (agent.permission === 'readonly') args.push('--sandbox', 'read-only');
    if (agent.permission === 'edit') args.push('--sandbox', 'workspace-write');
    if (agent.permission === 'full') args.push('--dangerously-bypass-approvals-and-sandbox');
    if (sessionId) args.push('resume', sessionId);
    args.push('-');

    let texts = 0;

    await runProcess({
      command: [binFor(agent), ...args],
      cwd: agent.cwd,
      stdin: prompt,
      signal,
      onLine(line) {
        const ev = parseJson(line);
        if (!ev) return;
        const item = ev.item;
        switch (ev.type) {
          case 'thread.started':
            if (ev.thread_id) emit({ type: 'session', id: ev.thread_id });
            break;
          case 'item.started':
            if (item?.type === 'command_execution') emit({ type: 'tool', id: item.id, name: 'shell', detail: summarize(item.command) });
            else if (item?.type === 'mcp_tool_call')
              emit({ type: 'tool', id: item.id, name: [item.server, item.tool].filter(Boolean).join('.') || 'mcp', detail: summarize(item.arguments) });
            else if (item?.type === 'web_search') emit({ type: 'tool', id: item.id, name: 'web_search', detail: summarize(item.query) });
            break;
          case 'item.completed':
            if (item?.type === 'agent_message' && item.text) {
              if (texts++ > 0) emit({ type: 'block' });
              emit({ type: 'text', text: item.text });
            } else if (item?.type === 'command_execution' || item?.type === 'mcp_tool_call' || item?.type === 'web_search') {
              // item.started 可能没发（比如很快就结束），这里补一次
              emit({ type: 'tool', id: item.id, name: item.type === 'command_execution' ? 'shell' : item.type, detail: summarize(item.command ?? item.query ?? item.tool) });
              emit({ type: 'tool_done', id: item.id, ok: item.status !== 'failed' && (item.exit_code ?? 0) === 0 });
            } else if (item?.type === 'file_change') {
              const files = (item.changes ?? []).map((c: any) => `${c.kind ?? ''} ${c.path ?? ''}`.trim()).join(', ');
              emit({ type: 'tool', id: item.id, name: 'edit', detail: summarize(files) });
              emit({ type: 'tool_done', id: item.id, ok: item.status !== 'failed' });
            }
            break;
          case 'turn.failed':
            emit({ type: 'error', message: ev.error?.message ?? '回合失败' });
            break;
          case 'error':
            emit({ type: 'error', message: ev.message ?? '出错了' });
            break;
        }
      },
    });
  },
};
