import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const plugins = [remarkGfm];
const components = {
  a: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} target="_blank" rel="noreferrer" />,
};

export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={plugins} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
});

/** 用户自己的消息不走 Markdown，只把 @ 高亮出来 */
export function PlainWithMentions({ text }: { text: string }) {
  return (
    <div className="plain">
      {text.split(/(@[^\s@]+)/g).map((part, i) =>
        part.startsWith('@') ? (
          <span key={i} className="mention">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </div>
  );
}
