import { verifyConfiguredUser } from './_auth.js'

const requestCounts = new Map()

function isRateLimited(request) {
  const now = Date.now()
  const address = request.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown'
  const current = requestCounts.get(address)
  if (!current || now - current.startedAt > 60_000) {
    requestCounts.set(address, { startedAt: now, count: 1 })
    return false
  }
  current.count += 1
  return current.count > 20
}

function decodeOutput(value) {
  if (!value) return ''
  return Buffer.from(value, 'base64').toString('utf8').slice(0, 8000)
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed' })
  const auth = await verifyConfiguredUser(request)
  if (!auth.authorized) return response.status(401).json({ error: 'Sign in before using hosted code execution.' })
  if (isRateLimited(request)) return response.status(429).json({ error: 'Too many execution requests. Please wait and try again.' })
  if (!process.env.JUDGE0_URL || !process.env.JUDGE0_API_KEY) {
    return response.status(503).json({ error: 'Secure Python execution is not configured on this server.' })
  }
  const sourceCode = typeof request.body?.sourceCode === 'string' ? request.body.sourceCode : ''
  if (!sourceCode.trim()) return response.status(400).json({ error: 'Add some Python code before running it.' })
  if (sourceCode.length > 10_000) return response.status(413).json({ error: 'Code is limited to 10,000 characters.' })

  const endpoint = process.env.JUDGE0_URL.replace(/\/$/, '')
  const authHeader = process.env.JUDGE0_AUTH_HEADER || 'X-Auth-Token'
  try {
    const upstream = await fetch(`${endpoint}/submissions?base64_encoded=true&wait=true`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [authHeader]: process.env.JUDGE0_API_KEY,
      },
      body: JSON.stringify({
        source_code: Buffer.from(sourceCode, 'utf8').toString('base64'),
        language_id: 71,
        cpu_time_limit: 2,
        wall_time_limit: 5,
        memory_limit: 128000,
      }),
      signal: AbortSignal.timeout(12_000),
    })
    if (!upstream.ok) return response.status(502).json({ error: 'The secure execution service rejected the request.' })
    const result = await upstream.json()
    const statusId = result.status?.id
    const status = statusId === 3 ? 'success' : statusId === 5 ? 'timeout' : statusId === 6 ? 'compile_error' : statusId >= 7 && statusId <= 12 ? 'runtime_error' : statusId === 4 ? 'wrong_answer' : 'error'
    const output = decodeOutput(result.stdout)
    const error = decodeOutput(result.stderr) || decodeOutput(result.compile_output) || (status === 'timeout' ? 'Execution time limit exceeded.' : '')
    return response.status(200).json({ status, output, error, time: result.time || null, memory: result.memory || null })
  } catch {
    return response.status(502).json({ error: 'The secure execution service timed out or is unavailable.' })
  }
}