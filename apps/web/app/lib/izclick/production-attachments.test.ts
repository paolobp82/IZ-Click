import assert from "node:assert/strict";
import { test } from "node:test";
import { attachmentPreviewKind } from "./production-attachments.ts";

test("permite vista previa de imágenes y PDF sin depender de mayúsculas", () => {
  for (const name of ["evento.JPG", "banner.png", "foto.webp", "foto.jpeg", "video.gif"])
    assert.equal(attachmentPreviewKind(name), "image");
  assert.equal(attachmentPreviewKind("Proforma.PDF"), "pdf");
});
test("documentos Office, HTML, SVG y extensiones engañosas se descargan sin incrustarse", () => {
  for (const name of [
    "inventario.xlsx",
    "reporte.docx",
    "pagina.html",
    "logo.svg",
    "foto.jpg.html",
    "sin-extension",
    "archivo.zip",
  ]) {
    assert.equal(attachmentPreviewKind(name), null);
  }
});
