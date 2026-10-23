// Captures the README banner and screenshots (assets/readme/) from production
// builds of the three apps, with every API mocked: the data is synthetic.
//
//   for a in landing chat admin; do (cd apps/$a && npm install --legacy-peer-deps && npx vite build); done
//   node scripts/readme-screenshots/capture.mjs . /tmp/readme-shots   # PNGs at 2x
//   python3 scripts/readme-screenshots/optimize.py /tmp/readme-shots   # -> assets/readme/
//
// Optional third argument: comma-separated shot names (banner, landing,
// playground, admin, routing-lab). Set PW to a Playwright entry point when
// playwright isn't resolvable from here (e.g. a global install).
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
const { chromium } = await import(process.env.PW || 'playwright')

const [repoArg, out, only] = process.argv.slice(2)
const repo = path.resolve(repoArg)
fs.mkdirSync(out, { recursive: true })
const roots = [
  ['/playground', path.join(repo, 'apps/chat/dist')],
  ['/app', path.join(repo, 'apps/admin/dist')],
  ['', path.join(repo, 'apps/landing/dist')],
]
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.jpg': 'image/jpeg', '.webp': 'image/webp' }
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0])
  for (const [prefix, dir] of roots) {
    if (prefix && !(url === prefix || url.startsWith(prefix + '/'))) continue
    let rel = url.slice(prefix.length) || '/'
    let file = path.join(dir, rel)
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      const asHtml = path.join(dir, rel, 'index.html')
      file = fs.existsSync(asHtml) ? asHtml : path.join(dir, 'index.html')
    }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' })
    return fs.createReadStream(file).pipe(res)
  }
})
await new Promise((r) => server.listen(4173, r))
const BASE = 'http://localhost:4173'

const now = Date.now()
const iso = (minsAgo) => new Date(now - minsAgo * 60000).toISOString()
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

// ---------- chat mocks ----------
const ANSWER = `Here's a token bucket you can run atomically in Redis with a single Lua script:

\`\`\`lua
local cap, rate = tonumber(ARGV[1]), tonumber(ARGV[2])
local now, cost = tonumber(ARGV[3]), tonumber(ARGV[4])
local b = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
local elapsed = (now - (tonumber(b[2]) or now)) / 1000
local tokens = math.min(cap, (tonumber(b[1]) or cap) + elapsed*rate)
local ok = tokens >= cost
if ok then tokens = tokens - cost end
redis.call('HSET', KEYS[1], 'tokens', tokens, 'ts', now)
return ok and 1 or 0
\`\`\`

**Why this shape works**

- **Atomic:** the read, refill and write happen inside one \`EVALSHA\`, so two gateway replicas can't both spend the last token.
- **Fail open, but loudly:** if Redis is unreachable, allow the request, emit a \`rate_limit_bypassed\` metric and alert on it.`

const routing = {
  requested_model: 'auto', mode: 'balanced', classifier: 'heuristic', score: 0.71, raw_score: 0.68,
  classified_tier: 'complex', tier: 'complex',
  boundaries: { simple_medium: 0.3, medium_complex: 0.55, complex_reasoning: 0.82 },
  signals: { code: 0.9, length: 0.42, domain: 0.75, multi_step: 0.66, reasoning: 0.38 },
  hard_filters: [],
  candidates: [
    { model: 'claude-sonnet-4-5', provider: 'anthropic', tier: 'complex', cost_per_million: 9, eligible: true, predicted_cost_usd: 0.0061 },
    { model: 'gpt-5.4', provider: 'openai', tier: 'complex', cost_per_million: 5.6, eligible: true, predicted_cost_usd: 0.0042 },
    { model: 'gemini-2.5-pro', provider: 'google', tier: 'complex', cost_per_million: 5.6, eligible: true, predicted_cost_usd: 0.0039 },
  ],
  selected: 'gemini-2.5-pro', selected_provider: 'google',
  reason: 'complex tier; cheapest eligible candidate with healthy latency', shadow: false, latency_us: 184,
  predicted_cost_usd: 0.0039,
}

function sse(events) {
  return events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('') + 'data: [DONE]\n\n'
}

