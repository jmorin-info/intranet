import React, { useState } from 'react';
import { cn } from './utils';

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string | null;
  initials: string;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
};

export function Avatar({ src, initials, size = 'md', className, ...props }: AvatarProps) {
  const [imgError, setImgError] = useState(false);

  if (src && !imgError) {
    return (
      <img
        src={src}
        alt={initials}
        className={cn('rounded-full object-cover', sizeClasses[size], className)}
        onError={() => setImgError(true)}
        {...props}
      />
    );
  }

  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-full bg-primary text-white font-semibold',
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {initials}
    </div>
  );
}
