import type { Adapter } from './types.ts';
import { runProcess } from './process.ts';

// 自定义命令：提示词写进 stdin，stdout 原样当回复。没有会话概念，路由层会带上最近的聊天记录
export const custom: Adapter = {
  keepsSession: false,
  async run({ agent, prompt, signal, emit }) {
    if (!agent.command.trim()) throw new Error('还没有填写要执行的命令');
    await runProcess({
      command: agent.command,
      cwd: agent.cwd,
      stdin: prompt,
      signal,
      onLine() {},
      onChunk: (text) => emit({ type: 'text', text }),
    });
  },
};
