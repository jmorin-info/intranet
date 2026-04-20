import React from 'react';
import { cn } from './utils';
import { Shield } from 'lucide-react';

interface IsoControlBadgeProps {
  code: string;
  title?: string;
  onClick?: () => void;
  className?: string;
}

export function IsoControlBadge({ code, title, onClick, className }: IsoControlBadgeProps) {
  const Component = onClick ? 'button' : 'span';
  return (
    <Component
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-seal-navy/10 px-2 py-0.5 text-xs font-semibold text-seal-navy',
        onClick && 'cursor-pointer hover:bg-seal-navy/20 transition-colors',
        className,
      )}
      onClick={onClick}
      title={title}
    >
      <Shield className="h-3 w-3" />
      {code}
    </Component>
  );
}
