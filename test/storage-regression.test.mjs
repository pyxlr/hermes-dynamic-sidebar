import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import test from 'node:test'

const source = await readFile(new URL('../src/inbox-runtime.js', import.meta.url), 'utf8')
const context = vm.createContext({ Date, console })
vm.runInContext(source + '\nglobalThis.models = { createCodexInboxModel, createCodexInboxAdmission }', context)
const { createCodexInboxModel, createCodexInboxAdmission } = context.models
const scope = { connectionId: 'source-A', profile: 'default' }
const row = (id, count = 2) => ({ id, source: 'desktop', message_count: count })
function storage() {
  const values = new Map()
  return { get: key => structuredClone(values.get(key)), set: (key, value) => values.set(key, structuredClone(value)) }
}

test('a stale second window cannot erase Settle, Snooze, or a newer cancellation', () => {
  const store = storage(), first = createCodexInboxModel(store), second = createCodexInboxModel(store)
  const until = Date.now() + 3600000
  first.settle(scope, row('one'), { manual: true })
  first.snooze(scope, row('two'), until)
  second.ingest(scope, [row('three', 3)])
  let restored = createCodexInboxModel(store)
  assert.equal(restored.isManualSettled(scope, 'one'), true)
  assert.equal(restored.snoozedUntil(scope, 'two'), until)
  second.cancelSnooze(scope, 'two')
  second.unsettle(scope, 'one')
  first.ingest(scope, [row('three', 4)])
  restored = createCodexInboxModel(store)
  assert.equal(restored.isSettled(scope, 'one'), false)
  assert.equal(restored.snoozedUntil(scope, 'two'), null)
})

test('unreadable state blocks writes and recovery reloads the original decisions', () => {
  const store = storage(), seed = createCodexInboxModel(store), until = Date.now() + 3600000
  seed.settle(scope, row('one'), { manual: true })
  seed.snooze(scope, row('two'), until)
  const get = store.get
  let fail = true, writes = 0
  store.get = key => { if (fail) throw Error('unreadable'); return get(key) }
  const set = store.set
  store.set = (key, value) => { writes++; set(key, value) }
  const model = createCodexInboxModel(store)
  assert.equal(model.ingest(scope, [row('three')]), false)
  assert.equal(writes, 0)
  fail = false
  assert.equal(model.ingest(scope, [row('three')]), true)
  assert.equal(model.isManualSettled(scope, 'one'), true)
  assert.equal(model.snoozedUntil(scope, 'two'), until)
})

test('later admission from another window preserves prior work and cron exclusions', () => {
  const store = storage(), model = createCodexInboxModel(store)
  const first = createCodexInboxAdmission(store, model), second = createCodexInboxAdmission(store, model)
  first.observe(scope, [row('one'), { ...row('cron'), source: 'cron' }], { workingSessions: [row('one')] })
  second.observe(scope, [row('two')], { workingSessions: [row('two')] })
  const restored = createCodexInboxAdmission(store, model)
  assert.equal(restored.isEligible(scope, row('one')), true)
  assert.equal(restored.isEligible(scope, row('two')), true)
  assert.equal(restored.isEligible(scope, row('cron')), false)
})
