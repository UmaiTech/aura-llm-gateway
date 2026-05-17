import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App'
import { DocsPage } from './pages/DocsPage'
import { RoadmapPage } from './pages/RoadmapPage'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/roadmap" element={<RoadmapPage />} />
        <Route path="/docs/roadmap" element={<RoadmapPage />} />
        <Route path="/docs/*" element={<DocsPage />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)
