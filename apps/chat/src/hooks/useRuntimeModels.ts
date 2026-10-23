import { useEffect, useMemo, useState } from 'react'
import { AVAILABLE_MODELS } from '../lib/agent'
import { parseCatalog, resolveModels, type RuntimeCatalog } from '../lib/catalog'
import type { Model } from '../lib/types'

const API_BASE = import.meta.env.VITE_PROXY_BASE_URL || '/api/proxy'
const TIMEOUT_MS = 8000

/**
 * Models to offer in the picker. Auto aliases come from the gateway's
 * runtime catalog (`GET /v1/models`) so they match what it accepts; the
 * built-in list is used until it answers, and kept if it can't.
 */
export function useRuntimeModels(): { models: Model[]; catalog: RuntimeCatalog | null } {
  const [catalog, setCatalog] = useState<RuntimeCatalog | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    fetch(`${API_BASE}/v1/models`, { credentials: 'include', signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => setCatalog(parseCatalog(body)))
      .catch(() => {
        // Offline, timed out or not authorised: keep the built-in list.
      })
      .finally(() => clearTimeout(timer))
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [])

  const models = useMemo(() => resolveModels(AVAILABLE_MODELS, catalog), [catalog])
  return { models, catalog }
}
