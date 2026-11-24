/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { setLanguage, TranslationProvider, useTranslation } from "@plane/i18n";

const expected = {
  "sidebar.new_work_item": "Nueva tarea",
  "home.title": "Inicio",
  "sidebar.more": "Más",
  "sidebar.hide": "Ocultar",
  "power_k.search_menu.placeholder": "Buscar comandos…",
  drafts: "Borradores",
  your_work: "Tu trabajo",
  "sidebar.stickies": "Notas adhesivas",
  "common.workspace": "Espacio de trabajo",
  "common.display": "Mostrar",
  "common.analytics": "Análisis",
  "common.state": "Estado",
  projects: "Proyectos",
  "sidebar.work_items": "Tareas",
  "sidebar.views": "Vistas",
  "sidebar.pages": "Páginas",
  "issue.add.label": "Agregar tarea",
};

function Labels() {
  const { t } = useTranslation();
  for (const [key, value] of Object.entries(expected)) assert.equal(t(key), value, key);
  return React.createElement("nav", null, Object.keys(expected).map((key) =>
    React.createElement("span", { key }, t(key))));
}

await setLanguage("es");
const html = renderToStaticMarkup(React.createElement(TranslationProvider, null, React.createElement(Labels)));
assert.ok(html.includes("Inicio") && html.includes("Agregar tarea"), html);
await setLanguage("en");
function EnglishLabels() {
  const { t } = useTranslation();
  assert.equal(t("projects"), "Projects");
  return React.createElement("span", null, t("projects"));
}
renderToStaticMarkup(React.createElement(TranslationProvider, null, React.createElement(EnglishLabels)));
await setLanguage("es");
renderToStaticMarkup(React.createElement(TranslationProvider, null, React.createElement(Labels)));
console.log(`BUILT_TRANSLATIONS_OK: ${Object.keys(expected).length} Spanish labels; language switching restored Spanish`);
