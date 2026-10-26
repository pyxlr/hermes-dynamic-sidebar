import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { chromium } from './helpers/chromium.mjs'

const require = createRequire(import.meta.url)
const coreDir = resolve(dirname(require.resolve('@tanstack/query-core/package.json')), 'build/modern')
const bundle = (await readFile(new URL('../hermes-dynamic-sidebar/plugin.js', import.meta.url), 'utf8'))
  .replace(/^import .*$/gm, '').replace(/export default\s*\{/, 'globalThis.__pluginDefault = {')

test('actual plugin activation keeps Inbox across theme changes and restores the host on disable', async () => {
  const server = createServer(async (request, response) => {
    if (request.url === '/') {
      response.end(`<!doctype html><html data-hermes-theme="first-theme"><style>
        :root{--ui-text-primary:rgb(25,35,45);--ui-text-secondary:rgb(50,60,70);--ui-text-tertiary:GrayText;--ui-text-quaternary:GrayText;--ui-accent:Highlight;--spacing:4px}
        body{margin:0;font:14px system-ui}aside{display:flex;flex-direction:column;width:280px;height:520px}
        .flex{display:flex}.flex-col{flex-direction:column}.w-full{width:100%}.pb-1{padding-bottom:4px}.flex-1{flex:1}.min-h-32{min-height:128px}.overflow-hidden{overflow:hidden}
      </style><aside data-sessions-mode="sessions"><div id="pins" data-slot="sidebar-group" class="flex flex-col"><div class="group/section"><button class="group/section-label">Pinned</button></div><div data-slot="sidebar-group-content"><button id="native">Native row</button></div></div><div id="sessions" data-slot="sidebar-group" class="flex flex-col flex-1 min-h-32 overflow-hidden"><div class="group/section"><button class="group/section-label">Sessions</button></div></div></aside><main id="chat">Original chat</main></html>`)
      return
    }
    if (!/^\/core\/[a-zA-Z0-9_-]+\.js$/.test(request.url)) { response.writeHead(404).end(); return }
    response.setHeader('Content-Type', 'text/javascript')
    response.end(await readFile(resolve(coreDir, request.url.slice(6))))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const browser = await chromium()
  try {
    await browser.call('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` })
    await browser.evaluate(`(async()=>{
      window.process={env:{NODE_ENV:'production'}};
      const {QueryClient}=await import('/core/index.js');
      window.queryClient=new QueryClient({defaultOptions:{queries:{gcTime:Infinity,retry:false}}});queryClient.mount();
      window.atom=value=>({get:()=>value,subscribe:()=>()=>{}});
      window.scope={connectionId:'source-A',profile:'default'};
      window.state={connectionId:atom(scope.connectionId),profile:atom(scope.profile),gateway:atom('open'),focusedSessionOwner:atom(scope),focusedStoredSessionId:atom('task'),focusedSessionId:atom('runtime'),busyBySession:atom({})};
      window.events=new Set();window.disposals=[];window.entries=[];window.notices=[];
      window.values=new Map();window.storage={get:(k,f)=>structuredClone(values.get(k)??f),set:(k,v)=>values.set(k,structuredClone(v))};
      Object.defineProperty(window,'localStorage',{value:{getItem:k=>values.has(k.slice('hermes.plugin.hermes-dynamic-sidebar.'.length))?JSON.stringify(values.get(k.slice('hermes.plugin.hermes-dynamic-sidebar.'.length))):null}});
      window.host={state,onEvent:(_,fn)=>{events.add(fn);return()=>events.delete(fn)},notify:n=>notices.push(n),profileRoutes:async()=>[scope],requestProfile:async(_,method)=>method==='session.active_list'?{sessions:[{id:'runtime',session_key:'task',profile:'default',status:'working'}]}:{subagents:[],delegations:[]}};
      window.hermesDesktop={api:async()=>({total:1,sessions:[{id:'task',title:'Task',source:'desktop',profile:'default',message_count:2}]}),getAgentRoster:async()=>({sources:[{connectionId:scope.connectionId,reachable:true}],agents:[scope]})};
      window.jsx=()=>null;window.useValue=a=>a?.get();window.useEffect=()=>{};window.useRef=()=>({current:null});window.useState=()=>[0,()=>{}];window.PALETTE_AREA='palette';
      window.nativeNode=document.getElementById('native');window.nativeCalls=0;nativeNode.onclick=()=>nativeCalls++;
      window.nativeHTML=document.getElementById('pins').outerHTML;window.chatHTML=document.getElementById('chat').outerHTML;
      window.flush=async()=>{for(let i=0;i<15;i++)await new Promise(r=>setTimeout(r,0));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))};
    })()`)
    await browser.evaluate(bundle)
    await browser.evaluate("__pluginDefault.register({storage,register:e=>entries.push(e),onDispose:fn=>disposals.push(fn)});flush()")
    assert.equal(await browser.evaluate("document.querySelectorAll('[data-dynamic-inbox-owned=island]').length"), 1)
    assert.equal(await browser.evaluate("document.querySelector('[data-dynamic-inbox-row=task]')?.textContent"), 'Task')
    assert.equal(await browser.evaluate("document.documentElement.getAttribute('data-hermes-theme')"), 'first-theme')
    assert.equal(await browser.evaluate("document.documentElement.hasAttribute('data-codex-chat-look')"), false)
    const row = "document.querySelector('[data-dynamic-inbox-row=task]')"
    await browser.evaluate(`window.savedRow=${row};document.documentElement.setAttribute('data-hermes-theme','second-theme');document.documentElement.setAttribute('data-hermes-mode','dark');document.documentElement.style.setProperty('--ui-text-primary','rgb(210,220,230)');document.documentElement.style.setProperty('--ui-text-secondary','rgb(160,170,180)');flush()`)
    assert.equal(await browser.evaluate(`${row}===savedRow`), true, 'theme switch keeps the same Inbox row')
    assert.equal(await browser.evaluate(`getComputedStyle(${row}.querySelector('[data-dynamic-inbox-label]')).color`), 'rgb(210, 220, 230)')
    assert.equal(await browser.evaluate("document.getElementById('chat').outerHTML===chatHTML"), true)
    assert.equal(await browser.evaluate("entries.some(e=>e.area==='themes')"), false)
    await browser.evaluate("window.legacy=document.createElement('div');legacy.setAttribute('data-codex-inbox-owned','island');document.querySelector('aside').prepend(legacy);flush()")
    assert.equal(await browser.evaluate("document.querySelector('[data-dynamic-inbox-owned=island]')"), null, 'legacy Codex Inbox takes precedence without duplicate sections')
    assert.equal(await browser.evaluate("legacy.isConnected"), true, 'never dispose or remove another plugin')
    await browser.evaluate('legacy.remove();flush()')
    assert.equal(await browser.evaluate("document.querySelectorAll('[data-dynamic-inbox-row]').length"), 1, 'resume after old Inbox is switched off')
    await browser.evaluate(`window.savedRow=${row}`)
    await browser.evaluate("entries.find(e=>e.id==='toggle-floating-sidebar').data.run();flush()")
    assert.equal(await browser.evaluate("values.get('floating-sidebar')"), 'off')
    assert.equal(await browser.evaluate(`${row}===savedRow`), true)
    await browser.evaluate("entries.find(e=>e.id==='toggle-inbox').data.run();flush()")
    assert.equal(await browser.evaluate("document.querySelector('[data-dynamic-inbox-owned]')"), null)
    await browser.evaluate("entries.find(e=>e.id==='toggle-inbox').data.run();flush()")
    assert.equal(await browser.evaluate("document.querySelectorAll('[data-dynamic-inbox-row]').length"), 1)
    await browser.evaluate("disposals.reverse().forEach(fn=>fn());nativeNode.click();flush()")
    assert.equal(await browser.evaluate("events.size"), 0)
    assert.equal(await browser.evaluate("nativeCalls"), 1)
    assert.equal(await browser.evaluate("document.getElementById('pins').outerHTML===nativeHTML&&document.getElementById('native')===nativeNode"), true)
    assert.equal(await browser.evaluate("document.querySelector('[data-dynamic-inbox-owned]')"), null)
    assert.equal(await browser.evaluate("document.documentElement.hasAttribute('data-dynamic-sidebar')||document.documentElement.hasAttribute('data-dynamic-floating-sidebar')"), false)
    assert.equal(await browser.evaluate("document.documentElement.getAttribute('data-hermes-theme')"), 'second-theme')
    await browser.evaluate('queryClient.unmount();queryClient.clear()')
    await browser.evaluate("window.realClient=queryClient;queryClient={};window.failureDisposals=[];window.startFailed=false;try{__pluginDefault.register({storage,register(){},onDispose:fn=>failureDisposals.push(fn)})}catch{startFailed=true};flush()")
    assert.equal(await browser.evaluate('startFailed'), true, 'actual observer initialization failed')
    assert.equal(await browser.evaluate("document.documentElement.hasAttribute('data-dynamic-sidebar')||document.querySelector('[data-dynamic-inbox-owned]')!==null"), false, 'failed observer startup rolls back the already-created adapter')
    assert.equal(await browser.evaluate('events.size'), 0)
    await browser.evaluate('failureDisposals.forEach(fn=>fn());queryClient=realClient')
  } finally { browser.close(); await new Promise(resolve => server.close(resolve)) }
})
