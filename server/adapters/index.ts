import { execFile } from 'node:child_process';
import { DEFAULT_BIN } from '../../shared/types.ts';
import type { AgentKind, CliStatus } from '../../shared/types.ts';
import type { Adapter } from './types.ts';
import { claude } from './claude.ts';
import { codex } from './codex.ts';
import { gemini } from './gemini.ts';
import { cursor } from './cursor.ts';
import { grok } from './grok.ts';
import { antigravity } from './antigravity.ts';
import { custom } from './custom.ts';
import { mock } from './mock.ts';

export const adapters: Record<AgentKind, Adapter> = { claude, codex, gemini, cursor, grok, antigravity, custom, mock };
export type { Adapter, AdapterEvent } from './types.ts';

const onPath = (bin: string) =>
  new Promise<boolean>((resolve) => {
    const [cmd, args] = process.platform === 'win32' ? ['where.exe', [bin]] : ['sh', ['-c', `command -v ${bin}`]];
    execFile(cmd, args as string[], { windowsHide: true }, (err) => resolve(!err));
  });

let cache: { at: number; status: CliStatus } | null = null;

/** 看看本机 PATH 里装了哪些 CLI，给新建 agent 的下拉框用 */
export async function detectClis(): Promise<CliStatus> {
  if (cache && Date.now() - cache.at < 60_000) return cache.status;
  const entries = await Promise.all(
    Object.entries(DEFAULT_BIN).map(async ([kind, bin]) => [kind, await onPath(bin!)] as const),
  );
  cache = { at: Date.now(), status: Object.fromEntries(entries) };
  return cache.status;
}
