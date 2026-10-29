import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { Adapter } from './types.ts';
import { binFor, runProcess } from './process.ts';
import { claudeStreamParser } from './claude.ts';
import { DATA_DIR } from '../db.ts';

// grok 的 -p 只收命令行参数，不读 stdin；多行提示词写进临时文件，用 --prompt-file 传
// streaming-messages-json 和 Claude Code 的 stream-json 是同一套格式（本机实测：Grok CLI 1.0.62）
export const grok: Adapter = {
  keepsSession: true,
  async run({ agent, prompt, sessionId, signal, emit }) {
    const dir = path.join(DATA_DIR, 'tmp');
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `prompt-${randomUUID()}.txt`);
    writeFileSync(file, prompt, 'utf8');

    const args = ['--prompt-file', file, '--output-format', 'streaming-messages-json', '--include-partial-messages'];
    if (sessionId) args.push('--resume', sessionId);
    if (agent.model) args.push('--model', agent.model);
    args.push(
      '--permission-mode',
      agent.permission === 'full' ? 'bypassPermissions' : agent.permission === 'edit' ? 'acceptEdits' : 'dontAsk',
    );

    try {
      await runProcess({
        command: [binFor(agent), ...args],
        cwd: agent.cwd,
        stdin: '',
        signal,
        onLine: claudeStreamParser(emit),
      });
    } finally {
      rmSync(file, { force: true });
    }
  },
};
