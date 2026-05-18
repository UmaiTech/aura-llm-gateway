/**
 * Browser-side better-auth client.
 *
 * This file is the ONLY auth module imported by React components. It uses
 * better-auth/react which talks to the serverless `/api/auth/*` endpoints
 * via fetch — it never touches the database, the OAuth secret, or any of
 * the server-only code in ./auth.ts.
 *
 * Keep this strictly client-safe: anything imported here ends up in the
 * browser bundle.
 */

import { createAuthClient } from 'better-auth/react'

export const authClient = createAuthClient({
  // Same-origin: the chat is served at /playground/, the auth endpoints are
  // at /api/auth/*. Both live on playground.aura-llm.dev in prod, both on
  // localhost:3000 in dev. No cross-origin concerns.
  baseURL: typeof window !== 'undefined' ? window.location.origin : '',
})

export const { useSession, signIn, signOut } = authClient
