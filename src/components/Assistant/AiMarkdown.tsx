import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { copyToClipboard } from '../../utils/mediaUtils';

type MdBlock =
  | { type: 'code'; language: string; content: string }
  | { type: 'heading'; level: number; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: { num: string; text: string }[] }
  | { type: 'quote'; lines: string[] }
  | { type: 'hr' }
  | { type: 'p'; lines: string[] };

function parseBlocks(markdown: string): MdBlock[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: MdBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    // Fenced code block (```lang ... ```), also gracefully handles unclosed streaming fences
    const fenceMatch = line.match(/^\s*```(.*)$/);
    if (fenceMatch) {
      const language = fenceMatch[1].trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length && /^\s*```\s*$/.test(lines[i])) {
        i++;
      }
      blocks.push({ type: 'code', language, content: codeLines.join('\n') });
      continue;
    }

    // Horizontal rule
    if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) {
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }

    // Headings (# to ####)
    const headingMatch = line.match(/^\s*(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length,
        text: headingMatch[2].trim(),
      });
      i++;
      continue;
    }

    // Blockquote
    if (/^\s*>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      blocks.push({ type: 'quote', lines: quoteLines });
      continue;
    }

    // Unordered list
    if (/^\s*[-*•]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*•]\s+/, ''));
        i++;
      }
      blocks.push({ type: 'ul', items });
      continue;
    }

    // Ordered list
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: { num: string; text: string }[] = [];
      while (i < lines.length) {
        const m = lines[i].match(/^\s*(\d+)[.)]\s+(.*)$/);
        if (!m) break;
        items.push({ num: m[1], text: m[2] });
        i++;
      }
      blocks.push({ type: 'ol', items });
      continue;
    }

    // Paragraph (stop at blank line or start of another block)
    const pLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^\s*```/.test(lines[i]) &&
      !/^\s*#{1,4}\s+/.test(lines[i]) &&
      !/^\s*>\s?/.test(lines[i]) &&
      !/^\s*[-*•]\s+/.test(lines[i]) &&
      !/^\s*\d+[.)]\s+/.test(lines[i]) &&
      !/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(lines[i])
    ) {
      pLines.push(lines[i]);
      i++;
    }
    if (pLines.length > 0) {
      blocks.push({ type: 'p', lines: pLines });
    }
  }

  return blocks;
}

type TokenRule = {
  kind: 'code' | 'link' | 'bolditalic' | 'bold' | 'italic' | 'strike';
  regex: RegExp;
};

const INLINE_RULES: TokenRule[] = [
  { kind: 'code', regex: /`([^`\n]+)`/ },
  { kind: 'link', regex: /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/ },
  { kind: 'bolditalic', regex: /\*\*\*([^\s*](?:[^*\n]*[^\s*])?)\*\*\*/ },
  { kind: 'bold', regex: /\*\*([^\s*](?:[^*\n]*[^\s*])?)\*\*/ },
  { kind: 'italic', regex: /\*([^\s*](?:[^*\n]*[^\s*])?)\*/ },
  { kind: 'strike', regex: /~~([^\s~](?:[^~\n]*[^\s~])?)~~/ },
];

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let rest = text;
  let seg = 0;

  while (rest.length > 0) {
    let bestRule: TokenRule | null = null;
    let bestMatch: RegExpExecArray | null = null;

    for (const rule of INLINE_RULES) {
      const m = rule.regex.exec(rest);
      if (m && (bestMatch === null || m.index < bestMatch.index)) {
        bestMatch = m;
        bestRule = rule;
      }
    }

    if (!bestMatch || !bestRule) {
      nodes.push(rest);
      break;
    }

    if (bestMatch.index > 0) {
      nodes.push(rest.slice(0, bestMatch.index));
    }

    const key = `${keyPrefix}-${seg++}`;
    const inner = bestMatch[1];

    switch (bestRule.kind) {
      case 'code':
        nodes.push(
          <code
            key={key}
            className="px-1.5 py-0.5 rounded bg-slate-200/80 dark:bg-zinc-800 font-mono text-[12px] text-[#0A3D62] dark:text-[#1AA7B8] break-words"
          >
            {inner}
          </code>
        );
        break;
      case 'link':
        nodes.push(
          <a
            key={key}
            href={bestMatch[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="underline font-medium text-[#0A3D62] dark:text-[#1AA7B8] hover:opacity-80"
          >
            {renderInline(inner, `${key}-a`)}
          </a>
        );
        break;
      case 'bolditalic':
        nodes.push(
          <strong key={key} className="font-bold">
            <em className="italic">{renderInline(inner, `${key}-bi`)}</em>
          </strong>
        );
        break;
      case 'bold':
        nodes.push(
          <strong key={key} className="font-bold">
            {renderInline(inner, `${key}-b`)}
          </strong>
        );
        break;
      case 'italic':
        nodes.push(
          <em key={key} className="italic">
            {renderInline(inner, `${key}-i`)}
          </em>
        );
        break;
      case 'strike':
        nodes.push(
          <del key={key} className="line-through opacity-75">
            {renderInline(inner, `${key}-s`)}
          </del>
        );
        break;
    }

    rest = rest.slice(bestMatch.index + bestMatch[0].length);
  }

  return nodes;
}

function CodeBlock({ language, content }: { language: string; content: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopyCode = async () => {
    const ok = await copyToClipboard(content);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div className="my-1.5 rounded-xl overflow-hidden border border-slate-200 dark:border-zinc-800 bg-slate-950 text-slate-100">
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900 dark:bg-zinc-900 border-b border-slate-800 text-[11px] text-slate-300">
        <span className="font-mono lowercase">{language || 'code'}</span>
        <button
          type="button"
          onClick={handleCopyCode}
          className="inline-flex items-center gap-1 font-medium text-slate-300 hover:text-white transition-colors"
          aria-label="Copy code block"
        >
          {copied ? <Check size={12} className="text-[#1AA7B8]" /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="p-3 overflow-x-auto text-xs leading-relaxed font-mono">
        <code>{content}</code>
      </pre>
    </div>
  );
}

interface AiMarkdownProps {
  content: string;
}

export default function AiMarkdown({ content }: AiMarkdownProps) {
  const blocks = parseBlocks(content);

  return (
    <div className="space-y-2 text-sm leading-relaxed break-words">
      {blocks.map((block, idx) => {
        const key = `md-${idx}`;
        switch (block.type) {
          case 'code':
            return <CodeBlock key={key} language={block.language} content={block.content} />;

          case 'hr':
            return (
              <hr key={key} className="border-slate-200 dark:border-zinc-800 my-1.5" />
            );

          case 'heading': {
            const sizeClass =
              block.level === 1
                ? 'text-base font-extrabold'
                : block.level === 2
                  ? 'text-[15px] font-bold'
                  : 'text-sm font-bold';
            return (
              <p key={key} className={`${sizeClass} pt-0.5`}>
                {renderInline(block.text, key)}
              </p>
            );
          }

          case 'quote':
            return (
              <blockquote
                key={key}
                className="pl-3 py-0.5 border-l border-slate-300 dark:border-zinc-700 text-slate-600 dark:text-zinc-300 italic space-y-1"
              >
                {block.lines.map((line, li) => (
                  <p key={`${key}-q-${li}`}>{renderInline(line, `${key}-q-${li}`)}</p>
                ))}
              </blockquote>
            );

          case 'ul':
            return (
              <ul key={key} className="list-disc pl-5 space-y-1">
                {block.items.map((item, li) => (
                  <li key={`${key}-ul-${li}`}>{renderInline(item, `${key}-ul-${li}`)}</li>
                ))}
              </ul>
            );

          case 'ol':
            return (
              <ol key={key} className="list-decimal pl-5 space-y-1">
                {block.items.map((item, li) => (
                  <li key={`${key}-ol-${li}`} value={Number(item.num) || undefined}>
                    {renderInline(item.text, `${key}-ol-${li}`)}
                  </li>
                ))}
              </ol>
            );

          case 'p':
            return (
              <p key={key}>
                {block.lines.map((line, li) => (
                  <React.Fragment key={`${key}-p-${li}`}>
                    {li > 0 && <br />}
                    {renderInline(line, `${key}-p-${li}`)}
                  </React.Fragment>
                ))}
              </p>
            );
        }
      })}
    </div>
  );
}
