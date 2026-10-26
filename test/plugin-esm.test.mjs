import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const moduleUrl = text => 'data:text/javascript;base64,' + Buffer.from(text).toString('base64')

test('shipping ESM loads with only public SDK exports and keeps React row slots executable', async () => {
  const source = await readFile(new URL('../hermes-dynamic-sidebar/plugin.js', import.meta.url), 'utf8')
  const shims = {
    '@hermes/plugin-sdk': moduleUrl("export const queryClient={};export const useValue=a=>a?.get?.();export const host={state:{profile:{get:()=> 'default'},connectionId:{get:()=> 'source-A'}}},PALETTE_AREA='palette';"),
    react: moduleUrl('export const useEffect=()=>{},useRef=()=>({current:null}),useState=value=>[value,()=>{}];'),
    'react/jsx-runtime': moduleUrl('export const jsx=(type,props)=>({type,props});')
  }
  const rewritten = source.replace(/from '([^']+)'/g, (_, name) => {
    assert.ok(shims[name], 'unsupported runtime import: ' + name)
    return `from '${shims[name]}'`
  })
  const { default: plugin } = await import(moduleUrl(rewritten))
  const entries = [], cleanups = []
  plugin.register({ storage: { get: (_, fallback) => fallback }, register: e => entries.push(e), onDispose: fn => cleanups.push(fn) })
  assert.equal(plugin.id, 'hermes-dynamic-sidebar')
  for (const area of ['sessionRow.trailing', 'sessionRow.leading']) {
    const node = entries.find(e => e.area === area).data.render({ sessionId: 'task' })
    assert.equal(typeof node.type, 'function')
    const rendered = node.type(node.props)
    if (area === 'sessionRow.trailing') assert.equal(rendered, null, 'badge does not infer an owner')
    else {
      assert.equal(rendered.type, 'span')
      assert.equal(rendered.props['aria-hidden'], true)
      assert.equal(rendered.props.style.display, 'none', 'open observer never paints native row chrome')
    }
  }
  cleanups.reverse().forEach(fn => fn())
})
