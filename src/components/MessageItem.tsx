import type { Message, ToolEvent } from '../../shared/types.ts';
import { useStore } from '../store.ts';
import { senderName } from '../format.ts';
import { Icon } from '../icons.tsx';
import { Avatar } from './Avatar.tsx';
import { Markdown, PlainWithMentions } from './Markdown.tsx';

function Tools({ tools }: { tools: ToolEvent[] }) {
  const running = tools.find((t) => t.status === 'running');
  const failed = tools.filter((t) => t.status === 'error').length;
  return (
    <details className="tools">
      <summary>
        <Icon name="tool" size={13} />
        {running ? (
          <span className="tools-running">
            {running.name} {running.detail}
          </span>
        ) : (
          <span>
            调用了 {tools.length} 次工具{failed ? `，${failed} 次失败` : ''}
          </span>
        )}
      </summary>
      <ul>
        {tools.map((t) => (
          <li key={t.id} className={t.status}>
            <span className="tool-status">{t.status === 'running' ? '…' : t.status === 'done' ? '✓' : '✗'}</span>
            <b>{t.name}</b>
            <span className="tool-detail">{t.detail}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function MessageItem({ m, showName }: { m: Message; showName: boolean }) {
  const agents = useStore((s) => s.agents);
  const profile = useStore((s) => s.profile);

  if (m.senderId === 'system') {
    return (
      <div className="msg-system">
        <span>{m.content}</span>
      </div>
    );
  }

  const mine = m.senderId === 'me';
  const agent = agents[m.senderId];
  const name = senderName(m.senderId, agents, profile);
  const avatar = mine ? profile.avatar : (agent?.avatar ?? null);
  const streaming = m.status === 'streaming';

  return (
    <div className={`msg ${mine ? 'mine' : ''}`}>
      <Avatar src={avatar} name={name} size={36} />
      <div className="msg-body">
        {showName && !mine && <div className="msg-name">{name}</div>}
        {m.tools.length > 0 && <Tools tools={m.tools} />}
        {(m.content || streaming) && (
          <div className={`bubble ${m.status}`}>
            {mine ? (
              <PlainWithMentions text={m.content} />
            ) : m.content ? (
              <Markdown text={m.content} />
            ) : (
              <span className="typing">
                <i />
                <i />
                <i />
              </span>
            )}
            {streaming && m.content && <span className="caret" />}
          </div>
        )}
      </div>
    </div>
  );
}
