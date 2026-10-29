import type { Conversation } from '../../shared/types.ts';
import { useStore } from '../store.ts';
import { Avatar, GroupAvatar } from './Avatar.tsx';

export function ConversationAvatar({ conv, size = 44 }: { conv: Conversation; size?: number }) {
  const agents = useStore((s) => s.agents);
  const busy = useStore((s) => s.busy);
  if (conv.type === 'dm') {
    const a = agents[conv.memberIds[0]];
    return <Avatar src={a?.avatar ?? null} name={a?.name ?? '?'} size={size} busy={busy[conv.memberIds[0]] === conv.id} />;
  }
  if (conv.avatar) return <Avatar src={conv.avatar} name={conv.title} size={size} />;
  const members = conv.memberIds.map((id) => ({ src: agents[id]?.avatar ?? null, name: agents[id]?.name ?? '?' }));
  return <GroupAvatar members={members} size={size} />;
}
