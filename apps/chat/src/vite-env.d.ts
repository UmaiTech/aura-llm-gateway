/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PROXY_BASE_URL: string
  readonly VITE_TAVILY_API_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
