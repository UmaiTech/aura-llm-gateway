import { ReactNode } from 'react'
import { clsx } from 'clsx'
import { AlertCircle, AlertTriangle, Info, Lightbulb, CheckCircle } from 'lucide-react'

type CalloutType = 'info' | 'warning' | 'danger' | 'tip' | 'success'

interface CalloutProps {
  type?: CalloutType
  title?: string
  children: ReactNode
}

const calloutConfig: Record<CalloutType, {
  icon: typeof Info
  borderColor: string
  bgColor: string
  iconColor: string
  titleColor: string
}> = {
  info: {
    icon: Info,
    borderColor: 'border-aura-accent',
    bgColor: 'bg-aura-accent/5',
    iconColor: 'text-aura-accent',
    titleColor: 'text-aura-text',
  },
  warning: {
    icon: AlertTriangle,
    borderColor: 'border-aura-amber',
    bgColor: 'bg-aura-amber/10',
    iconColor: 'text-aura-amber',
    titleColor: 'text-aura-text',
  },
  danger: {
    icon: AlertCircle,
    borderColor: 'border-aura-red',
    bgColor: 'bg-aura-red/10',
    iconColor: 'text-aura-red',
    titleColor: 'text-aura-text',
  },
  tip: {
    icon: Lightbulb,
    borderColor: 'border-aura-accent',
    bgColor: 'bg-aura-accent/10',
    iconColor: 'text-aura-accent',
    titleColor: 'text-aura-text',
  },
  success: {
    icon: CheckCircle,
    borderColor: 'border-aura-green',
    bgColor: 'bg-aura-green/10',
    iconColor: 'text-aura-green',
    titleColor: 'text-aura-text',
  },
}

const defaultTitles: Record<CalloutType, string> = {
  info: 'Note',
  warning: 'Warning',
  danger: 'Danger',
  tip: 'Tip',
  success: 'Success',
}

export function Callout({ type = 'info', title, children }: CalloutProps) {
  const config = calloutConfig[type]
  const Icon = config.icon
  const displayTitle = title ?? defaultTitles[type]

  return (
    <div
      className={clsx(
        'my-6 rounded-r-panel border-l-2 p-4',
        config.borderColor,
        config.bgColor
      )}
    >
      <div className="flex items-start gap-3">
        <Icon className={clsx('h-5 w-5 mt-0.5 flex-shrink-0', config.iconColor)} aria-hidden />
        <div className="flex-1 min-w-0">
          <p className={clsx('font-semibold mb-1', config.titleColor)}>
            {displayTitle}
          </p>
          <div className="text-aura-muted text-sm [&>p]:mb-0 [&>p:last-child]:mb-0">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
