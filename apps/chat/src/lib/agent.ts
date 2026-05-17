// Agent configuration and tool definitions for the chat playground
// Uses the Aura Gateway as the API base

import type { Tool } from './types'

// Built-in tools that the agent can use
export const BUILT_IN_TOOLS: Tool[] = [
  {
    type: 'function',
    name: 'get_current_time',
    description: 'Get the current date and time in a specified timezone',
    parameters: {
      type: 'object',
      properties: {
        timezone: {
          type: 'string',
          description: 'The timezone to get the time for (e.g., "America/New_York", "Europe/London", "UTC")',
        },
      },
      required: [],
    },
  },
  {
    type: 'function',
    name: 'calculate',
    description: 'Perform mathematical calculations. Supports basic arithmetic, percentages, and common math functions.',
    parameters: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: 'The mathematical expression to evaluate (e.g., "2 + 2", "15% of 200", "sqrt(16)")',
        },
      },
      required: ['expression'],
    },
  },
  {
    type: 'function',
    name: 'web_search',
    description: 'Search the web for information on a given topic. Returns relevant search results.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query',
        },
        num_results: {
          type: 'number',
          description: 'Number of results to return (default: 5, max: 10)',
        },
      },
      required: ['query'],
    },
  },
  {
    type: 'function',
    name: 'get_weather',
    description: 'Get current weather information for a location',
    parameters: {
      type: 'object',
      properties: {
        location: {
          type: 'string',
          description: 'The city or location to get weather for (e.g., "San Francisco, CA")',
        },
        units: {
          type: 'string',
          enum: ['celsius', 'fahrenheit'],
          description: 'Temperature units (default: celsius)',
        },
      },
      required: ['location'],
    },
  },
]

// Tavily API configuration
const TAVILY_API_KEY = import.meta.env.VITE_TAVILY_API_KEY || ''
const TAVILY_API_URL = 'https://api.tavily.com/search'

interface TavilySearchResult {
  title: string
  url: string
  content: string
  score: number
}

interface TavilyResponse {
  results: TavilySearchResult[]
  query: string
  answer?: string
}

// Web search using Tavily API
async function tavilySearch(
  query: string,
  numResults: number = 5
): Promise<{ results: Array<{ title: string; url: string; snippet: string }>; answer?: string }> {
  if (!TAVILY_API_KEY) {
    // Return simulated results if no API key
    return {
      results: [
        {
          title: `Search result for "${query}"`,
          url: `https://example.com/search?q=${encodeURIComponent(query)}`,
          snippet: `Simulated result. Set VITE_TAVILY_API_KEY to enable real web search.`,
        },
      ],
    }
  }

  try {
    const response = await fetch(TAVILY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: TAVILY_API_KEY,
        query,
        max_results: numResults,
        search_depth: 'basic',
        include_answer: true,
        include_raw_content: false,
      }),
    })

    if (!response.ok) {
      throw new Error(`Tavily API error: ${response.status}`)
    }

    const data: TavilyResponse = await response.json()

    return {
      results: data.results.map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.content,
      })),
      answer: data.answer,
    }
  } catch (error) {
    console.error('Tavily search failed:', error)
    return {
      results: [
        {
          title: 'Search failed',
          url: '',
          snippet: `Failed to search: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
      ],
    }
  }
}

// Tool execution handlers
export async function executeTool(
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  switch (name) {
    case 'get_current_time': {
      const timezone = (args.timezone as string) || 'UTC'
      try {
        const now = new Date()
        const formatted = now.toLocaleString('en-US', {
          timeZone: timezone,
          dateStyle: 'full',
          timeStyle: 'long',
        })
        return JSON.stringify({ timezone, datetime: formatted })
      } catch {
        return JSON.stringify({ error: `Invalid timezone: ${timezone}` })
      }
    }

    case 'calculate': {
      const expression = args.expression as string
      try {
        // Safe math evaluation (very basic)
        const sanitized = expression
          .replace(/[^0-9+\-*/().%\s]/g, '')
          .replace(/(\d+)%\s*of\s*(\d+)/gi, '($1/100)*$2')
          .replace(/sqrt\(([^)]+)\)/gi, 'Math.sqrt($1)')
          .replace(/pow\(([^,]+),([^)]+)\)/gi, 'Math.pow($1,$2)')

        // eslint-disable-next-line no-eval
        const result = eval(sanitized)
        return JSON.stringify({ expression, result })
      } catch {
        return JSON.stringify({ error: `Could not evaluate: ${expression}` })
      }
    }

    case 'web_search': {
      const query = args.query as string
      const numResults = Math.min((args.num_results as number) || 5, 10)

      const searchResults = await tavilySearch(query, numResults)

      return JSON.stringify({
        query,
        results: searchResults.results,
        answer: searchResults.answer,
      })
    }

    case 'get_weather': {
      const location = args.location as string
      const units = (args.units as string) || 'celsius'

      // Simulated weather data
      // TODO: Integrate with a real weather API (OpenWeatherMap, WeatherAPI, etc.)
      const temp = units === 'fahrenheit' ? 72 : 22
      const weather = {
        location,
        temperature: temp,
        units,
        condition: 'Partly cloudy',
        humidity: 65,
        wind: '10 mph NW',
        forecast: 'Clear skies expected later today',
        note: 'This is simulated data. Connect to a real weather API for production.',
      }

      return JSON.stringify(weather)
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` })
  }
}

// Agent system prompts
export const AGENT_SYSTEM_PROMPTS = {
  default: `You are a helpful AI assistant with access to tools. Use the available tools when they would help answer the user's question. Always explain what you're doing and provide clear, helpful responses.`,

  researcher: `You are a research assistant with access to web search and other tools. When asked about current events, facts, or topics you're unsure about, use the web_search tool to find accurate information. Always cite your sources.`,

  calculator: `You are a math assistant with access to calculation tools. Help users with mathematical problems by breaking them down step by step and using the calculate tool for computations.`,

  assistant: `You are a general-purpose assistant with access to various tools including time, weather, search, and calculations. Use these tools proactively when they would help answer the user's questions. Be concise but thorough.`,
}

// Available models
export const AVAILABLE_MODELS: Array<{
  id: string
  name: string
  provider: 'openai' | 'anthropic' | 'google'
}> = [
  // OpenAI - Latest models first
  { id: 'gpt-5.5-pro', name: 'GPT-5.5 Pro', provider: 'openai' },
  { id: 'gpt-5.5', name: 'GPT-5.5', provider: 'openai' },
  { id: 'gpt-5.4', name: 'GPT-5.4', provider: 'openai' },
  { id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini', provider: 'openai' },
  { id: 'gpt-5.4-nano', name: 'GPT-5.4 Nano', provider: 'openai' },
  { id: 'gpt-5.2', name: 'GPT-5.2', provider: 'openai' },
  { id: 'gpt-5', name: 'GPT-5', provider: 'openai' },
  { id: 'gpt-5-mini', name: 'GPT-5 Mini', provider: 'openai' },
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai' },
  { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'openai' },
  { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: 'openai' },

  // Anthropic - Latest models first
  { id: 'claude-opus-4-7', name: 'Claude Opus 4.7', provider: 'anthropic' },
  { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', provider: 'anthropic' },
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', provider: 'anthropic' },
  { id: 'claude-opus-4-5-20251101', name: 'Claude Opus 4.5', provider: 'anthropic' },
  { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'anthropic' },
  { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', provider: 'anthropic' },

  // Google - Latest models first
  { id: 'gemini-3-pro', name: 'Gemini 3 Pro', provider: 'google' },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'google' },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'google' },
]
