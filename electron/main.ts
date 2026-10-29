// 桌面版主进程：在进程内启动后端，用窗口加载它提供的网页
import { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, nativeTheme, shell } from 'electron';
import path from 'node:path';
import { startServer, type RunningServer } from '../server/app.ts';

const APP_NAME = 'Agents Chat';
const resource = (name: string) => path.join(app.getAppPath(), 'resources', name);

let server: RunningServer | null = null;
let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
let unread = 0;

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createWindow(origin: string) {
  win = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 380,
    minHeight: 520,
    title: APP_NAME,
    icon: resource('icon.png'),
    show: false,
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#17181b' : '#f0f1f4',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      // 缩到托盘后也要及时收消息、弹通知
      backgroundThrottling: false,
    },
  });
  win.loadURL(origin);
  win.once('ready-to-show', () => win?.show());

  // 关窗口只是缩到托盘，agent 继续在后台干活；真正退出走托盘菜单
  win.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    win?.hide();
  });
  win.on('focus', () => win?.flashFrame(false));

  // 聊天里的链接用系统浏览器打开
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (url.startsWith(origin)) return;
    e.preventDefault();
    if (/^https?:/.test(url)) void shell.openExternal(url);
  });
  // 没有菜单栏，留个开发者工具的快捷键方便排查
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i'))) {
      win?.webContents.toggleDevTools();
    }
  });
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(resource('tray.png')));
  tray.setToolTip(APP_NAME);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: `打开 ${APP_NAME}`, click: showWindow },
      { type: 'separator' },
      { label: '退出', click: () => app.quit() },
    ]),
  );
  tray.on('click', showWindow);
}

ipcMain.on('show', showWindow);

ipcMain.on('unread', (_e, n: number) => {
  if (!win) return;
  if (n > unread && !win.isFocused()) win.flashFrame(true);
  unread = n;
  win.setOverlayIcon(n > 0 ? nativeImage.createFromPath(resource('badge.png')) : null, n > 0 ? `${n} 条未读` : '');
  tray?.setToolTip(n > 0 ? `${APP_NAME}（${n} 条未读）` : APP_NAME);
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);
  // Windows 上系统通知要靠这个 id 关联到应用
  app.setAppUserModelId('com.agentschat.app');
  Menu.setApplicationMenu(null);

  app.whenReady().then(async () => {
    try {
      server = await startServer({
        port: Number(process.env.API_PORT ?? 0),
        host: '127.0.0.1',
        dataDir: process.env.DATA_DIR || path.join(app.getPath('userData'), 'data'),
        distDir: path.join(app.getAppPath(), 'dist'),
      });
    } catch (err) {
      const { dialog } = await import('electron');
      dialog.showErrorBox(`${APP_NAME} 启动失败`, String((err as Error)?.stack ?? err));
      app.exit(1);
      return;
    }
    createWindow(`http://127.0.0.1:${server.port}`);
    createTray();
  });

  app.on('before-quit', () => {
    quitting = true;
  });

  // 退出前先停掉正在跑的 agent 进程、关掉数据库
  let closing = false;
  app.on('will-quit', (e) => {
    if (!server || closing) return;
    e.preventDefault();
    closing = true;
    server.close().finally(() => app.exit(0));
  });
}
