// 给网页暴露的桌面能力；浏览器里打开时没有 window.desktop
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('desktop', {
  setUnread: (n: number) => ipcRenderer.send('unread', n),
  show: () => ipcRenderer.send('show'),
});
