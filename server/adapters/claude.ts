import type { Adapter, AdapterEvent } from './types.ts';
import { binFor, parseJson, runProcess, summarize } from './process.ts';

/**
 * 解析 Claude Code 风格的 stream-json（Grok CLI 的 streaming-messages-json 也是这个格式）：
 * system/init、stream_event 增量、assistant/user 整条消息、result
 */
export function claudeStreamParser(emit: (e: AdapterEvent) => void) {
  let streamed = false; // 有 token 级增量时，就不再用整条 assistant 消息里的文本
  let textBlocks = 0;
  return (line: string) => {
    const ev = parseJson(line);
    if (!ev) return;
    if (ev.session_id) emit({ type: 'session', id: ev.session_id });
    // 子 agent 的消息不进聊天
    if (ev.parent_tool_use_id) return;

    if (ev.type === 'stream_event') {
      const e = ev.event;
      if (e?.type === 'content_block_start' && e.content_block?.type === 'text') {
        if (textBlocks++ > 0) emit({ type: 'block' });
      } else if (e?.type === 'content_block_delta' && e.delta?.type === 'text_delta') {
        streamed = true;
        emit({ type: 'text', text: e.delta.text });
      }
    } else if (ev.type === 'assistant') {
      for (const block of ev.message?.content ?? []) {
        if (block.type === 'text' && !streamed && block.text) {
          if (textBlocks++ > 0) emit({ type: 'block' });
          emit({ type: 'text', text: block.text });
        } else if (block.type === 'tool_use') {
          emit({ type: 'tool', id: block.id, name: block.name, detail: summarize(block.input) });
        }
      }
    } else if (ev.type === 'user') {
      for (const block of ev.message?.content ?? []) {
        if (block.type === 'tool_result') emit({ type: 'tool_done', id: block.tool_use_id, ok: !block.is_error });
      }
    } else if (ev.type === 'result') {
      if (ev.is_error) emit({ type: 'error', message: String(ev.result ?? ev.subtype ?? '运行失败') });
      else if (typeof ev.result === 'string') emit({ type: 'final', text: ev.result });
    }
  };
}

// claude -p 无头模式，提示词从 stdin 读
// https://code.claude.com/docs/en/headless
export const claude: Adapter = {
  keepsSession: true,
  async run({ agent, prompt, sessionId, signal, emit }) {
    const args = ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages'];
    if (sessionId) args.push('--resume', sessionId);
    if (agent.model) args.push('--model', agent.model);
    if (agent.permission === 'edit') args.push('--permission-mode', 'acceptEdits');
    if (agent.permission === 'full') args.push('--dangerously-skip-permissions');

    await runProcess({
      command: [binFor(agent), ...args],
      cwd: agent.cwd,
      stdin: prompt,
      signal,
      onLine: claudeStreamParser(emit),
    });
  },
};
