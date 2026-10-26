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


const expectedDetails = {
  'gateway-envelope': 'INBOX_SCHEMA: Session API returned data[] instead of sessions[] and total.',
  'http-403': 'INBOX_HTTP_403: Session API denied access.',
  'timeout': 'INBOX_TIMEOUT: Session API request timed out.',
  'unknown': 'INBOX_UNKNOWN: Session metadata request failed. Check the Desktop log.',
  'list-404': 'INBOX_HTTP_404: Session API route or requested resource was not found. [Session list]',
  'lineage-route-404': 'INBOX_HTTP_404: Session API route or requested resource was not found. [Retained thread lineage]',
  'metadata-route-404': 'INBOX_HTTP_404: Session API route or requested resource was not found. [Retained thread metadata]',
  'ipc-lineage-route-404': 'INBOX_HTTP_404: Session API route or requested resource was not found. [Retained thread lineage]',
  'ipc-metadata-route-404': 'INBOX_HTTP_404: Session API route or requested resource was not found. [Retained thread metadata]',
};

for(const variant of ['desktop-schema', 'missing-retained-lineage', 'missing-retained-metadata', ...Object.keys(expectedDetails)]) test(variant, async()=>{
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
    await browser.evaluate(`window.originalApi=hermesDesktop.api;
      if (${JSON.stringify(variant)} === 'gateway-envelope') hermesDesktop.api=async()=>({object:'list',data:[{id:'task',title:'Task',source:'desktop',message_count:2}],limit:100,offset:0,has_more:false});
      if (${JSON.stringify(variant)} === 'http-403') hermesDesktop.api=async()=>{throw new Error("Error invoking remote method 'hermes:api': Error: 403: Forbidden")};
    `)
    await browser.evaluate(`
      if (${JSON.stringify(variant)} === 'timeout') hermesDesktop.api=async()=>{throw new Error('Request timed out after 60000 ms: https://private.invalid/token')};
      if (${JSON.stringify(variant)} === 'unknown') hermesDesktop.api=async()=>{throw new Error('sensitive session text and Bearer secret-value')};
      if (${JSON.stringify(variant)} === 'list-404') hermesDesktop.api=async()=>{throw new Error('404: {"detail":"Not Found"}')};
      if (${JSON.stringify(variant)}.includes('retained') || ${JSON.stringify(variant)}.includes('route-404')) {
        values.set('inbox-admission-v2', {version:2,admitted:{[JSON.stringify([scope.connectionId,scope.profile,'gone'])]:true},blocked:{}});
        window.lookupPaths=[];
        hermesDesktop.api=async request=>{
          const path=new URL(request.path,location.href).pathname;
          if(path==='/api/sessions')return originalApi(request);
          lookupPaths.push(path);
          if(path.endsWith('/latest-descendant') && ${JSON.stringify(variant)}.includes('metadata'))return {requested_session_id:'gone',session_id:'gone',path:['gone']};
          const message=${JSON.stringify(variant)}.startsWith('missing-')?'404: {"detail":"Session not found"}':'404: {"detail":"Not Found"}';
          throw new Error(${JSON.stringify(variant)}.startsWith('ipc-')?"Error invoking remote method 'hermes:api': Error: "+message:message);
        };
      }
    `)
    await browser.evaluate(bundle)
    await browser.evaluate("__pluginDefault.register({storage,register:e=>entries.push(e),onDispose:fn=>disposals.push(fn)});flush()")

    for(let i=0;i<50;i++) {
      const pending=await browser.evaluate("queryClient.getQueryCache().getAll().some(q=>q.state.fetchStatus==='fetching')");
      if(!pending)break;
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    await browser.evaluate('flush()');
    const result=await browser.evaluate(`({status:document.querySelector('[data-dynamic-inbox-status]')?.textContent||null,detail:document.querySelector('[data-dynamic-inbox-error-detail]')?.textContent||null,rows:document.querySelectorAll('[data-dynamic-inbox-row]').length,error:queryClient.getQueryCache().getAll().find(q=>q.queryKey[0]==='hermes-dynamic-sidebar')?.state.error?.message||null})`);
    console.log(JSON.stringify({variant,status:result.status,detail:result.detail,rows:result.rows}));
    if(variant==='desktop-schema'||variant.startsWith('missing-')){
      assert.equal(result.rows,1);assert.equal(result.error,null);
      if(variant.startsWith('missing-')){
        assert.ok(await browser.evaluate('lookupPaths.length>0'));
        assert.equal(await browser.evaluate('values.get("inbox-admission-v2").admitted[JSON.stringify([scope.connectionId,scope.profile,"gone"])]'),true);
      }
    }
    else {
      assert.equal(result.status,'Inbox could not be loaded. Refresh Sessions to retry.');
      assert.equal(result.detail,expectedDetails[variant]);
      assert.ok(!result.detail.includes('private.invalid'));
      assert.ok(!result.detail.includes('secret-value'));
    }
    await browser.evaluate('disposals.reverse().forEach(fn=>fn());queryClient.unmount();queryClient.clear()');
  } finally { browser.close(); await new Promise(resolve=>server.close(resolve)); }
});
