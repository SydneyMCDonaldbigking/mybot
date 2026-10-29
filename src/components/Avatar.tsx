import { useRef } from 'react';
import { Icon } from '../icons.tsx';

const COLORS = ['#5b8def', '#f08c4a', '#4cb782', '#e0618a', '#8e6cef', '#3fb2c4', '#d9a338', '#6c7a91'];

function colorFor(seed: string) {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return COLORS[h % COLORS.length];
}

export const EMOJI_CHOICES = ['🤖', '🦊', '🐱', '🐼', '🦉', '🐙', '🐧', '🦄', '🐳', '🌵', '⚡', '🧠'];

interface AvatarProps {
  /** data URL、"emoji:🤖" 或 null */
  src: string | null;
  /** 没有头像时用名字的第一个字 */
  name: string;
  size?: number;
  busy?: boolean;
}

export function Avatar({ src, name, size = 40, busy }: AvatarProps) {
  const style = { width: size, height: size, fontSize: size * 0.42, borderRadius: Math.round(size * 0.22) };
  let inner;
  if (src?.startsWith('data:')) inner = <img src={src} alt="" />;
  else if (src?.startsWith('emoji:')) inner = <span style={{ fontSize: size * 0.56 }}>{src.slice(6)}</span>;
  else inner = <span>{[...(name.trim() || '?')][0].toUpperCase()}</span>;
  const bg = src?.startsWith('data:') ? undefined : src?.startsWith('emoji:') ? 'var(--emoji-bg)' : colorFor(name);
  return (
    <span className="avatar" style={{ ...style, background: bg }}>
      {inner}
      {busy && <span className="avatar-busy" title="正在回复" />}
    </span>
  );
}

/** 群头像：最多 4 个成员拼成田字格 */
export function GroupAvatar({ members, size = 40 }: { members: { src: string | null; name: string }[]; size?: number }) {
  const shown = members.slice(0, 4);
  const cell = shown.length === 1 ? size - 4 : Math.floor((size - 6) / 2);
  return (
    <span className="avatar group-avatar" style={{ width: size, height: size, borderRadius: Math.round(size * 0.22) }}>
      {shown.map((m, i) => (
        <Avatar key={i} src={m.src} name={m.name} size={cell} />
      ))}
    </span>
  );
}

/** 把上传的图片裁成正方形并压缩，存成 data URL */
async function fileToAvatar(file: File): Promise<string> {
  const img = await createImageBitmap(file);
  const size = 192;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const s = Math.min(img.width, img.height);
  canvas.getContext('2d')!.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
  const webp = canvas.toDataURL('image/webp', 0.85);
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.85);
}

export function AvatarPicker({ value, name, onChange }: { value: string | null; name: string; onChange: (v: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="avatar-picker">
      <button type="button" className="avatar-picker-main" onClick={() => input.current?.click()} title="上传图片">
        <Avatar src={value} name={name || '?'} size={72} />
        <span className="avatar-picker-overlay">
          <Icon name="upload" size={18} />
        </span>
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onChange(await fileToAvatar(file));
        }}
      />
      <div className="avatar-picker-choices">
        <button type="button" className={`emoji-choice ${value === null ? 'selected' : ''}`} onClick={() => onChange(null)} title="用名字首字">
          {[...(name.trim() || '?')][0].toUpperCase()}
        </button>
        {EMOJI_CHOICES.map((e) => (
          <button
            type="button"
            key={e}
            className={`emoji-choice ${value === `emoji:${e}` ? 'selected' : ''}`}
            onClick={() => onChange(`emoji:${e}`)}
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}
