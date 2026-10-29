// 命令行入口：npm run dev / npm start
import { existsSync } from 'node:fs';
import { startServer } from './app.ts';

// 不用 PORT：很多工具会给子进程设 PORT（比如前端开发服务器的端口）
const port = Number(process.env.API_PORT ?? 8787);
// 默认只监听本机：agent 能在你电脑上执行命令，别随便暴露到局域网
const host = process.env.HOST ?? '127.0.0.1';
const distDir = 'dist';

const server = await startServer({ port, host, dataDir: process.env.DATA_DIR ?? 'data', distDir });
console.log(`agents chat gateway 已启动：http://${host}:${server.port}`);
if (!existsSync(distDir)) console.log('（开发模式：网页请打开 Vite 的地址 http://localhost:5173）');
