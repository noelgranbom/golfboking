'use client'

import { Check } from 'lucide-react'

interface StepIndicatorProps {
  currentStep: number
  steps: string[]
}

export function StepIndicator({ currentStep, steps }: StepIndicatorProps) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {steps.map((label, i) => {
        const step = i + 1
        const isCompleted = step < currentStep
        const isActive = step === currentStep

        return (
          <div key={step} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-[var(--gb-dur-base)] ${
                  isCompleted
                    ? 'bg-[var(--gb-brass)] text-[var(--gb-ink)]'
                    : isActive
                    ? 'bg-[var(--gb-brass)] text-[var(--gb-ink)] ring-4 ring-[var(--gb-brass)]/30'
                    : 'bg-[var(--gb-bg-card)] border border-[var(--gb-border)] text-[var(--gb-fg-soft)]'
                }`}
              >
                {isCompleted ? <Check size={16} strokeWidth={1.75} /> : step}
              </div>
              <span
                className={`text-xs whitespace-nowrap ${
                  isActive
                    ? 'text-[var(--gb-brass)]'
                    : isCompleted
                    ? 'text-[var(--gb-brass-deep)]'
                    : 'text-[var(--gb-fg-soft)]'
                }`}
              >
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={`h-px w-12 mx-1 mb-4 transition-all duration-[var(--gb-dur-base)] ${
                  step < currentStep ? 'bg-[var(--gb-brass)]' : 'bg-[var(--gb-border)]'
                }`}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
