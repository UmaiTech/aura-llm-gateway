import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Analytics } from '@vercel/analytics/react'
import App from './App'
import { DocsPage } from './pages/DocsPage'
import { RoadmapPage } from './pages/RoadmapPage'
import './index.css'

const hostname =
  typeof window !== 'undefined' ? window.location.hostname : ''
const isDocsHost = hostname.startsWith('docs.')
const isRoadmapHost = hostname.startsWith('roadmap.')

function rootElement() {
  if (isDocsHost) return <Navigate to="/docs" replace />
  if (isRoadmapHost) return <RoadmapPage />
  return <App />
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={rootElement()} />
        <Route path="/roadmap" element={<RoadmapPage />} />
        <Route path="/docs/roadmap" element={<RoadmapPage />} />
        <Route path="/docs/*" element={<DocsPage />} />
      </Routes>
    </BrowserRouter>
    <Analytics />
  </React.StrictMode>,
)
