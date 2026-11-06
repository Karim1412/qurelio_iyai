'use client';

import React from 'react';
import { Check } from '@/components/icons';
import { cn } from '@/utils/cn';

export interface Step {
  label: string;
  subtitle: string;
}

interface StepperProps {
  steps: Step[];
  currentStep: number;
  completedSteps: number[];
}

export function Stepper({ steps, currentStep, completedSteps }: StepperProps) {
  return (
    <nav aria-label="Progress" className="w-full">
      <ol className="flex items-start">
        {steps.map((step, index) => {
          const isCompleted = completedSteps.includes(index);
          const isCurrent = currentStep === index;
          const isUpcoming = !isCompleted && !isCurrent;

          return (
            <li
              key={step.label}
              className={cn('flex flex-1', index < steps.length - 1 && 'pr-1')}
            >
              <div className="flex w-full flex-col items-center">
                {/* Circle + Label row */}
                <div className="flex w-full items-start gap-3">
                  {/* Circle */}
                  <div
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold transition-all duration-300',
                      isCompleted &&
                        'border-[var(--brand-primary)] bg-[var(--brand-primary)] text-white',
                      isCurrent &&
                        'border-[var(--brand-primary)] bg-white text-[var(--brand-primary)] shadow-[0_0_0_4px_rgba(77,146,196,0.15)]',
                      isUpcoming && 'border-[var(--input-border)] bg-[var(--surface)] text-[var(--muted)]'
                    )}
                  >
                    {isCompleted ? <Check className="h-4 w-4" strokeWidth={3} /> : index + 1}
                  </div>

                  {/* Label */}
                  <div className="min-w-0 pt-0.5">
                    <p
                      className={cn(
                        'text-[13px] font-semibold leading-tight',
                        isCurrent ? 'text-[var(--text-primary)]' : isCompleted ? 'text-[var(--brand-primary)]' : 'text-[var(--muted)]'
                      )}
                    >
                      {step.label}
                    </p>
                    <p className="mt-0.5 text-[11px] leading-snug text-[var(--muted)]">{step.subtitle}</p>
                  </div>
                </div>

                {/* Connector line */}
                {index < steps.length - 1 && (
                  <div className="mt-3 flex-1 pl-[17px] pr-2">
                    <div className="h-[2px] w-full overflow-hidden rounded-full bg-[var(--input-border)]">
                      <div
                        className={cn(
                          'h-full rounded-full bg-[var(--brand-primary)] transition-all duration-500',
                          isCompleted ? 'w-full' : 'w-0'
                        )}
                      />
                    </div>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
