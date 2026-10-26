import assert from 'node:assert/strict'
import test from 'node:test'
import { loadPluginInternals } from './helpers/load-plugin.mjs'

const { codexInboxLoadErrorDetail: detail } = await loadPluginInternals(['codexInboxLoadErrorDetail'])

test('load diagnostics classify native status and IPC errors without exposing response bodies', () => {
  for (const status of [401, 403, 404, 500, 503]) {
    const errors = [
      Object.assign(new Error('secret response'), { statusCode: status }),
      new Error(`${status}: secret response`),
      new Error(`Error invoking remote method 'hermes:api': Error: ${status}: secret response`)
    ]
    for (const error of errors) {
      assert.ok(detail(error).startsWith(`INBOX_HTTP_${status}:`))
      assert.ok(!detail(error).includes('secret response'))
    }
  }
  const contradictory = Object.assign(new Error("Error invoking remote method 'hermes:api': Error: 404: secret"), { statusCode: 403 })
  assert.ok(detail(contradictory).startsWith('INBOX_HTTP_403:'))
})

test('transport and timeout diagnostics use fixed descriptions', () => {
  for (const code of ['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EHOSTUNREACH', 'ENETUNREACH']) {
    assert.equal(detail(Object.assign(new Error('Bearer private-key'), { code })), 'INBOX_TRANSPORT: Session API connection failed.')
  }
  for (const message of ['Request timed out after 60000 ms: private URL', "Error invoking remote method 'hermes:api': Error: Request timed out"])
    assert.equal(detail(new Error(message)), 'INBOX_TIMEOUT: Session API request timed out.')
  assert.equal(detail(Object.assign(new Error('secret'), { code: 'ETIMEDOUT' })), 'INBOX_TIMEOUT: Session API request timed out.')
})

test('unknown and misleading error bodies never become a status classification', () => {
  for (const value of [null, {}, 'private body', new Error('private history mentions 403: denied'), new Error("Error invoking remote method 'other:api': Error: 403: body")]) {
    assert.equal(detail(value), 'INBOX_UNKNOWN: Session metadata request failed. Check the Desktop log.')
  }
  assert.ok(detail(new Error('Inbox scope changed.')).startsWith('INBOX_SCOPE:'))
  assert.ok(detail(new Error('Inbox requires the Desktop session API.')).startsWith('INBOX_BRIDGE:'))
  assert.ok(detail(new Error('The session list could not be read completely.')).startsWith('INBOX_STORAGE:'))
})
