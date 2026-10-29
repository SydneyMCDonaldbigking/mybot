import type { Agent } from '../../shared/types.ts';

export type AdapterEvent =
  | { type: 'session'; id: string }
  /** 追加到回复正文 */
  | { type: 'text'; text: string }
  /** 一段新的正文开始（多段之间要空行隔开） */
  | { type: 'block' }
  | { type: 'tool'; id: string; name: string; detail: string }
  | { type: 'tool_done'; id: string; ok: boolean }
  /** CLI 自己给出的最终回复，正文为空时用它兜底 */
  | { type: 'final'; text: string }
  | { type: 'error'; message: string };

export interface RunOptions {
  agent: Agent;
  prompt: string;
  /** 上一轮 CLI 返回的会话 id，没有就是新会话 */
  sessionId: string | null;
  signal: AbortSignal;
  emit: (e: AdapterEvent) => void;
}

export interface Adapter {
  /** CLI 自己能续会话；否则每次都要把最近的聊天记录带上 */
  keepsSession: boolean;
  run(opts: RunOptions): Promise<void>;
}
