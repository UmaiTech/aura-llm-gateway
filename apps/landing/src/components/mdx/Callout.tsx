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
    borderColor: 'border-blue-500',
    bgColor: 'bg-blue-500/10',
    iconColor: 'text-blue-400',
    titleColor: 'text-blue-300',
  },
  warning: {
    icon: AlertTriangle,
    borderColor: 'border-yellow-500',
    bgColor: 'bg-yellow-500/10',
    iconColor: 'text-yellow-400',
    titleColor: 'text-yellow-300',
  },
  danger: {
    icon: AlertCircle,
    borderColor: 'border-red-500',
    bgColor: 'bg-red-500/10',
    iconColor: 'text-red-400',
    titleColor: 'text-red-300',
  },
  tip: {
    icon: Lightbulb,
    borderColor: 'border-purple-500',
    bgColor: 'bg-purple-500/10',
    iconColor: 'text-purple-400',
    titleColor: 'text-purple-300',
  },
  success: {
    icon: CheckCircle,
    borderColor: 'border-green-500',
    bgColor: 'bg-green-500/10',
    iconColor: 'text-green-400',
    titleColor: 'text-green-300',
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
        'my-6 rounded-lg border-l-4 p-4',
        config.borderColor,
        config.bgColor
      )}
    >
      <div className="flex items-start gap-3">
        <Icon className={clsx('h-5 w-5 mt-0.5 flex-shrink-0', config.iconColor)} />
        <div className="flex-1 min-w-0">
          <p className={clsx('font-semibold mb-1', config.titleColor)}>
            {displayTitle}
          </p>
          <div className="text-gray-300 text-sm [&>p]:mb-0 [&>p:last-child]:mb-0">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
