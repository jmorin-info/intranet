import React from 'react';
import { cn } from '@/lib/utils';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {}

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse bg-gray-200 dark:bg-slate-700 rounded',
        className,
      )}
      {...props}
    />
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm',
        className,
      )}
    >
      <div className="flex items-start gap-4">
        <Skeleton className="h-10 w-10 rounded-lg flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-4/5" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonRow({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex items-center gap-4 border-b border-gray-100 dark:border-slate-800 px-4 py-3',
        className,
      )}
    >
      <Skeleton className="h-4 flex-1" />
      <Skeleton className="h-4 w-1/6" />
      <Skeleton className="h-4 w-1/6" />
      <Skeleton className="h-4 w-1/12" />
    </div>
  );
}

interface SkeletonListProps {
  count?: number;
  variant?: 'card' | 'row';
  className?: string;
}

export function SkeletonList({
  count = 5,
  variant = 'card',
  className,
}: SkeletonListProps) {
  const Item = variant === 'row' ? SkeletonRow : SkeletonCard;
  return (
    <div
      className={cn(
        variant === 'card' ? 'space-y-3' : 'divide-y divide-gray-100 dark:divide-slate-800',
        className,
      )}
    >
      {Array.from({ length: count }).map((_, i) => (
        <Item key={i} />
      ))}
    </div>
  );
}
