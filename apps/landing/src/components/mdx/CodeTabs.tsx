import { useState, ReactNode, Children, isValidElement } from 'react'
import { clsx } from 'clsx'

interface CodeTabProps {
  label: string
  children: ReactNode
}

export function CodeTab({ children }: CodeTabProps) {
  return <>{children}</>
}

interface CodeTabsProps {
  children: ReactNode
  defaultTab?: number
}

export function CodeTabs({ children, defaultTab = 0 }: CodeTabsProps) {
  const [activeTab, setActiveTab] = useState(defaultTab)

  const tabs = Children.toArray(children).filter(
    (child): child is React.ReactElement<CodeTabProps> =>
      isValidElement(child) && child.type === CodeTab
  )

  if (tabs.length === 0) {
    return null
  }

  return (
    <div className="my-6 max-w-full rounded-panel overflow-hidden border border-aura-border bg-[#0f172a]">
      {/* Tab headers */}
      <div className="flex overflow-x-auto border-b border-white/10 bg-white/5" role="tablist" aria-label="Code samples">
        {tabs.map((tab, index) => (
          <button
            key={index}
            type="button"
            role="tab"
            aria-selected={activeTab === index}
            onClick={() => setActiveTab(index)}
            className={clsx(
              'px-4 py-2 text-sm font-medium transition-colors relative whitespace-nowrap',
              activeTab === index
                ? 'text-violet-300'
                : 'text-slate-400 hover:text-white'
            )}
          >
            {tab.props.label}
            {activeTab === index && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-400" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="[&>*]:my-0 [&>div>pre]:rounded-none [&>div>pre]:border-0">
        {tabs[activeTab]}
      </div>
    </div>
  )
}

// Language icons for visual appeal
const languageLabels: Record<string, string> = {
  python: 'Python',
  typescript: 'TypeScript',
  javascript: 'JavaScript',
  bash: 'Terminal',
  shell: 'Terminal',
  curl: 'cURL',
  json: 'JSON',
  rust: 'Rust',
  go: 'Go',
}

export function getLanguageLabel(lang: string): string {
  return languageLabels[lang.toLowerCase()] || lang
}
