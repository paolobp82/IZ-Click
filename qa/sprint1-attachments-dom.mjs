// DOM component regression test. Service and route context are mocked; no live API or visual QA.
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
const testDeps = process.env.IZCLICK_QA_DEPS || path.resolve("qa");
const require = createRequire(path.join(testDeps, "package.json"));
const { JSDOM } = require("jsdom");
const { build } = require("esbuild");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundle = await build({
  stdin: {
    contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {IssueAttachmentCell} from './core/components/issues/attachment/attachment-cell'; createRoot(document.getElementById('root')).render(<div onClick={e=>e.preventDefault()}><IssueAttachmentCell issue={{id:'issue',project_id:'project',name:'Montaje de stand',attachment_count:3}} /></div>);`,
    resolveDir: root + "/apps/web",
    loader: "tsx",
  },
  bundle: true,
  write: false,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"test"', "import.meta.env": "{}" },
  plugins: [
    {
      name: "test-adapters",
      setup(b) {
        b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "params", namespace: "mock" }));
        b.onResolve({ filter: /^@\/services\/issue$/ }, () => ({ path: "service", namespace: "mock" }));
        b.onResolve({ filter: /^@plane\/types$/ }, () => ({ path: root + "/packages/types/src/issues/issue.ts" }));
        b.onResolve({ filter: /^@plane\/constants$/ }, () => ({ path: "constants", namespace: "mock" }));
        b.onResolve({ filter: /^@plane\/utils$/ }, () => ({ path: "utils", namespace: "mock" }));
        b.onResolve({ filter: /^@\/app\// }, (a) => ({
          path: root + "/apps/web/app/" + a.path.slice("@/app/".length) + ".ts",
        }));
        b.onLoad({ filter: /.*/, namespace: "mock" }, (a) => ({
          contents: {
            params: `export const useParams=()=>({workspaceSlug:'qa'});`,
            service: `export class IssueAttachmentService { async getIssueAttachments(){ window.__requests=(window.__requests||0)+1; if(window.__fail) throw Error('denied'); return window.__files; } }`,
            constants: `export const API_BASE_URL='';`,
            utils: `export {getEditorAssetSrc,getEditorAssetDownloadSrc} from '${root}/packages/utils/src/editor/common.ts'; export {convertBytesToSize} from '${root}/packages/utils/src/attachment.ts';`,
          }[a.path],
          resolveDir: root + "/apps/web",
        }));
      },
    },
  ],
});

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  runScripts: "dangerously",
  url: "https://qa.invalid/",
  pretendToBeVisual: true,
});
const w = dom.window;
w.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
w.IntersectionObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
w.matchMedia = () => ({
  matches: false,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
});
w.__files = [
  { id: "image", attributes: { name: "Montaje.jpg", size: 2048 } },
  { id: "pdf", attributes: { name: "Proforma.pdf", size: 4096 } },
  { id: "excel", attributes: { name: "Inventario.xlsx", size: 8192 } },
];
w.eval(bundle.outputFiles[0].text);
async function until(fn) {
  for (let i = 0; i < 200; i++) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw Error("DOM timeout");
}
const text = () => w.document.body.textContent;
const button = (name) => [...w.document.querySelectorAll("button")].find((x) => x.textContent.trim() === name);
await until(() => w.document.querySelector("button"));
const trigger = w.document.querySelector("button");
trigger.click();
await until(() => text().includes("Montaje.jpg"));
const links = [...w.document.querySelectorAll("a")].filter((a) => a.textContent === "Descargar");
if (links.length !== 3) throw Error("download actions missing");
if (links[0].getAttribute("href") !== "/api/assets/v2/workspaces/qa/projects/project/download/image/")
  throw Error("wrong download route");
button("Vista previa").click();
await until(() => w.document.querySelector('img[alt="Montaje.jpg"]'));
[...w.document.querySelectorAll("button")].filter((x) => x.textContent === "Vista previa")[1].click();
await until(() => w.document.querySelector('iframe[title="Vista previa de Proforma.pdf"]'));
[...w.document.querySelectorAll("button")].filter((x) => x.textContent === "Vista previa")[2].click();
await until(() => text().includes("Este formato no tiene vista previa."));
let prevented;
w.document.addEventListener("click", (e) => {
  if (e.target.textContent === "Descargar") {
    prevented = e.defaultPrevented;
    e.preventDefault();
  }
});
const click = new w.Event("click", { bubbles: true, cancelable: true });
links[0].dispatchEvent(click);
if (click.defaultPrevented) throw Error("portal propagation cancelled download");
button("Cerrar").click();
await until(() => !w.document.querySelector('[role="dialog"]'));
w.__files = [];
trigger.click();
await until(() => text().includes("Esta tarea no tiene archivos adjuntos."));
button("Cerrar").click();
await until(() => !w.document.querySelector('[role="dialog"]'));
w.__fail = true;
trigger.click();
await until(() => w.document.querySelector('[role="alert"]'));
w.__fail = false;
button("Reintentar").click();
await until(() => text().includes("Esta tarea no tiene archivos adjuntos."));
button("Cerrar").click();
await until(() => !w.document.querySelector('[role="dialog"]'));
console.log(
  "PASS: actual attachment component DOM: modal, 3 names/downloads, authenticated download route, image/PDF selection, unsupported format, portal click propagation, empty/error/retry and close. Service/context mocked; no visual or live API QA."
);
w.close();
