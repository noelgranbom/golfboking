'use client'

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
                className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                  isCompleted
                    ? 'bg-green-500 text-black'
                    : isActive
                    ? 'bg-green-500 text-black ring-4 ring-green-500/30'
                    : 'bg-white/10 text-white/40'
                }`}
              >
                {isCompleted ? '✓' : step}
              </div>
              <span
                className={`text-xs whitespace-nowrap ${
                  isActive ? 'text-green-400' : isCompleted ? 'text-green-600' : 'text-white/30'
                }`}
              >
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={`h-0.5 w-12 mx-1 mb-4 transition-all ${
                  step < currentStep ? 'bg-green-500' : 'bg-white/10'
                }`}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
