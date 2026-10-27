// Real completion checkbox in a clickable row; only route/store/network adapters are mocked.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
const root=process.cwd();
const require=createRequire(path.join(process.env.IZCLICK_QA_DEPS || path.resolve('qa'),'package.json'));
const {JSDOM}=require('jsdom'), {build}=require('esbuild');
const bundle=await build({
  stdin:{contents:`import React,{useState} from 'react'; import {createRoot} from 'react-dom/client'; import {CompletionCheckbox} from './core/components/issues/completion-checkbox'; function App(){const [issue,setIssue]=useState({id:'task',project_id:'project',name:'Carga',state_id:'open'});return <div onClick={e=>{e.preventDefault();window.__rowOpened=true;}}><CompletionCheckbox issue={issue} disabled={window.__disabled} update={async data=>{window.__events.push('issue');window.__updates.push(data);setIssue(prev=>({...prev,...data}));}}/></div>;} createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:root+'/apps/web',loader:'tsx'},
  bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"test"'},
  plugins:[{name:'adapters',setup(b){
    const mocks={
      'next/navigation':`export const useParams=()=>({workspaceSlug:'qa'});`,
      '@/hooks/store/use-project-state':`export const useProjectState=()=>({getProjectStates:()=>window.__cached,updateState:async(slug,project,id,data)=>{window.__normalizations.push({slug,project,id,data});window.__events.push('normalize');if(window.__normalizeError)throw Error('denied');Object.assign(window.__fresh.find(state=>state.id===id),data);return {...data,id};},fetchProjectStates:async(slug,project)=>{window.__fetches.push({slug,project});if(window.__fetchError)throw Error('offline');await new Promise(resolve=>{window.__resolveFetch=resolve;});window.__cached=window.__fresh;return window.__fresh;}});`,
      '@plane/propel/toast':`export const TOAST_TYPE={ERROR:'error'};export const setToast=value=>window.__toasts.push(value);`,
    };
    b.onResolve({filter:/^(next\/navigation|@\/hooks\/store\/use-project-state|@plane\/propel\/toast)$/},a=>({path:a.path,namespace:'mock'}));
    b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path],resolveDir:root+'/apps/web'}));
    b.onResolve({filter:/^@\/app\/lib\/izclick\/production-completion$/},()=>({path:root+'/apps/web/app/lib/izclick/production-completion.ts'}));
  }}],
});
async function until(fn){for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw Error('DOM timeout');}
const open={id:'open',name:'Recibido',group:'backlog',default:true};
const approved={id:'approved',name:'Aprobada',group:'completed',default:true};
const done={id:'done',name:'Completado',group:'completed'};
async function mount({fresh=[open,approved,done],disabled=false,fetchError=false,normalizeError=false}={}){
 const dom=new JSDOM('<div id="root"></div>',{runScripts:'dangerously',url:'https://qa.invalid/',pretendToBeVisual:true});
 const w=dom.window;Object.assign(w,{__cached:[open,approved],__fresh:fresh,__disabled:disabled,__fetchError:fetchError,__fetches:[],__updates:[],__toasts:[],__normalizations:[],__events:[],__normalizeError:normalizeError});
 w.eval(bundle.outputFiles[0].text);await until(()=>w.document.querySelector('input'));return dom;
}
const dom=await mount(),w=dom.window,input=w.document.querySelector('input');
assert.equal(input.disabled,false,'A stale cache without Completado must not disable an editable task');
input.click();await until(()=>w.__resolveFetch);
assert.equal(input.disabled,true,'Block repeat submissions while refreshing');
assert.equal(w.__updates.length,0,'Do not select stale Aprobada before fresh state resolution');
assert.equal(w.__rowOpened,undefined,'Checkbox must not trigger row navigation');
w.__resolveFetch();await until(()=>input.checked && !input.disabled);
assert.deepEqual(JSON.parse(JSON.stringify(w.__updates)),[{state_id:'done'}]);
assert.deepEqual(JSON.parse(JSON.stringify(w.__fetches)),[{slug:'qa',project:'project'}]);
input.click();await until(()=>w.__fetches.length===2);w.__resolveFetch();await until(()=>w.__updates.length===2 && !input.disabled);
assert.equal(w.__updates[1].state_id,'open');assert.equal(input.checked,false);w.close();
const missing=await mount({fresh:[open,approved]}),mw=missing.window;mw.document.querySelector('input').click();await until(()=>mw.__resolveFetch);mw.__resolveFetch();await until(()=>mw.__toasts.length);assert.match(mw.__toasts[0].message,/no está disponible/);assert.equal(mw.__updates.length,0);mw.close();
for(const normalizeError of [false,true]){
 const d=await mount({fresh:[open,approved,{...done,group:'unstarted'}],normalizeError}),win=d.window;
 win.document.querySelector('input').click();await until(()=>win.__resolveFetch);win.__resolveFetch();await until(()=>win.__updates.length||win.__toasts.length);
 assert.equal(win.__normalizations[0].id,'done');assert.equal(win.__normalizations[0].data.group,'completed');
 if(normalizeError){assert.equal(win.__updates.length,0);assert(win.__toasts.length);}else{assert.equal(win.__updates[0].state_id,'done');assert.deepEqual(JSON.parse(JSON.stringify(win.__events)),['normalize','issue']);assert.equal(win.__toasts.length,0);}
 win.close();
}
const denied=await mount({disabled:true});assert.equal(denied.window.document.querySelector('input').disabled,true);denied.window.document.querySelector('input').click();assert.equal(denied.window.__fetches.length,0);denied.window.close();
const offline=await mount({fetchError:true});offline.window.document.querySelector('input').click();await until(()=>offline.window.__toasts.length);assert.equal(offline.window.__updates.length,0);assert.equal(offline.window.document.querySelector('input').disabled,false);offline.window.close();
console.log('PASS: stale cache/new Completado, exact project refresh, complete/reopen, Aprobada never selected, busy state, row propagation, automatic legacy state repair and denied repair, permissions and network failure.');
