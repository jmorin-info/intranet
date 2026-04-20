import React from 'react';
import { cn } from './utils';
import { Check, Circle, Clock } from 'lucide-react';

export interface WorkflowStep {
  label: string;
  status: 'completed' | 'current' | 'pending';
  date?: string;
  actor?: string;
}

interface WorkflowTimelineProps {
  steps: WorkflowStep[];
  className?: string;
}

export function WorkflowTimeline({ steps, className }: WorkflowTimelineProps) {
  return (
    <div className={cn('space-y-0', className)}>
      {steps.map((step, index) => (
        <div key={index} className="flex gap-3">
          {/* Connector line + icon */}
          <div className="flex flex-col items-center">
            <div
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full border-2',
                step.status === 'completed' && 'border-emerald-500 bg-emerald-500 text-white',
                step.status === 'current' && 'border-primary bg-primary text-white',
                step.status === 'pending' && 'border-gray-300 bg-white text-seal-gray-500',
              )}
            >
              {step.status === 'completed' ? (
                <Check className="h-3.5 w-3.5" />
              ) : step.status === 'current' ? (
                <Clock className="h-3.5 w-3.5" />
              ) : (
                <Circle className="h-3 w-3" />
              )}
            </div>
            {index < steps.length - 1 && (
              <div
                className={cn(
                  'w-0.5 flex-1 min-h-[24px]',
                  step.status === 'completed' ? 'bg-emerald-500' : 'bg-gray-200',
                )}
              />
            )}
          </div>

          {/* Content */}
          <div className="pb-4 pt-0.5">
            <p
              className={cn(
                'text-sm font-semibold',
                step.status === 'pending' ? 'text-seal-gray-500' : 'text-seal-navy',
              )}
            >
              {step.label}
            </p>
            {(step.date || step.actor) && (
              <p className="text-xs text-seal-gray-500 mt-0.5">
                {step.actor && <span>{step.actor}</span>}
                {step.actor && step.date && <span> — </span>}
                {step.date && <span>{step.date}</span>}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
