import assert from "node:assert/strict";
import { test } from "node:test";
import { commentFileLink } from "./comment-file-link.ts";

test("documentos se insertan como enlaces descargables, sin etiquetas de imagen", () => {
  for (const name of ["Contrato.pdf", "Presupuesto.xlsx", "Propuesta.docx", "Presentación.pptx", "Entrega.zip", "Foto.png"]) {
    const html = commentFileLink(name, "/api/assets/v2/workspaces/izango/projects/p/download/f/");
    assert.ok(html.includes(`>${name}</a>`));
    assert.ok(html.includes('rel="noopener noreferrer"'));
    assert.ok(!html.includes("<img"));
  }
});
test("los nombres de archivo no inyectan HTML", () => {
  const html = commentFileLink('<img src=x onerror="alert(1)"> & contrato.pdf', "/api/file/?a=1&b=2");
  assert.ok(html.includes("&lt;img"));
  assert.ok(html.includes("&quot;"));
  assert.ok(html.includes("&amp; contrato.pdf"));
  assert.ok(!html.includes("<img"));
});
test("rechaza protocolos ejecutables", () => {
  assert.throws(() => commentFileLink("archivo.pdf", "javascript:alert(1)"));
  assert.throws(() => commentFileLink("archivo.pdf", "data:text/html,example"));
});
