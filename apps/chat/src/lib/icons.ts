// Centralized icon system using MingCute Icons
// All icons include aria-hidden="true" by default for accessibility

import {
  MenuLine,
  SparklesLine,
  SendLine,
  StopCircleLine,
  AttachmentLine,
  User1Line,
  Chat1Line,
  AddLine,
  DeleteLine,
  CloseLine,
  ArrowDownLine,
  ToolLine,
  CopyLine,
  CheckLine,
  Loading3Line,
  CheckCircleLine,
  CloseCircleLine,
  FlashLine,
  ServerLine,
  StopwatchLine,
  CoinLine,
  SearchLine,
  HashtagLine,
  TimeLine,
  CloudLine,
} from '@mingcute/react'
import type { ComponentType, SVGProps } from 'react'

// Export icons with consistent naming
export const MenuIcon = MenuLine
export const SparklesIcon = SparklesLine
export const SendIcon = SendLine
export const StopIcon = StopCircleLine
export const AttachIcon = AttachmentLine
export const UserIcon = User1Line
export const MessageIcon = Chat1Line
export const PlusIcon = AddLine
export const TrashIcon = DeleteLine
export const CloseIcon = CloseLine
export const ChevronDownIcon = ArrowDownLine
export const ToolIcon = ToolLine
export const CopyIcon = CopyLine
export const CheckIcon = CheckLine
export const LoadingIcon = Loading3Line
export const SuccessIcon = CheckCircleLine
export const ErrorIcon = CloseCircleLine
export const ZapIcon = FlashLine
export const ServerIcon = ServerLine
export const TimerIcon = StopwatchLine
export const CoinIcon = CoinLine
export const SearchIcon = SearchLine
export const CalculatorIcon = HashtagLine // Using hashtag as calculator alternative
export const ClockIcon = TimeLine
export const CloudIcon = CloudLine

// Icon component type
export type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>

// Default icon props with accessibility
export const defaultIconProps = {
  size: 20,
  'aria-hidden': 'true' as const,
}

// Tool-specific icon configurations
export interface ToolIconConfig {
  Icon: IconComponent
  color: string
  bgColor: string
}

export const TOOL_ICONS: Record<string, ToolIconConfig> = {
  web_search: {
    Icon: SearchIcon,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
  },
  calculate: {
    Icon: CalculatorIcon,
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
  },
  get_current_time: {
    Icon: ClockIcon,
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
  },
  get_weather: {
    Icon: CloudIcon,
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/10',
  },
  default: {
    Icon: ToolIcon,
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/10',
  },
}

// Helper to get tool icon configuration
export function getToolIconConfig(toolName: string): ToolIconConfig {
  return TOOL_ICONS[toolName] || TOOL_ICONS.default
}
