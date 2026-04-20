/* eslint-disable @next/next/no-img-element */
import React from 'react';

interface OmnitechLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'full' | 'icon';
  className?: string;
}

const sizes = {
  sm: { full: { w: 160, h: 36 }, icon: 36 },
  md: { full: { w: 200, h: 44 }, icon: 44 },
  lg: { full: { w: 260, h: 56 }, icon: 60 },
  xl: { full: { w: 320, h: 70 }, icon: 80 },
};

export function OmnitechLogo({ size = 'md', variant = 'full', className }: OmnitechLogoProps) {
  const s = sizes[size];
  const isWhite = className?.includes('text-white');

  if (variant === 'icon') {
    return (
      <img
        src={isWhite ? '/logo-icon-white.png' : '/logo-icon.png'}
        alt="OMNITECH Security"
        width={s.icon}
        height={s.icon}
        className={`object-contain ${className || ''}`}
        style={{ width: s.icon, height: s.icon }}
      />
    );
  }

  return (
    <img
      src={isWhite ? '/logo-full-white.png' : '/logo-full.png'}
      alt="OMNITECH Security"
      width={s.full.w}
      height={s.full.h}
      className={`object-contain ${className || ''}`}
      style={{ height: s.full.h }}
    />
  );
}
