import { Fragment, useLayoutEffect, useRef, useState } from 'react';
import type { Message } from '../../shared/types.ts';
import { loadMessages, useStore } from '../store.ts';
import { dividerTime } from '../format.ts';
import { MessageItem } from './MessageItem.tsx';

const GAP = 5 * 60_000;

export function MessageList({ id, isGroup }: { id: string; isGroup: boolean }) {
  const messages = useStore((s) => s.messages[id]) as Message[] | undefined;
  const hasMore = useStore((s) => s.hasMore[id]);
  const box = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const restore = useRef<{ height: number; top: number } | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);

  // 新消息或流式输出时，如果本来就在底部就跟着滚；翻历史时保持位置
  const last = messages?.[messages.length - 1];
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    if (restore.current) {
      el.scrollTop = el.scrollHeight - restore.current.height + restore.current.top;
      restore.current = null;
    } else if (atBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages?.length, last?.content, last?.tools.length]);

  const onScroll = async () => {
    const el = box.current!;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    if (el.scrollTop < 80 && hasMore && !loadingOlder) {
      setLoadingOlder(true);
      restore.current = { height: el.scrollHeight, top: el.scrollTop };
      await loadMessages(id, true).finally(() => setLoadingOlder(false));
    }
  };

  return (
    <div className="messages" ref={box} onScroll={onScroll}>
      {!messages && <div className="msg-system"><span>加载中…</span></div>}
      {hasMore && <div className="msg-system"><span>{loadingOlder ? '加载中…' : '上滑查看更早的消息'}</span></div>}
      {messages?.map((m, i) => {
        const prev = messages[i - 1];
        const divider = !prev || m.createdAt - prev.createdAt > GAP;
        return (
          <Fragment key={m.id}>
            {divider && <div className="msg-time">{dividerTime(m.createdAt)}</div>}
            <MessageItem m={m} showName={isGroup} />
          </Fragment>
        );
      })}
    </div>
  );
}
