import React from 'react';
import { BadgeCheck } from 'lucide-react';
import { Profile } from '../../types';
import { getAvatarInitial, getDisplayName } from '../../utils/appCache';

export function VerifiedNameBadge({
  isVerified,
  size = 14,
  className = '',
}: {
  isVerified?: boolean | null;
  size?: number;
  className?: string;
}) {
  if (!isVerified) return null;
  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 ${className}`}
      title="Verified LetChat FLOW Account"
      aria-label="Verified Account"
    >
      <BadgeCheck
        size={size}
        className="text-[#1D9BF0] fill-[#1D9BF0]/20 drop-shadow-[0_0_6px_rgba(29,155,240,0.45)]"
      />
    </span>
  );
}

export function VerifiedAvatarBadge({
  isVerified,
  size = 15,
}: {
  isVerified?: boolean | null;
  size?: number;
}) {
  if (!isVerified) return null;
  return (
    <span
      className="absolute -bottom-0.5 -right-0.5 rounded-full bg-[#0A0A0A] p-[1px] flex items-center justify-center shadow-md"
      title="Verified Account"
      aria-label="Verified Account"
    >
      <BadgeCheck size={size} className="text-white fill-[#1D9BF0]" />
    </span>
  );
}

export function ProfileAvatar({
  profile,
  fallbackName,
  sizeClass = 'w-10 h-10 text-sm',
  roundedClass = 'rounded-full',
  badgeSize = 14,
  ringClass = '',
}: {
  profile?: Partial<Profile> | null;
  fallbackName?: string;
  sizeClass?: string;
  roundedClass?: string;
  badgeSize?: number;
  ringClass?: string;
}) {
  const label = profile ? getDisplayName(profile) : fallbackName || 'LetChat Member';
  const initial = getAvatarInitial(profile, fallbackName);
  const avatarUrl = profile?.avatar_url;

  return (
    <div className={`relative shrink-0 ${sizeClass}`}>
      <div
        className={`w-full h-full ${roundedClass} bg-gradient-to-br from-[#7C3AED] to-[#00E5FF] flex items-center justify-center font-bold text-white overflow-hidden ${ringClass}`}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt={label} className="w-full h-full object-cover" />
        ) : (
          <span>{initial}</span>
        )}
      </div>
      <VerifiedAvatarBadge isVerified={profile?.is_verified} size={badgeSize} />
    </div>
  );
}
