import React from 'react';

interface LetChatLogoProps {
  size?: number;
  className?: string;
}

export default function LetChatLogo({ size = 40, className = '' }: LetChatLogoProps) {
  return (
    <div
      className={`inline-flex items-center justify-center rounded-2xl bg-white shadow-sm border border-slate-200 dark:border-zinc-800 shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        width={size * 0.78}
        height={size * 0.78}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="LetChat Logo"
      >
        {/* Back speech bubble - Dark Blue #0A3D62 */}
        <path
          d="M12 16C12 11.5817 15.5817 8 20 8H42C46.4183 8 50 11.5817 50 16V30C50 34.4183 46.4183 38 42 38H24L14 45V38C12.8 36.7 12 34.9 12 33V16Z"
          fill="#0A3D62"
        />
        {/* Front overlapping speech bubble - Teal #1AA7B8 */}
        <path
          d="M22 26C22 21.5817 25.5817 18 30 18H48C52.4183 18 56 21.5817 56 26V40C56 44.4183 52.4183 48 48 48H46V56L36 48H30C25.5817 48 22 44.4183 22 40V26Z"
          fill="#1AA7B8"
          stroke="#FFFFFF"
          strokeWidth="2.5"
        />
        {/* Network connection lines & dots inside teal bubble */}
        <line x1="32" y1="35" x2="39" y2="29" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
        <line x1="39" y1="29" x2="46" y2="35" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
        <line
          x1="32"
          y1="35"
          x2="46"
          y2="35"
          stroke="#FFFFFF"
          strokeWidth="1.5"
          strokeOpacity="0.7"
          strokeLinecap="round"
        />
        <circle cx="32" cy="35" r="2.8" fill="#FFFFFF" />
        <circle cx="39" cy="29" r="2.8" fill="#FFFFFF" />
        <circle cx="46" cy="35" r="2.8" fill="#FFFFFF" />
      </svg>
    </div>
  );
}
