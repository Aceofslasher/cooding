import test from 'node:test'
import assert from 'node:assert/strict'
import tutorHandler from './tutor.js'
import executionHandler from './execute.js'

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code
      return this
    },
    json(body) {
      this.body = body
      return this
    },
  }
}

function withoutSupabaseConfig() {
  for (const key of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']) delete process.env[key]
}

test('hosted tutor fails closed without Supabase token verification', async () => {
  withoutSupabaseConfig()
  const response = createResponse()
  await tutorHandler({ method: 'POST', headers: {}, body: { question: 'Explain a variable' } }, response)
  assert.equal(response.statusCode, 401)
})

test('hosted Python execution fails closed without Supabase token verification', async () => {
  withoutSupabaseConfig()
  const response = createResponse()
  await executionHandler({ method: 'POST', headers: {}, body: { sourceCode: 'print(1)' } }, response)
  assert.equal(response.statusCode, 401)
})

test('provider endpoints reject methods other than POST', async () => {
  const request = { method: 'GET', headers: {}, body: {} }
  const tutorResponse = createResponse()
  const executionResponse = createResponse()
  await tutorHandler(request, tutorResponse)
  await executionHandler(request, executionResponse)
  assert.equal(tutorResponse.statusCode, 405)
  assert.equal(executionResponse.statusCode, 405)
})