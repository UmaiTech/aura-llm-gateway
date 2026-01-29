import { ReactNode, Children, isValidElement } from 'react'
import { clsx } from 'clsx'

interface StepProps {
  title: string
  children: ReactNode
}

export function Step({ title, children }: StepProps) {
  return (
    <div className="step-content">
      <h4 className="step-title">{title}</h4>
      <div className="step-body">{children}</div>
    </div>
  )
}

interface StepsProps {
  children: ReactNode
}

export function Steps({ children }: StepsProps) {
  const steps = Children.toArray(children).filter(
    (child): child is React.ReactElement<StepProps> =>
      isValidElement(child) && child.type === Step
  )

  return (
    <div className="my-8 space-y-0">
      {steps.map((step, index) => (
        <div key={index} className="relative flex gap-4">
          {/* Timeline */}
          <div className="flex flex-col items-center">
            {/* Step number */}
            <div
              className={clsx(
                'w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold',
                'bg-aura-500/20 text-aura-400 border border-aura-500/30'
              )}
            >
              {index + 1}
            </div>
            {/* Connector line */}
            {index < steps.length - 1 && (
              <div className="w-0.5 flex-1 bg-gray-800 my-2" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 pb-8">
            <h4 className="text-lg font-semibold text-white mb-2">
              {step.props.title}
            </h4>
            <div className="text-gray-300 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
              {step.props.children}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
