import { Check, Clock, Rocket, Github, MessageSquare } from 'lucide-react'
import { Link } from 'react-router-dom'

const roadmapData = [
  {
    status: 'launched',
    version: 'v0.1',
    title: 'Launched',
    icon: Check,
    color: 'green',
    features: [
      'Multi-provider support (OpenAI, Anthropic, Google)',
      'Automatic cost tracking',
      'Streaming responses',
      'Request logging & analytics',
    ],
  },
  {
    status: 'in-progress',
    version: 'v0.2',
    title: 'In Progress',
    icon: Clock,
    color: 'blue',
    timeline: 'February 2026',
    features: [
      'Response caching (Redis)',
      'Rate limiting',
      'Metrics & observability',
    ],
  },
  {
    status: 'planned',
    version: 'v0.3+',
    title: 'Planned',
    icon: Rocket,
    color: 'purple',
    timeline: 'Q2-Q4 2026',
    features: [
      'Webhook callbacks',
      'Smart routing & failover',
      'Admin dashboard',
      'Additional providers',
    ],
  },
]

const statusColors = {
  green: {
    bg: 'bg-green-500/10',
    border: 'border-green-500/20',
    text: 'text-green-400',
    icon: 'text-green-500',
  },
  blue: {
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    text: 'text-blue-400',
    icon: 'text-blue-500',
  },
  purple: {
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/20',
    text: 'text-purple-400',
    icon: 'text-purple-500',
  },
  yellow: {
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/20',
    text: 'text-yellow-400',
    icon: 'text-yellow-500',
  },
}

export function RoadmapPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-lg">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Link to="/docs" className="text-sm text-gray-400 hover:text-white mb-4 inline-block">
            ← Back to Docs
          </Link>
          <h1 className="text-4xl font-bold mb-4 gradient-text">Roadmap</h1>
          <p className="text-xl text-gray-400 max-w-3xl">
            Our vision for Aura is to be the most powerful, easiest-to-use LLM gateway for production applications.
          </p>
        </div>
      </div>

      {/* Current Version Banner */}
      <div className="bg-gradient-to-r from-aura-500/10 to-primary-500/10 border-y border-aura-500/20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Current Version</p>
              <p className="text-2xl font-bold text-white">v0.1.7</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-400">Next Release</p>
              <p className="text-lg font-semibold text-aura-400">v0.2.0 · February 2026</p>
            </div>
          </div>
        </div>
      </div>

      {/* Roadmap Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="space-y-12">
          {roadmapData.map((section, idx) => {
            const colors = statusColors[section.color as keyof typeof statusColors]
            const Icon = section.icon

            return (
              <div key={idx} className="relative">
                {/* Section Header */}
                <div className="flex items-center gap-4 mb-6">
                  <div className={`h-12 w-12 rounded-xl ${colors.bg} border ${colors.border} flex items-center justify-center`}>
                    <Icon className={`h-6 w-6 ${colors.icon}`} />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white">{section.title}</h2>
                    <div className="flex items-center gap-3 mt-1">
                      {section.version && (
                        <span className={`text-sm font-mono ${colors.text}`}>{section.version}</span>
                      )}
                      {section.timeline && (
                        <span className="text-sm text-gray-500">{section.timeline}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Features List */}
                <div className="ml-16">
                  <ul className="space-y-2">
                    {section.features.map((feature, featureIdx) => (
                      <li key={featureIdx} className="flex items-center gap-3 text-gray-300">
                        <div className={`h-1.5 w-1.5 rounded-full ${colors.bg}`} />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )
          })}
        </div>

        {/* Community Section */}
        <div className="mt-16 bg-gradient-to-br from-gray-900 to-gray-950 border border-gray-800 rounded-xl p-8">
          <h2 className="text-2xl font-bold mb-4 text-white">Help Shape the Future</h2>
          <p className="text-gray-400 mb-6">
            Request features or vote on what matters most to you.
          </p>
          <div className="flex gap-4">
            <a
              href="https://github.com/UmaiTech/aura-llm-gateway/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary gap-2"
            >
              <Github className="h-4 w-4" />
              GitHub Issues
            </a>
            <a
              href="https://github.com/UmaiTech/aura-llm-gateway/discussions"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary gap-2"
            >
              <MessageSquare className="h-4 w-4" />
              Discussions
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
