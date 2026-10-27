// Exercise the real menu and HTTP service; session/store/API responses are mocked.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
const root = process.cwd();
const require = createRequire(path.join(process.env.IZCLICK_QA_DEPS || path.resolve("qa"), "package.json"));
const { JSDOM } = require("jsdom");
const { build } = require("esbuild");
const bundle = await build({
  stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {ProductionStatusesMenu} from './core/components/issues/header/production-statuses-menu'; createRoot(document.getElementById('root')).render(<ProductionStatusesMenu/>);`, resolveDir: root + "/apps/web", loader: "tsx" },
  bundle: true, write: false, format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"test"' },
  plugins: [{ name: "adapters", setup(b) {
    const mocks = {
      "next/navigation": `export const useParams=()=>({workspaceSlug:'qa',projectId:'project'});`,
      "@plane/constants": `export const API_BASE_URL=''; export const EUserPermissions={ADMIN:20}; export const EUserPermissionsLevel={WORKSPACE:'workspace'};`,
      "@/hooks/store/user": `export const useUserPermissions=()=>({allowPermissions:()=>window.__admin});`,
      "@/hooks/store/use-project-state": `export const useProjectState=()=>({fetchWorkspaceStates:async()=>{window.__refreshed=true;}});`,
      "@/services/api.service": `export class APIService { async get(){return {data:window.__statuses};} async patch(url,data){window.__patch={url,data};return {data};} async delete(url){window.__delete=url;throw {response:{data:{error:'Destino incompleto: no se cambió ninguna tarea.'}}};} }`,
    };
    b.onResolve({ filter: /^(next\/navigation|@plane\/constants|@\/hooks\/store\/(user|use-project-state)|@\/services\/api.service)$/ }, a => ({path:a.path,namespace:"mock"}));
    b.onLoad({filter:/.*/,namespace:"mock"}, a => ({contents:mocks[a.path],resolveDir:root+"/apps/web"}));
    b.onResolve({filter:/^@\/services\/project\/izclick-production-status.service$/}, () => ({path:root+"/apps/web/core/services/project/izclick-production-status.service.ts"}));
  }}],
});
async function until(fn) { for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));} throw Error("DOM timeout"); }
async function mount(admin) {
  const dom = new JSDOM('<div id="root"></div>', {runScripts:"dangerously",url:"https://qa.invalid/",pretendToBeVisual:true});
  const w=dom.window;
  w.__admin=admin;
  w.__statuses=[
    {id:"native",name:"Recibido",origin:"plane",color:"#112233",group:"backlog",sequence:15000,project_count:2,is_active:true},
    {id:"catalogue",name:"En producción",origin:"catalogue",color:"#445566",group:"started",sequence:1000,project_count:2,is_active:true},
  ];
  w.eval(bundle.outputFiles[0].text);
  await until(()=>w.document.querySelector("button"));
  w.document.querySelector("button").click();
  await until(()=>w.document.body.textContent.includes("Recibido"));
  return dom;
}
const dom=await mount(true), w=dom.window;
const buttons=()=>[...w.document.querySelectorAll("button")];
const button=name=>buttons().find(b=>b.textContent.trim()===name);
assert.equal(buttons().filter(b=>b.textContent==="Editar").length,2);
assert.equal(buttons().filter(b=>b.textContent==="Eliminar").length,2);
assert.match(w.document.body.textContent,/Plane · 2 proyectos/);
const nativeRow=[...w.document.querySelectorAll("div")].find(d=>d.textContent.includes("Recibido") && d.querySelectorAll("button").length===2);
[...nativeRow.querySelectorAll("button")].find(b=>b.textContent==="Editar").click();
await until(()=>w.document.querySelector("input[maxlength]")?.value==="Recibido");
button("Guardar cambios").click();
await until(()=>w.__refreshed);
assert.equal(w.__patch.url,"/api/workspaces/qa/izclick-production-statuses/native/");
assert.equal(w.__patch.data.name,"Recibido");
[...nativeRow.querySelectorAll("button")].find(b=>b.textContent==="Eliminar").click();
await until(()=>w.document.querySelector('select[aria-label="Estado general de destino"]'));
const select=w.document.querySelector('select[aria-label="Estado general de destino"]');
assert.equal(select.querySelector('option[value="native"]'),null);
select.value="catalogue";select.dispatchEvent(new w.Event("change",{bubbles:true}));
await until(()=>!button("Confirmar eliminación y traslado").disabled);
button("Confirmar eliminación y traslado").click();
await until(()=>w.document.querySelector('[role="alert"]'));
assert.equal(w.__delete,"/api/workspaces/qa/izclick-production-statuses/native/?replacement_id=catalogue");
assert.match(w.document.querySelector('[role="alert"]').textContent,/Destino incompleto/);
w.close();
const reader=await mount(false);
assert.equal([...reader.window.document.querySelectorAll("button")].filter(b=>["Editar","Eliminar"].includes(b.textContent)).length,0);
assert.match(reader.window.document.body.textContent,/Recibido/);
reader.window.close();
console.log("PASS: native and catalogue states visible, both editable/deletable for admins, native PATCH/DELETE routes, replacement excludes source, API errors visible and member writes hidden.");
