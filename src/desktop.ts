// 未读数和系统通知：桌面版通过 preload 暴露的 window.desktop 交给主进程，浏览器里只用网页通知
import type { Message } from '../shared/types.ts';
import { openConversation, useStore } from './store.ts';
import { conversationTitle, preview } from './format.ts';

declare global {
  interface Window {
    desktop?: { setUnread(n: number): void; show(): void };
  }
}

const APP_NAME = 'Agents Chat';

export function initDesktop() {
  let last = -1;
  useStore.subscribe((s) => {
    const n = Object.values(s.conversations).reduce((sum, c) => sum + c.unread, 0);
    if (n === last) return;
    last = n;
    window.desktop?.setUnread(n);
    document.title = n ? `(${n}) ${APP_NAME}` : APP_NAME;
  });
}

/** 浏览器里要用户操作过才能申请通知权限；桌面版默认就有 */
export function askNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission();
}

/** agent 回复完、而你没在看这个窗口时，弹一条系统通知 */
export function notifyReply(m: Message) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible' && document.hasFocus()) return;
  const { conversations, agents, profile } = useStore.getState();
  const conv = conversations[m.conversationId];
  if (!conv) return;
  const n = new Notification(conversationTitle(conv, agents), {
    body: preview(m, conv, agents, profile).slice(0, 140),
    tag: m.conversationId,
    icon: '/icon-192.png',
  });
  n.onclick = () => {
    window.desktop?.show();
    window.focus();
    void openConversation(m.conversationId);
    n.close();
  };
}
