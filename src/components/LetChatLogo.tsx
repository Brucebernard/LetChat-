import React from 'react';

interface LetChatLogoProps {
  size?: number;
  className?: string;
}

export default function LetChatLogo({ size = 40, className = '' }: LetChatLogoProps) {
  return (
    <div
      className={`inline-flex items-center justify-center rounded-2xl bg-[#0A0A0A] border border-white/15 shadow-[0_8px_24px_rgba(124,58,237,0.28)] shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        width={size * 0.72}
        height={size * 0.72}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="LetChat FLOW Logo"
      >
        <defs>
          <linearGradient id="flowGrad" x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#7C3AED" />
            <stop offset="55%" stopColor="#4F46E5" />
            <stop offset="100%" stopColor="#00E5FF" />
          </linearGradient>
        </defs>
        <path
          d="M14 14C14 10.6863 16.6863 8 20 8H44C50.6274 8 56 13.3726 56 20V34C56 40.6274 50.6274 46 44 46H26L14 56V14Z"
          fill="url(#flowGrad)"
          fillOpacity="0.18"
          stroke="url(#flowGrad)"
          strokeWidth="3.2"
          strokeLinejoin="round"
        />
        <path
          d="M22 27C25 22 28.5 22 31.5 27C34.5 32 38 32 41 27C43 23.6 45 23.6 47 26"
          stroke="#00E5FF"
          strokeWidth="3.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="22" cy="27" r="2.6" fill="#FFFFFF" />
        <circle cx="47" cy="26" r="2.6" fill="#00E5FF" />
      </svg>
    </div>
  );
}
