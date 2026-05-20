import { ReactNode, Children, isValidElement } from 'react'

interface StepProps {
  title: string
  children: ReactNode
}

export function Step({ title, children }: StepProps) {
  return (
    <div>
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
    <div className="steps">
      {steps.map((step, index) => (
        <div key={index} className="step">
          <div>
            <h4 className="step-title">{step.props.title}</h4>
            <div className="step-body">{step.props.children}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

/* Hallmark · genre: editorial-minimal · macrostructure: workbench · design-system: design.md · designed-as-app */
