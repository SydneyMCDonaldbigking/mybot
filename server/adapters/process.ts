import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { existsSync } from 'node:fs';
import { DEFAULT_BIN } from '../../shared/types.ts';
import type { Agent } from '../../shared/types.ts';

const isWin = process.platform === 'win32';

/** agent 填了可执行文件路径就用它，否则用这种 CLI 的默认命令名 */
export function binFor(agent: Agent): string {
  return agent.command.trim() || DEFAULT_BIN[agent.kind]!;
}

/** 参数只允许简单的 token：Windows 上 .cmd 必须走 shell，不能让用户输入混进命令行 */
const SAFE_ARG = /^[\w.:/\\=@+-]*$/;
/** 带空格的路径可以加引号，但不能有 cmd.exe 会解释的字符 */
const QUOTABLE_ARG = /^[^"%^&|<>!\r\n]+$/;

export function assertSafeArg(value: string, label: string) {
  if (!SAFE_ARG.test(value)) throw new Error(`${label} 里有不支持的字符：${value}`);
}

function shellArg(value: string, label: string): string {
  if (SAFE_ARG.test(value)) return value;
  if (QUOTABLE_ARG.test(value)) return `"${value}"`;
  throw new Error(`${label} 里有不支持的字符：${value}`);
}

export interface ProcessOptions {
  /** 程序名 + 参数；command 为字符串时按 shell 命令执行（自定义 agent） */
  command: string | string[];
  cwd: string;
  /** 通过 stdin 传入，避免多行文本在 Windows 命令行里被转义坏 */
  stdin: string;
  signal: AbortSignal;
  onLine: (line: string) => void;
  /** 不按行，直接把 stdout 原样交出去（自定义命令用） */
  onChunk?: (chunk: string) => void;
}

/** 跑一个子进程，按行读 stdout；失败时把 stderr 末尾带进错误里 */
export function runProcess(opts: ProcessOptions): Promise<void> {
  const cwd = opts.cwd || process.cwd();
  if (!existsSync(cwd)) return Promise.reject(new Error(`工作目录不存在：${cwd}`));

  const env = { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1', FORCE_COLOR: '0', NO_COLOR: '1' };
  const child =
    typeof opts.command === 'string'
      ? spawn(opts.command, { cwd, env, shell: true, windowsHide: true })
      : (() => {
          const [bin, ...args] = opts.command;
          // Windows 上大多数 CLI 是 .cmd 包装，只能经过 cmd.exe 启动，参数要自己转义
          if (!isWin) return spawn(bin, args, { cwd, env, windowsHide: true });
          const line = [shellArg(bin, '命令'), ...args.map((a) => shellArg(a, '启动参数'))].join(' ');
          return spawn(line, { cwd, env, shell: true, windowsHide: true });
        })();

  return new Promise((resolve, reject) => {
    let stderr = '';
    let aborted = false;

    const kill = () => {
      aborted = true;
      if (!child.pid) return;
      if (isWin) spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
      else child.kill('SIGINT');
    };
    if (opts.signal.aborted) kill();
    opts.signal.addEventListener('abort', kill, { once: true });

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    if (opts.onChunk) child.stdout.on('data', opts.onChunk);
    else createInterface({ input: child.stdout }).on('line', (l) => l.trim() && opts.onLine(l));
    child.stderr.on('data', (d: string) => {
      stderr = (stderr + d).slice(-4000);
    });

    child.on('error', (err: NodeJS.ErrnoException) => {
      const bin = Array.isArray(opts.command) ? opts.command[0] : opts.command;
      reject(err.code === 'ENOENT' ? new Error(`找不到命令「${bin}」，请先安装并确认它在 PATH 里`) : err);
    });
    child.on('close', (code) => {
      opts.signal.removeEventListener('abort', kill);
      if (aborted) return reject(new Error('已停止'));
      if (code === 0) return resolve();
      const hint = stderr.trim().split('\n').slice(-6).join('\n');
      // Windows 上 shell 找不到命令时退出码是 1，并在 stderr 里报 "is not recognized"
      if (/is not recognized|不是内部或外部命令/.test(hint)) {
        const bin = Array.isArray(opts.command) ? opts.command[0] : opts.command;
        return reject(new Error(`找不到命令「${bin}」，请先安装并确认它在 PATH 里`));
      }
      reject(new Error(`进程退出码 ${code}${hint ? `\n${hint}` : ''}`));
    });

    child.stdin.on('error', () => {}); // 进程提前退出时写 stdin 会 EPIPE，交给 close 处理
    child.stdin.end(opts.stdin);
  });
}

/** 把工具调用参数压成一行，给聊天里的工具卡片用 */
export function summarize(input: unknown, max = 160): string {
  if (input == null) return '';
  if (typeof input === 'string') return clip(input, max);
  if (typeof input === 'object') {
    const o = input as Record<string, unknown>;
    const key = ['command', 'file_path', 'path', 'pattern', 'url', 'query', 'description', 'prompt'].find(
      (k) => typeof o[k] === 'string',
    );
    if (key) return clip(o[key] as string, max);
  }
  return clip(JSON.stringify(input), max);
}

function clip(s: string, max: number) {
  const one = s.replace(/\s+/g, ' ').trim();
  return one.length > max ? `${one.slice(0, max)}…` : one;
}

export function parseJson(line: string): any | undefined {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
}
