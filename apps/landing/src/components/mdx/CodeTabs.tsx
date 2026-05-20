import { useState, ReactNode, Children, isValidElement } from 'react'

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

  if (tabs.length === 0) return null

  return (
    <div style={{ margin: 'var(--space-5) 0' }}>
      <div style={{ display: 'flex', gap: 'var(--space-4)', borderBottom: '1px solid var(--rule)', marginBottom: 'var(--space-3)' }}>
        {tabs.map((tab, index) => {
          const isActive = activeTab === index
          return (
            <button
              key={index}
              onClick={() => setActiveTab(index)}
              style={{
                background: 'transparent',
                border: 0,
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.75rem',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: isActive ? 'var(--ink)' : 'var(--ink-muted)',
                padding: 'var(--space-2) 0',
                marginBottom: '-1px',
                borderBottom: isActive ? '1px solid var(--ink)' : '1px solid transparent',
                transition: 'color var(--motion-duration-base) var(--motion-ease)',
              }}
            >
              {tab.props.label}
            </button>
          )
        })}
      </div>
      <div>{tabs[activeTab]}</div>
    </div>
  )
}

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

/* Hallmark · genre: editorial-minimal · macrostructure: workbench · design-system: design.md · designed-as-app */