async function mockChat(page) {
  await page.context().addInitScript(() => localStorage.setItem('aura-chat-storage', JSON.stringify({ state: { model: 'auto', conversations: [], currentConversationId: null, theme: 'system' }, version: 0 })))
  await page.route('**/api/auth/get-session**', (r) => json(r, {
    session: { id: 's1', userId: 'u1', expiresAt: new Date(now + 864e5).toISOString(), token: 't' },
    user: { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', image: null, emailVerified: true, createdAt: iso(9999), updatedAt: iso(9999) },
  }))
  await page.route('**/api/beta-signup**', (r) => json(r, { status: 'approved', approved: true }))
  await page.route('**/api/pricing**', (r) => json(r, {}, 404))
  await page.route('**/api/proxy/health', (r) => json(r, { status: 'ok', version: '0.21.0' }))
  await page.route('**/api/proxy/v1/models**', (r) => json(r, {
    object: 'list',
    data: ['gpt-5.4', 'gpt-5.4-mini', 'claude-sonnet-4-5', 'claude-haiku-4-5', 'gemini-2.5-pro', 'gemini-2.5-flash'].map((id) => ({ id, object: 'model' })),
    auto: { enabled: true, aliases: ['auto', 'auto:cost', 'auto:quality'], default_mode: 'balanced', shadow_for_pinned_models: false },
  }))
  await page.route('**/api/proxy/v1/responses', (r) => {
    const words = ANSWER.match(/\S+\s*/g)
    const id = 'resp_7f3a9c2e'
    const events = [{ type: 'response.in_progress', response: { id, status: 'in_progress' } }]
    for (let i = 0; i < words.length; i += 6) events.push({ type: 'response.output_text.delta', delta: words.slice(i, i + 6).join('') })
    events.push({ type: 'response.completed', response: {
      id, status: 'completed', model: 'gemini-2.5-pro',
      usage: { input_tokens: 412, output_tokens: 368, cached_tokens: 0, cost_usd: 0.0042 },
      metadata: { aura: { provider: 'google', gateway_version: '0.21.0', latency_ms: 1840, request_id: 'req_01JB3', routing_strategy: 'auto:complex', routing } },
    } })
    return r.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream', 'X-Daily-Limit': '20', 'X-Daily-Remaining': '17' }, body: sse(events) })
  })
}

// ---------- admin mocks ----------
const providers = [
  ['openai', 'OpenAI', 48210, 99.6, 820, 1910, 61.2],
  ['anthropic', 'Anthropic', 31544, 99.8, 940, 2120, 74.9],
  ['google', 'Google', 22980, 99.4, 690, 1580, 28.4],
  ['mistral', 'Mistral', 6120, 98.9, 540, 1240, 4.1],
  ['bedrock', 'AWS Bedrock', 3310, 97.2, 1130, 2840, 6.3],
]
function hours(n, step) {
  return Array.from({ length: n }, (_, i) => {
    const t = n - 1 - i
    const wave = 0.65 + 0.35 * Math.sin((i / n) * Math.PI * 2 - 1.2) + 0.08 * Math.sin(i * 1.7)
    const req = Math.round(4200 * wave)
    return { timestamp: new Date(now - t * step).toISOString(), request_count: req, total_tokens: req * 1180, total_cost: +(req * 0.0016).toFixed(2), avg_latency_ms: 780 + Math.round(120 * Math.sin(i)), error_count: Math.round(req * 0.004) }
  })
}
const models = ['gpt-5.4-mini', 'claude-sonnet-4-5', 'gemini-2.5-flash', 'gpt-5.4', 'claude-haiku-4-5', 'gemini-2.5-pro', 'mistral-large-latest', 'gpt-5.4-mini']
const provOf = (m) => (m.startsWith('gpt') ? 'openai' : m.startsWith('claude') ? 'anthropic' : m.startsWith('gemini') ? 'google' : 'mistral')
const logs = models.map((m, i) => ({
  id: `log_${i}`, response_id: `resp_${(0x7f3a9c2e + i * 7919).toString(16)}`, conversation_id: null, provider_name: provOf(m), model_id: m, user_id: null,
  input_tokens: 300 + i * 97, output_tokens: 180 + i * 61, cached_tokens: i % 3 ? 0 : 256, reasoning_tokens: 0,
  cost_usd: 0.0008 + i * 0.0011, latency_ms: 420 + i * 133, status: i === 6 ? 'failed' : 'completed', error_code: i === 6 ? 'rate_limited' : null, error_message: null,
  routing_strategy: i % 2 ? 'auto:medium' : 'least_latency', cache_hit: i === 2, has_reasoning: false, compressed: i % 4 === 0,
  has_tool_calls: i === 1, tool_calls_count: i === 1 ? 2 : 0, tools_used: i === 1 ? ['web_search'] : [], tool_calls_data: [], created_at: iso(i * 3 + 1),
}))

function score(body) {
  const text = JSON.stringify(body.input).toLowerCase()
  const lane = body.model
  let tier = 'medium', s = 0.44
  if (/capital|translate|politely/.test(text)) { tier = 'simple'; s = 0.14 }
  else if (/prove|derive|labelled/.test(text)) { tier = 'reasoning'; s = 0.88 }
  else if (/rate limiter|deadlock|design a/.test(text)) { tier = 'complex'; s = 0.71 }
  const order = ['simple', 'medium', 'complex', 'reasoning']
  if (lane === 'auto:cost' && tier !== 'reasoning') { s -= 0.12; if (tier === 'complex' && s < 0.55) tier = 'medium' }
  if (lane === 'auto:quality' && tier !== 'reasoning') { s += 0.12; if (tier === 'medium' && s > 0.55) tier = 'complex' }
  const pick = { simple: ['gemini-2.5-flash', 'google', 0.15], medium: ['gpt-5.4-mini', 'openai', 0.6], complex: ['claude-sonnet-4-5', 'anthropic', 9], reasoning: ['o4-mini', 'openai', 4.4] }[tier]
  return {
    requested_model: lane, mode: lane === 'auto' ? 'balanced' : lane.slice(5), classifier: 'heuristic', score: +s.toFixed(2), raw_score: +s.toFixed(2),
    classified_tier: tier, tier, boundaries: { simple_medium: 0.3, medium_complex: 0.55, complex_reasoning: 0.82 },
    signals: { length: 0.3, code: /python|rust|lua/.test(text) ? 0.8 : 0.1, reasoning: tier === 'reasoning' ? 0.9 : 0.2 },
    hard_filters: [], candidates: [{ model: pick[0], provider: pick[1], tier, cost_per_million: pick[2], eligible: true, predicted_cost_usd: pick[2] * 0.0004 }],
    selected: pick[0], selected_provider: pick[1], reason: `${tier} tier`, shadow: false, latency_us: 120 + order.indexOf(tier) * 40, predicted_cost_usd: pick[2] * 0.0004,
  }
}

async function mockAdmin(page) {
  await page.route('http://localhost:8080/**', (r) => {
    const u = new URL(r.request().url())
    const p = u.pathname
    if (p === '/health') return json(r, { status: 'ok' })
    if (p === '/admin/stats/overview') return json(r, {
      total_requests_24h: 112164, input_tokens_24h: 98_400_000, output_tokens_24h: 34_100_000, cached_tokens_24h: 21_700_000, cost_24h: 174.92, avg_latency_24h: 812, success_rate_24h: 99.52,
      total_requests_7d: 742_310, total_tokens_7d: 861_000_000, cost_7d: 1162.4, total_requests_30d: 3_018_220, total_tokens_30d: 3_510_000_000, cost_30d: 4790.1,
      total_requests_all: 9_412_008, total_tokens_all: 10_900_000_000, cost_all: 15204.7, active_providers: 5, active_api_keys: 38, total_organizations: 6, total_end_users: 1294,
    })
    if (p === '/admin/stats/dynamic') return json(r, { total_requests: 112164, input_tokens: 98_400_000, output_tokens: 34_100_000, cached_tokens: 21_700_000, total_cost: 174.92, avg_latency: 812, success_rate: 99.52, period: '24h' })
    if (p === '/admin/stats/providers') return json(r, providers.map(([n, d, req, sr, lat, p95, cost]) => ({ provider_name: n, display_name: d, is_enabled: true, total_requests: req, successful_requests: Math.round(req * sr / 100), failed_requests: Math.round(req * (100 - sr) / 100), success_rate: sr, avg_latency_ms: lat, p95_latency_ms: p95, total_tokens: req * 1180, total_cost: cost, health_status: sr < 98 ? 'degraded' : 'healthy' })))
    if (p === '/admin/stats/cache') return json(r, { cache_hits: 18420, cache_misses: 93744, total_requests: 112164, hit_rate: 16.4, total_cached_tokens: 21_700_000, estimated_savings: 31.8 })
    if (p === '/admin/stats/routing') return json(r, [['auto', 51200], ['least_latency', 30110], ['weighted', 18230], ['round_robin', 12624]].map(([s, c]) => ({ routing_strategy: s, request_count: c, total_tokens: c * 1180, total_cost: c * 0.0015, avg_latency_ms: 790, successful_requests: c - 40, failed_requests: 40 })))
    if (p === '/admin/logs/recent') return json(r, logs)
    if (p.startsWith('/admin/stats/timeline/hourly')) return json(r, hours(24, 3600e3))
    if (p.startsWith('/admin/stats/timeline/daily')) return json(r, hours(30, 864e5))
    if (p === '/admin/stats/features') return json(r, {
      compression: { requests_compressed: 18240, total_tokens_saved: 9_120_000, avg_savings_percent: 41.8, by_strategy: [{ strategy: 'toon', request_count: 11020 }, { strategy: 'json', request_count: 5210 }, { strategy: 'yaml', request_count: 2010 }] },
      validation: { requests_validated: 4120, avg_confidence: 0.91, by_strategy: [{ strategy: 'self_consistency', request_count: 2600 }, { strategy: 'best_of_n', request_count: 1520 }] },
      consistency: { requests_applied: 2210, requests_with_principles: 1300, by_strategy: [{ strategy: 'style_profile', request_count: 2210 }] },
    })
    if (p === '/admin/routing/score') return json(r, score(r.request().postDataJSON()))
    console.log('unmocked admin', r.request().method(), p)
    return json(r, { error: 'not mocked' }, 404)
  })
}

const shots = [
  { name: 'landing', url: '/', size: [1440, 900], async prep(page) {
    await page.route('https://api.github.com/**', (r) => json(r, { stargazers_count: 128 }))
  } },
  { name: 'playground', url: '/playground/', size: [1440, 960], prep: mockChat, async act(page) {
    const box = page.locator('textarea').first()
    await box.waitFor()
    await box.fill('Give me the Lua for an atomic Redis token bucket for our gateway, and say how it should fail when Redis is down.')
    await box.press('Enter')
    await page.waitForTimeout(2500)
  } },
  { name: 'admin', url: '/app/', size: [1440, 900], prep: mockAdmin, admin: true, async act(page) { await page.waitForTimeout(1500) } },
  { name: 'routing-lab', url: '/app/', size: [1440, 900], prep: mockAdmin, admin: true, async act(page) {
    await page.getByRole('link', { name: 'Routing Lab' }).click()
    await page.getByText('Dry run (free)').click()
    await page.waitForTimeout(1500)
    await page.mouse.move(1100, 600)
    await page.mouse.wheel(0, 640)
    await page.waitForTimeout(500)
  } },
]

const browser = await chromium.launch()
if (!only || only.split(',').includes('banner')) {
  for (const scheme of ['dark', 'light']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 440 }, deviceScaleFactor: 2 })
    await page.goto('file://' + path.join(repo, 'scripts/readme-screenshots/banner.html'))
    if (scheme === 'light') await page.evaluate(() => document.body.classList.add('light'))
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({ path: path.join(out, `banner-${scheme}.png`), omitBackground: true })
    await page.close()
    console.log('ok banner', scheme)
  }
}
for (const shot of shots) {
  if (only && !only.split(',').includes(shot.name)) continue
  for (const scheme of ['dark', 'light']) {
    const ctx = await browser.newContext({ viewport: { width: shot.size[0], height: shot.size[1] }, deviceScaleFactor: 2, colorScheme: scheme, reducedMotion: 'reduce' })
    const page = await ctx.newPage()
    page.on('console', (m) => m.type() === 'error' && console.log(`[${shot.name}] console:`, m.text().slice(0, 200)))
    await page.route(/^https?:\/\/(?!localhost)/, (r) => (r.request().url().includes('fonts.g') ? r.continue() : json(r, {}, 404)))
    await page.route(/plausible|posthog|vercel-insights|_vercel/, (r) => r.fulfill({ status: 204, body: '' }))
    if (shot.prep) await shot.prep(page)
    if (shot.admin) await ctx.addInitScript((s) => {
      localStorage.setItem('aura-admin-auth', JSON.stringify({ state: { adminKey: 'demo', isAuthenticated: true }, version: 0 }))
      localStorage.setItem('aura-admin-settings', JSON.stringify({ state: { theme: s, sidebarCollapsed: false }, version: 0 }))
    }, scheme)
    await page.goto(BASE + shot.url, { waitUntil: 'networkidle' })
    if (shot.act) await shot.act(page)
    await page.waitForTimeout(600)
    await page.screenshot({ path: path.join(out, `${shot.name}-${scheme}.png`) })
    await ctx.close()
    console.log('ok', shot.name, scheme)
  }
}
await browser.close()
server.close()
