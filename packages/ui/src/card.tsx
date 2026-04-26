import React from 'react';
import { cn } from './utils';

type CardVariant = 'default' | 'orange' | 'blue' | 'green' | 'bordeaux' | 'bordered' | 'elevated' | 'flat';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Accent orange SEAL signature en haut */
  accent?: boolean;
  /**
   * Variante visuelle :
   * - `default` : fond `bg-card`, bordure légère, ombre carte (existant)
   * - `orange|blue|green|bordeaux` : variantes PANTONE avec accent supérieur (existant)
   * - `bordered` : bordure renforcée, sans ombre — utile listes/configurations
   * - `elevated` : ombre soutenue, fond blanc — surfaces flottantes
   * - `flat` : sans bordure ni ombre — embarqué dans page colorée
   */
  variant?: CardVariant;
  hoverable?: boolean;
}

const VARIANT_BORDER: Record<CardVariant, string> = {
  default: '',
  orange: 'border-t-[3px] border-t-[#F9964A]',     // PANTONE 715C
  blue: 'border-t-[3px] border-t-[#296DC1]',       // PANTONE 660C
  green: 'border-t-[3px] border-t-[#006233]',      // PANTONE 349C
  bordeaux: 'border-t-[3px] border-t-[#892034]',   // PANTONE 202C
  bordered: '',
  elevated: '',
  flat: '',
};

const VARIANT_SURFACE: Record<CardVariant, string> = {
  default: 'bg-card border border-gray-200 dark:border-slate-700 shadow-card',
  orange: 'bg-card border border-gray-200 dark:border-slate-700 shadow-card',
  blue: 'bg-card border border-gray-200 dark:border-slate-700 shadow-card',
  green: 'bg-card border border-gray-200 dark:border-slate-700 shadow-card',
  bordeaux: 'bg-card border border-gray-200 dark:border-slate-700 shadow-card',
  bordered: 'bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-600',
  elevated: 'bg-white dark:bg-slate-900 border border-transparent shadow-md',
  flat: 'bg-white dark:bg-slate-900',
};

export function Card({ className, accent, variant = 'default', hoverable, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-card relative',
        VARIANT_SURFACE[variant],
        accent && 'border-t-[3px] border-t-[#F9964A]',
        VARIANT_BORDER[variant],
        hoverable && 'hover:shadow-md transition-shadow cursor-pointer',
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
        'px-4 sm:px-6 py-4 border-b border-gray-100 dark:border-slate-700',
        seal && 'bg-gradient-to-b from-white to-[#F9964A]/[0.08] dark:from-slate-900 dark:to-[#F9964A]/[0.12]',
        className,
      )}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-4 sm:px-6 py-4', className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('px-4 sm:px-6 py-3 border-t border-gray-100 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-800/50 rounded-b-card', className)}
      {...props}
    />
  );
}
