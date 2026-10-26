import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { chromium } from './helpers/chromium.mjs'

// Point this at the actual CSS exported by the Codex plugin, not a substitute.
const cssPath = process.env.CODEX_SIDEBAR_COMPAT_CSS
const codexCSS = cssPath ? await readFile(cssPath, 'utf8') : ''
const runtime = (await Promise.all(['inbox-row-ui.js', 'inbox-runtime.js'].map(file => readFile(new URL('../src/' + file, import.meta.url), 'utf8')))).join('\n')

for (const order of ['before', 'after']) test(`real Codex stylesheet with Inbox Off coexists in ${order} order`, { skip: !cssPath && 'Set CODEX_SIDEBAR_COMPAT_CSS to the CSS exported by Codex Skin' }, async () => {
  const browser = await chromium()
  try {
    const html = `<html data-codex-chat-look="true" data-hermes-theme="codex-chat" data-hermes-mode="light" data-dynamic-sidebar="true"><style>
      :root{font-size:16px;--spacing:4px;--ui-text-primary:CanvasText;--ui-text-secondary:GrayText;--ui-text-tertiary:GrayText;--ui-text-quaternary:GrayText;--ui-accent:Highlight}
      body{margin:0}#pane{display:flex;flex-direction:column;height:520px;width:280px;overflow:hidden}
      .flex{display:flex}.flex-col{flex-direction:column}.flex-1{flex:1}.min-h-0{min-height:0}.overflow-y-auto{overflow-y:auto}.pb-1{padding-bottom:4px}
      #pins,#sessions{display:flex;flex-direction:column}#sessions{flex:1;min-height:128px}
      [data-slot=sidebar-group-content]{display:flex;flex-direction:column;min-height:0}#pins button,#sessions button{height:24px;flex-shrink:0}
    </style><div data-tree-group="grp-sessions"><aside data-slot="sidebar"><div id="pane"><div data-sessions-mode="sessions" class="flex flex-col flex-1 min-h-0 overflow-y-auto"><div id="pins" data-slot="sidebar-group" class="pb-1"><div class="group/section"><button class="group/section-label">Pinned</button></div><div data-slot="sidebar-group-content"><button>Native pin</button></div></div><div id="sessions" data-slot="sidebar-group" class="flex-1"><div class="group/section"><button class="group/section-label">Sessions</button></div><div data-slot="sidebar-group-content" class="flex-1 overflow-y-auto"><button>Native session</button></div></div></div></div></aside></div></html>`
    await browser.call('Page.setDocumentContent', { frameId: (await browser.call('Page.getFrameTree')).frameTree.frame.id, html })
    const addCodex = () => browser.evaluate(`window.codexStyle=document.createElement('style');codexStyle.textContent=${JSON.stringify(codexCSS)};document.head.append(codexStyle)`)
    if (order === 'before') await addCodex()
    await browser.evaluate(runtime)
    await browser.evaluate(`
      window.store=new Map();window.storage={get:(k,f)=>store.get(k)??f,set:(k,v)=>store.set(k,structuredClone(v))};
      window.frames=new Map();window.serial=0;window.scheduler={MutationObserver,requestAnimationFrame:fn=>{frames.set(++serial,fn);return serial},cancelAnimationFrame:id=>frames.delete(id)};
      window.flush=async()=>{for(let i=0;i<15;i++){await Promise.resolve();if(!frames.size)return;const todo=[...frames.values()];frames.clear();todo.forEach(fn=>fn())}};
      window.inbox=installCodexInboxRuntime({storage,host:{state:{}},window:scheduler});
      inbox.update({scope:{connectionId:'source-A',profile:'default'},sessions:[{id:'task',title:'Task',source:'desktop',message_count:2}],liveSessions:[{session_id:'task',status:'working'}],liveStatusKnown:true});flush();
      window.gap=()=>document.getElementById('pins').getBoundingClientRect().top-document.querySelector('[data-dynamic-inbox-owned=island] > [data-slot=sidebar-group-content]').getBoundingClientRect().bottom;
    `)
    await browser.evaluate("flush().then(()=>{window.row=document.querySelector('[data-dynamic-inbox-row]')})")
    if (order === 'after') await addCodex()
    assert.equal(await browser.evaluate("document.querySelectorAll('[data-dynamic-inbox-owned=island]').length"), 1)
    assert.equal(await browser.evaluate('gap()'), 8, 'all-open spacing survives actual Codex rules')
    for (const mode of ['dark', 'light']) {
      await browser.evaluate(`document.documentElement.setAttribute('data-hermes-theme','another-theme');document.documentElement.setAttribute('data-hermes-mode',${JSON.stringify(mode)});flush()`)
      assert.equal(await browser.evaluate("row===document.querySelector('[data-dynamic-inbox-row]')"), true)
      assert.equal(await browser.evaluate('gap()'), 8)
    }
    await browser.evaluate("document.getElementById('pins').querySelector('[data-slot=sidebar-group-content]').remove();flush()")
    assert.equal(await browser.evaluate('gap()'), 4)
    await browser.evaluate('inbox.dispose();flush()')
    assert.equal(await browser.evaluate("document.querySelector('[data-dynamic-inbox-owned]')"), null)
    assert.equal(await browser.evaluate('codexStyle.isConnected'), true, 'cleanup retains the other plugin stylesheet')
  } finally { browser.close() }
})
