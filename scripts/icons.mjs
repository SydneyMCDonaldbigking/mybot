// 从 public/icon.svg 生成桌面版和 PWA 用的 PNG 图标：node scripts/icons.mjs
import { mkdirSync, readFileSync } from 'node:fs';
import sharp from 'sharp';

const svg = readFileSync('public/icon.svg');
mkdirSync('resources', { recursive: true });

const png = (size, out) => sharp(svg, { density: 384 }).resize(size, size).png().toFile(out);

await png(512, 'resources/icon.png'); // electron-builder 会据此生成 .ico
await png(32, 'resources/tray.png');
await png(192, 'public/icon-192.png');
await png(512, 'public/icon-512.png');

// 任务栏图标右下角的未读红点
await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="14" fill="#e5484d" stroke="#fff" stroke-width="3"/></svg>'))
  .png()
  .toFile('resources/badge.png');

console.log('icons written');
