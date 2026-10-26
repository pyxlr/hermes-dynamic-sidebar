import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import test from 'node:test'

const pluginUrl = new URL('../hermes-dynamic-sidebar/plugin.js', import.meta.url)

export async function loadPlugin(names = [], overrides = {}) {
  assert.ok(existsSync(pluginUrl), 'standalone Dynamic Sidebar plugin has not been built')
  const source = (await readFile(pluginUrl, 'utf8'))
    .replace(/^import .*$/gm, '')
    .replace(/export default\s*\{/, 'globalThis.__pluginDefault = {')
  const state = value => ({ get: () => value, subscribe: () => () => {} })
  const context = vm.createContext({
    host: { state: { profile: state('default'), gateway: state('open') }, onEvent: () => () => {} },
    jsx: () => null, useEffect() {}, useRef: () => ({ current: null }), useState: () => [0, () => {}],
    useValue: atom => atom?.get(), queryClient: {}, PALETTE_AREA: 'palette',
    window: {}, console, AbortController, URLSearchParams, ...overrides
  })
  vm.runInContext(source + `\nglobalThis.__internals = {${names.map(name => `${name}: typeof ${name} === 'undefined' ? null : ${name}`).join(',')}}`, context)
  return { plugin: context.__pluginDefault, ...context.__internals }
}

test('standalone plugin registers only sidebar controls and leaves theme and chat untouched', async () => {
  const attributes = new Map([['data-hermes-theme', 'other-theme']])
  const entries = [], cleanups = [], values = new Map()
  const { plugin } = await loadPlugin([], {
    document: { documentElement: {
      setAttribute: (key, value) => attributes.set(key, value),
      removeAttribute: key => attributes.delete(key)
    } }
  })
  assert.equal(plugin.id, 'hermes-dynamic-sidebar')
  assert.equal(plugin.name, 'Dynamic Sidebar')
  assert.equal(plugin.defaultEnabled, false, 'installing the plugin must not change the current desktop')
  plugin.register({
    storage: { get: (key, fallback) => values.has(key) ? values.get(key) : fallback, set: (key, value) => values.set(key, value) },
    register: entry => entries.push(entry), onDispose: fn => cleanups.push(fn)
  })
  assert.deepEqual(entries.filter(entry => entry.area === 'palette').map(entry => entry.data.label), [
    'Dynamic Sidebar: Floating sidebar', 'Dynamic Sidebar: Inbox'
  ])
  assert.ok(entries.every(entry => ['palette', 'sessionRow.leading', 'sessionRow.trailing'].includes(entry.area)))
  assert.equal(attributes.get('data-hermes-theme'), 'other-theme')
  assert.equal(attributes.has('data-codex-chat-look'), false)
  assert.equal(attributes.get('data-dynamic-sidebar'), 'true')
  cleanups.reverse().forEach(fn => fn())
  assert.equal(attributes.has('data-dynamic-sidebar'), false)
  assert.equal(attributes.has('data-dynamic-floating-sidebar'), false)
  assert.equal(attributes.get('data-hermes-theme'), 'other-theme')
  assert.equal(values.size, 0, 'activation does not overwrite preferences')
})

test('activation followed by disable before DOMContentLoaded cannot resurrect the sidebar', async () => {
  const attributes = new Map(), listeners = new Map(), cleanups = []
  const doc = {
    documentElement: { setAttribute: (k, v) => attributes.set(k, v), removeAttribute: k => attributes.delete(k) },
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: (type, fn) => { if (listeners.get(type) === fn) listeners.delete(type) }
  }
  const { plugin } = await loadPlugin([], { document: doc })
  plugin.register({ storage: { get: (_, fallback) => fallback }, onDispose: fn => cleanups.push(fn), register() {} })
  const pending = listeners.get('DOMContentLoaded')
  assert.equal(typeof pending, 'function')
  cleanups.reverse().forEach(fn => fn())
  doc.body = {}
  pending()
  assert.equal(listeners.size, 0)
  assert.equal(attributes.size, 0)
})

test('loading the module never writes Codex globals', async () => {
  const source = (await readFile(pluginUrl, 'utf8')).replace(/^import .*$/gm, '').replace(/export default\s*\{/, 'globalThis.__pluginDefault = {')
  const context = vm.createContext({
    CODEX_INBOX_ROW_UI_CSS: 'original Codex CSS', createCodexInboxRowUI: () => 'original Codex helper',
    host: {}, PALETTE_AREA: 'palette'
  })
  const helper = context.createCodexInboxRowUI
  vm.runInContext(`(() => { ${source} })()`, context)
  assert.equal(context.CODEX_INBOX_ROW_UI_CSS, 'original Codex CSS')
  assert.equal(context.createCodexInboxRowUI, helper)
})

test('initialization failure rolls back root attributes even before the host invokes disposers', async () => {
  const attributes = new Map(), cleanups = []
  const { plugin } = await loadPlugin([], {
    document: { body: {}, documentElement: {
      setAttribute: (key, value) => attributes.set(key, value),
      removeAttribute: key => attributes.delete(key)
    } }
  })
  assert.throws(() => plugin.register({
    storage: { get: (_, fallback) => fallback },
    onDispose: fn => cleanups.push(fn), register() {}
  }))
  assert.equal(attributes.size, 0)
  cleanups.reverse().forEach(fn => fn())
  assert.equal(attributes.size, 0)
})

test('SDK-swallowed read failures and invalid JSON never authorize a write', async () => {
  const { createSidebarStorage } = await loadPlugin(['createSidebarStorage'])
  assert.equal(typeof createSidebarStorage, 'function')
  let raw = '{invalid', fail = false
  const strict = createSidebarStorage({ get: (_, fallback) => fallback, set() {} }, {
    localStorage: { getItem() { if (fail) throw Error('denied'); return raw } }
  })
  assert.throws(() => strict.get('inbox-state-v1'))
  raw = null; fail = true
  assert.throws(() => strict.get('inbox-state-v1'))
})

test('storage change between read and write rejects a stale payload', async () => {
  const { createSidebarStorage } = await loadPlugin(['createSidebarStorage'])
  let raw = JSON.stringify({ settled: 'first' }), writes = 0
  const strict = createSidebarStorage({ set() { writes++ } }, {
    localStorage: { getItem: () => raw }
  })
  strict.get('inbox-state-v1')
  raw = JSON.stringify({ settled: 'second' })
  assert.throws(() => strict.set('inbox-state-v1', { settled: 'first' }))
  assert.equal(writes, 0)
})
