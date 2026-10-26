import { host, PALETTE_AREA, queryClient, useValue } from '@hermes/plugin-sdk'
import { useEffect, useRef, useState } from 'react'
import { jsx } from 'react/jsx-runtime'

const ID = 'hermes-dynamic-sidebar'
const FLOATING_SIDEBAR_STORAGE_KEY = 'floating-sidebar'
let pluginStorage = null

function createSidebarStorage(storage, win = globalThis.window) {
  const reads = new Map()
  const read = (key, fallback) => {
    // SDK get() treats denied reads and malformed JSON as an absent key.
    // Use the inspected namespace for strict reads, but keep SDK-owned writes.
    const local = win?.localStorage
    if (!local) return storage.get(key, fallback)
    const raw = local.getItem(`hermes.plugin.${ID}.${key}`)
    return raw === null ? fallback : JSON.parse(raw)
  }
  return {
    get(key, fallback) {
      const value = read(key)
      reads.set(key, JSON.stringify(value))
      return value === undefined ? fallback : value
    },
    set(key, value) {
      if (reads.has(key) && JSON.stringify(read(key)) !== reads.get(key)) throw Error('Sidebar storage changed in another window. Retry the action.')
      storage.set(key, value)
    }
  }
}

function readFloatingSidebarMode() {
  try { return pluginStorage?.get(FLOATING_SIDEBAR_STORAGE_KEY, 'on') === 'off' ? 'off' : 'on' }
  catch { return 'off' }
}

function syncFloatingSidebarRoot() {
  const mode = readFloatingSidebarMode()
  globalThis.document?.documentElement?.setAttribute?.('data-dynamic-floating-sidebar', mode)
  return mode
}

function setFloatingSidebarMode(mode) {
  const normalized = mode === 'off' ? 'off' : 'on'
  try {
    if (typeof pluginStorage?.get !== 'function' || typeof pluginStorage?.set !== 'function') throw Error('Storage unavailable')
    pluginStorage.get(FLOATING_SIDEBAR_STORAGE_KEY, 'on')
    pluginStorage.set(FLOATING_SIDEBAR_STORAGE_KEY, normalized)
    if (pluginStorage.get(FLOATING_SIDEBAR_STORAGE_KEY, null) !== normalized) throw Error('Setting was not saved')
  } catch {
    host.notify?.({ kind: 'error', message: 'Floating sidebar setting could not be saved. Layout was not changed.' })
    return false
  }
  syncFloatingSidebarRoot()
  return true
}

export default {
  id: ID,
  name: 'Dynamic Sidebar',
  defaultEnabled: false,
  register(ctx) {
    const storage = createSidebarStorage(ctx.storage)
    pluginStorage = storage
    const doc = globalThis.document
    let inbox = null, disposed = false
    const cleanups = []
    const cleanup = () => {
      if (disposed) return
      disposed = true
      cleanups.reverse().forEach(stop => stop())
      doc?.removeEventListener?.('DOMContentLoaded', start)
      doc?.documentElement?.removeAttribute?.('data-dynamic-sidebar')
      doc?.documentElement?.removeAttribute?.('data-dynamic-floating-sidebar')
      if (pluginStorage === storage) pluginStorage = null
    }
    ctx.onDispose(cleanup)
    const lifetime = { onDispose: stop => cleanups.push(stop) }
    const start = () => {
      if (disposed || !doc?.body) return
      try {
        inbox = installCodexInboxRuntime({ storage, host })
        lifetime.onDispose(() => inbox.dispose())
        startCodexInboxObserver(lifetime, inbox)
        startCodexInboxMenuOpenObserver(lifetime, inbox)
        lifetime.onDispose(connectCodexInboxEvents(inbox))
      } catch (error) { cleanup(); throw error }
    }
    doc?.documentElement?.setAttribute?.('data-dynamic-sidebar', 'true')
    syncFloatingSidebarRoot()
    if (doc?.body) start()
    else doc?.addEventListener?.('DOMContentLoaded', start, { once: true })
    ctx.register({ id: 'inbox-settled-badge', area: 'sessionRow.trailing', data: { render: ({ sessionId }) => jsx(CodexSettledBadge, { sessionId, inbox }) } })
    ctx.register({ id: 'inbox-open-intent', area: 'sessionRow.leading', data: { render: ({ sessionId }) => jsx(CodexInboxNativeOpenIntent, { sessionId, inbox }) } })
    for (const [id, label, read, set, keywords] of [
      ['toggle-floating-sidebar', 'Floating sidebar', readFloatingSidebarMode, setFloatingSidebarMode, ['floating', 'layout', 'pinned', 'sessions']],
      ['toggle-inbox', 'Inbox', readCodexInboxMode, mode => setCodexInboxMode(mode, inbox), ['inbox', 'settle', 'snooze', 'sessions']]
    ]) {
      ctx.register({ id, area: PALETTE_AREA, data: {
        id: `${ID}.${id}`, label: `Dynamic Sidebar: ${label}`,
        detail: () => read() === 'on' ? 'On' : 'Off', detailVariant: 'state', keepOpen: true,
        keywords: ['dynamic', 'sidebar', ...keywords],
        run: () => set(read() === 'on' ? 'off' : 'on')
      } })
    }
  }
}
