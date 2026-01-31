import { useState, useRef, useEffect } from 'react'
import { Menu, Wrench, Route, ChevronDown, Check, Shield, Sparkles } from 'lucide-react'
import { cn } from '../lib/utils'
import { ThemeToggle } from './ThemeToggle'
import { ROUTING_STRATEGIES, VALIDATION_STRATEGIES, CONSISTENCY_STRATEGIES, type RoutingStrategy, type ValidationStrategy, type ConsistencyStrategy } from '../lib/types'

interface HeaderProps {
  onToggleSidebar: () => void
  sidebarOpen: boolean
  agentMode: boolean
  onAgentModeChange: (enabled: boolean) => void
  routingStrategy: RoutingStrategy
  onRoutingStrategyChange: (strategy: RoutingStrategy) => void
  validationStrategy: ValidationStrategy
  onValidationStrategyChange: (strategy: ValidationStrategy) => void
  consistencyStrategy: ConsistencyStrategy
  onConsistencyStrategyChange: (strategy: ConsistencyStrategy) => void
}

export function Header({
  onToggleSidebar,
  sidebarOpen,
  agentMode,
  onAgentModeChange,
  routingStrategy,
  onRoutingStrategyChange,
  validationStrategy,
  onValidationStrategyChange,
  consistencyStrategy,
  onConsistencyStrategyChange,
}: HeaderProps) {
  const [routingDropdownOpen, setRoutingDropdownOpen] = useState(false)
  const [validationDropdownOpen, setValidationDropdownOpen] = useState(false)
  const [consistencyDropdownOpen, setConsistencyDropdownOpen] = useState(false)
  const routingDropdownRef = useRef<HTMLDivElement>(null)
  const validationDropdownRef = useRef<HTMLDivElement>(null)
  const consistencyDropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (routingDropdownRef.current && !routingDropdownRef.current.contains(event.target as Node)) {
        setRoutingDropdownOpen(false)
      }
      if (validationDropdownRef.current && !validationDropdownRef.current.contains(event.target as Node)) {
        setValidationDropdownOpen(false)
      }
      if (consistencyDropdownRef.current && !consistencyDropdownRef.current.contains(event.target as Node)) {
        setConsistencyDropdownOpen(false)
      }
    }

    if (routingDropdownOpen || validationDropdownOpen || consistencyDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [routingDropdownOpen, validationDropdownOpen, consistencyDropdownOpen])

  const currentStrategy = ROUTING_STRATEGIES.find(s => s.id === routingStrategy) || ROUTING_STRATEGIES[0]
  const currentValidation = VALIDATION_STRATEGIES.find(s => s.id === validationStrategy) || VALIDATION_STRATEGIES[0]
  const currentConsistency = CONSISTENCY_STRATEGIES.find(s => s.id === consistencyStrategy) || CONSISTENCY_STRATEGIES[0]

  return (
    <header className="flex h-14 items-center justify-between border-b border-border/50 glass px-4 shadow-premium">
      <div className="flex items-center gap-3">
        {/* Sidebar toggle */}
        <button
          onClick={onToggleSidebar}
          className={cn(
            "p-2 rounded-lg hover:bg-secondary transition-colors",
            !sidebarOpen && "bg-secondary"
          )}
          aria-label="Toggle sidebar"
        >
          <Menu className="h-5 w-5 text-muted-foreground" />
        </button>

        {/* Logo */}
        <div className="flex items-center gap-2">
          <img src="/logo.svg" alt="Aura" className="h-8 w-8 logo-pulse" />
          <span className="font-semibold text-lg hidden sm:inline">Aura</span>
        </div>
      </div>

      {/* Right side controls */}
      <div className="flex items-center gap-3">
        {/* Routing strategy selector */}
        <div className="relative" ref={routingDropdownRef}>
          <button
            onClick={() => setRoutingDropdownOpen(!routingDropdownOpen)}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors",
              "border-border hover:bg-secondary text-muted-foreground"
            )}
            title={`Routing: ${currentStrategy.name} - ${currentStrategy.description}`}
          >
            <Route className="h-4 w-4" />
            <span className="text-sm font-medium hidden md:inline">{currentStrategy.name}</span>
            <ChevronDown className={cn(
              "h-3.5 w-3.5 transition-transform hidden sm:block",
              routingDropdownOpen && "rotate-180"
            )} />
          </button>

          {/* Dropdown menu */}
          {routingDropdownOpen && (
            <div className="absolute right-0 top-full mt-2 w-72 rounded-xl glass-card shadow-premium-xl z-50 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="p-2">
                <div className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider border-b border-border mb-2">
                  Routing Strategy
                </div>
                {ROUTING_STRATEGIES.map((strategy) => (
                  <button
                    key={strategy.id}
                    onClick={() => {
                      onRoutingStrategyChange(strategy.id)
                      setRoutingDropdownOpen(false)
                    }}
                    className={cn(
                      "w-full flex items-start gap-3 px-3 py-2 rounded-lg text-left hover:bg-secondary transition-colors",
                      strategy.id === routingStrategy && "bg-primary-500/10"
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className={cn(
                        "text-sm font-medium",
                        strategy.id === routingStrategy ? "text-primary-400" : "text-foreground"
                      )}>
                        {strategy.name}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {strategy.description}
                      </div>
                    </div>
                    {strategy.id === routingStrategy && (
                      <Check className="h-4 w-4 text-primary-400 flex-shrink-0 mt-0.5" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Validation strategy selector */}
        <div className="relative" ref={validationDropdownRef}>
          <button
            onClick={() => setValidationDropdownOpen(!validationDropdownOpen)}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors",
              validationStrategy !== 'none'
                ? "border-success-500/50 bg-success-500/10 text-success-400"
                : "border-border hover:bg-secondary text-muted-foreground"
            )}
            title={`Validation: ${currentValidation.name} - ${currentValidation.description}`}
          >
            <Shield className="h-4 w-4" />
            <span className="text-sm font-medium hidden md:inline">{currentValidation.name}</span>
            <ChevronDown className={cn(
              "h-3.5 w-3.5 transition-transform hidden sm:block",
              validationDropdownOpen && "rotate-180"
            )} />
          </button>

          {/* Dropdown menu */}
          {validationDropdownOpen && (
            <div className="absolute right-0 top-full mt-2 w-72 rounded-xl glass-card shadow-premium-xl z-50 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="p-2">
                <div className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider border-b border-border mb-2">
                  Response Validation
                </div>
                {VALIDATION_STRATEGIES.map((strategy) => (
                  <button
                    key={strategy.id}
                    onClick={() => {
                      onValidationStrategyChange(strategy.id)
                      setValidationDropdownOpen(false)
                    }}
                    className={cn(
                      "w-full flex items-start gap-3 px-3 py-2 rounded-lg text-left hover:bg-secondary transition-colors",
                      strategy.id === validationStrategy && "bg-success-500/10"
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className={cn(
                        "text-sm font-medium",
                        strategy.id === validationStrategy ? "text-success-400" : "text-foreground"
                      )}>
                        {strategy.name}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {strategy.description}
                      </div>
                    </div>
                    {strategy.id === validationStrategy && (
                      <Check className="h-4 w-4 text-success-400 flex-shrink-0 mt-0.5" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Consistency strategy selector */}
        <div className="relative" ref={consistencyDropdownRef}>
          <button
            onClick={() => setConsistencyDropdownOpen(!consistencyDropdownOpen)}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors",
              consistencyStrategy !== 'none'
                ? "border-warning-500/50 bg-warning-500/10 text-warning-400"
                : "border-border hover:bg-secondary text-muted-foreground"
            )}
            title={`Consistency: ${currentConsistency.name} - ${currentConsistency.description}`}
          >
            <Sparkles className="h-4 w-4" />
            <span className="text-sm font-medium hidden md:inline">{currentConsistency.name}</span>
            <ChevronDown className={cn(
              "h-3.5 w-3.5 transition-transform hidden sm:block",
              consistencyDropdownOpen && "rotate-180"
            )} />
          </button>

          {/* Dropdown menu */}
          {consistencyDropdownOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 rounded-xl glass-card shadow-premium-xl z-50 animate-in fade-in slide-in-from-top-2 duration-200 max-h-[70vh] overflow-y-auto">
              <div className="p-2">
                <div className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider border-b border-border mb-2">
                  Response Consistency
                </div>
                {CONSISTENCY_STRATEGIES.map((strategy) => (
                  <button
                    key={strategy.id}
                    onClick={() => {
                      onConsistencyStrategyChange(strategy.id)
                      setConsistencyDropdownOpen(false)
                    }}
                    className={cn(
                      "w-full flex items-start gap-3 px-3 py-2 rounded-lg text-left hover:bg-secondary transition-colors",
                      strategy.id === consistencyStrategy && "bg-warning-500/10"
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className={cn(
                        "text-sm font-medium",
                        strategy.id === consistencyStrategy ? "text-warning-400" : "text-foreground"
                      )}>
                        {strategy.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {strategy.description}
                      </div>
                    </div>
                    {strategy.id === consistencyStrategy && (
                      <Check className="h-4 w-4 text-warning-400 flex-shrink-0 mt-0.5" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Theme toggle */}
        <ThemeToggle />

        {/* Agent mode toggle */}
        <button
          onClick={() => onAgentModeChange(!agentMode)}
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors",
            agentMode
              ? "border-primary-500 bg-primary-500/10 text-primary-400"
              : "border-border hover:bg-secondary text-muted-foreground"
          )}
          title={agentMode ? "Agent mode enabled (with tools)" : "Click to enable agent mode with tools"}
        >
          <Wrench className="h-4 w-4" />
          <span className="text-sm font-medium hidden sm:inline">
            {agentMode ? "Agent" : "Chat"}
          </span>
        </button>
      </div>
    </header>
  )
}
