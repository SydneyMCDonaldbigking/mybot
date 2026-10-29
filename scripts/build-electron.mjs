// 把 Electron 主进程（连同后端代码）打成单个 CommonJS 文件
import { build } from 'esbuild';

await build({
  entryPoints: { main: 'electron/main.ts', preload: 'electron/preload.ts' },
  outdir: 'out',
  outExtension: { '.js': '.cjs' },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  sourcemap: true,
  // ws 的这两个是可选的原生加速包，没装时它会自己退回纯 JS
  external: ['electron', 'bufferutil', 'utf-8-validate'],
  logLevel: 'info',
});
