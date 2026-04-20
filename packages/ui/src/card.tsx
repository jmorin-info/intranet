import React from 'react';
import { cn } from './utils';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Accent orange SEAL signature en haut */
  accent?: boolean;
  /** Variante PANTONE OMNITECH : oriente la couleur d'accent */
  variant?: 'default' | 'orange' | 'blue' | 'green' | 'bordeaux';
  hoverable?: boolean;
}

const VARIANT_BORDER: Record<NonNullable<CardProps['variant']>, string> = {
  default: '',
  orange: 'border-t-[3px] border-t-[#F9964A]',     // PANTONE 715C
  blue: 'border-t-[3px] border-t-[#296DC1]',       // PANTONE 660C
  green: 'border-t-[3px] border-t-[#006233]',      // PANTONE 349C
  bordeaux: 'border-t-[3px] border-t-[#892034]',   // PANTONE 202C
};

export function Card({ className, accent, variant = 'default', hoverable, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'bg-card rounded-card border border-gray-200 dark:border-slate-700 shadow-card relative',
        accent && 'border-t-[3px] border-t-[#F9964A]',
        VARIANT_BORDER[variant],
        hoverable && 'card-hover cursor-pointer',
        className,
      )}
      {...props}
    />
  );
}

interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Active le gradient signature SEAL System (blanc → orange) */
  seal?: boolean;
}

export function CardHeader({ className, seal, ...props }: CardHeaderProps) {
  return (
    <div
      className={cn(
        'px-6 py-4 border-b border-gray-100 dark:border-slate-700',
        seal && 'bg-gradient-to-b from-white to-[#F9964A]/[0.08] dark:from-slate-900 dark:to-[#F9964A]/[0.12]',
        className,
      )}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-6 py-4', className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('px-6 py-3 border-t border-gray-100 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-800/50 rounded-b-card', className)}
      {...props}
    />
  );
}
