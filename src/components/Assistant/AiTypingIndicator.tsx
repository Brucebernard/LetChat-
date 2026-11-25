import React from 'react';

interface AiTypingIndicatorProps {
  label?: string;
}

export default function AiTypingIndicator({ label = 'Typing...' }: AiTypingIndicatorProps) {
  return (
    <div className="flex justify-start" role="status" aria-live="polite">
      <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-2xl rounded-bl-sm bg-slate-100 dark:bg-zinc-900 text-slate-600 dark:text-zinc-300">
        <span className="flex items-center gap-1" aria-hidden="true">
          <span className="w-1.5 h-1.5 rounded-full bg-[#1AA7B8] animate-ai-typing-dot" />
          <span className="w-1.5 h-1.5 rounded-full bg-[#1AA7B8] animate-ai-typing-dot [animation-delay:140ms]" />
          <span className="w-1.5 h-1.5 rounded-full bg-[#1AA7B8] animate-ai-typing-dot [animation-delay:280ms]" />
        </span>
        <span className="text-xs font-medium">{label}</span>
      </div>
    </div>
  );
}
