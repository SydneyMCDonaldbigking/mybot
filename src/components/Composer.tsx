import { useLayoutEffect, useRef, useState } from 'react';
import type { Conversation } from '../../shared/types.ts';
import { api } from '../api.ts';
import { useStore } from '../store.ts';
import { Icon } from '../icons.tsx';
import { Avatar } from './Avatar.tsx';

/** 切换会话时保留没发出去的草稿 */
const drafts = new Map<string, string>();

interface Option {
  name: string;
  avatar: string | null;
  hint: string;
}

export function Composer({ conv }: { conv: Conversation }) {
  const agents = useStore((s) => s.agents);
  const [text, setTextState] = useState(() => drafts.get(conv.id) ?? '');
  const [mention, setMention] = useState<{ query: string; start: number } | null>(null);
  const [sel, setSel] = useState(0);
  const [sending, setSending] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);

  const setText = (v: string) => {
    drafts.set(conv.id, v);
    setTextState(v);
  };

  useLayoutEffect(() => {
    const el = ta.current!;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  const options: Option[] =
    conv.type === 'group' && mention
      ? [
          { name: '所有人', avatar: 'emoji:📣', hint: '群里每个 agent 都回复' },
          ...conv.memberIds.map((id) => agents[id]).filter(Boolean).map((a) => ({ name: a.name, avatar: a.avatar, hint: '' })),
        ].filter((o) => o.name.toLowerCase().includes(mention.query.toLowerCase()))
      : [];

  const detectMention = (value: string, caret: number) => {
    const m = /@([^\s@]*)$/.exec(value.slice(0, caret));
    setMention(m ? { query: m[1], start: caret - m[0].length } : null);
    setSel(0);
  };

  const pick = (name: string) => {
    const el = ta.current!;
    const caret = el.selectionStart;
    const start = mention?.start ?? caret;
    const next = `${text.slice(0, start)}@${name} ${text.slice(caret)}`;
    setText(next);
    setMention(null);
    requestAnimationFrame(() => {
      const pos = start + name.length + 2;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const send = async () => {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    setText('');
    setMention(null);
    try {
      await api.send(conv.id, content);
    } catch (err) {
      setText(content);
      alert((err as Error).message);
    } finally {
      setSending(false);
      ta.current?.focus();
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return; // 中文输入法选词时的回车不算发送
    if (options.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setSel((s) => (s + (e.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        pick(options[sel].name);
        return;
      }
      if (e.key === 'Escape') {
        setMention(null);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  const insertAt = () => {
    const el = ta.current!;
    const caret = el.selectionStart;
    const next = `${text.slice(0, caret)}@${text.slice(caret)}`;
    setText(next);
    setMention({ query: '', start: caret });
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(caret + 1, caret + 1);
    });
  };

  return (
    <div className="composer">
      {options.length > 0 && (
        <div className="mention-pop">
          {options.map((o, i) => (
            <button
              key={o.name}
              className={i === sel ? 'active' : ''}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o.name);
              }}
              onMouseEnter={() => setSel(i)}
            >
              <Avatar src={o.avatar} name={o.name} size={24} />
              <span>{o.name}</span>
              {o.hint && <small>{o.hint}</small>}
            </button>
          ))}
        </div>
      )}
      {conv.type === 'group' && (
        <button className="icon-btn at-btn" title="@ 成员" onClick={insertAt}>
          @
        </button>
      )}
      <textarea
        ref={ta}
        rows={1}
        value={text}
        placeholder={conv.type === 'group' ? '@ 谁，谁就会回复（Enter 发送，Shift+Enter 换行）' : '发消息（Enter 发送，Shift+Enter 换行）'}
        onChange={(e) => {
          setText(e.target.value);
          detectMention(e.target.value, e.target.selectionStart);
        }}
        onClick={(e) => detectMention(text, e.currentTarget.selectionStart)}
        onKeyDown={onKeyDown}
        onBlur={() => setTimeout(() => setMention(null), 100)}
      />
      <button className="send-btn" disabled={!text.trim() || sending} onClick={send} title="发送">
        <Icon name="send" size={18} />
      </button>
    </div>
  );
}
