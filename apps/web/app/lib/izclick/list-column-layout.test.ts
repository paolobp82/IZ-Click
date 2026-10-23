import assert from "node:assert/strict";
import { test } from "node:test";
import { getListColumnLayout, LIST_COLUMNS, LIST_NAME_WIDTH } from "./list-column-layout.ts";
import type { ListColumnPreferences } from "./list-column-layout.ts";

const defaults = (): ListColumnPreferences => Object.fromEntries(
  LIST_COLUMNS.map(column => [column.id, { width: column.width, visible: true }]),
) as ListColumnPreferences;

test("encabezados y filas comparten el mismo ancho total de la Lista", () => {
  const layout = getListColumnLayout(defaults());
  const sum = LIST_COLUMNS.reduce((total, column) => total + column.width, 0);
  assert.equal(layout.rowWidth, LIST_NAME_WIDTH + sum);
  assert.equal(layout.linkWidth + layout.metadataWidth, layout.rowWidth);
  assert.equal(layout.propertiesWidth, 260 + 150 + 144 + 144 + 144);
  assert.equal(layout.metadataWidth, 184 + 160 + 160 + 160);
});

test("ocultar una columna resta su ancho tanto al encabezado como a las filas", () => {
  const prefs = defaults();
  prefs.priority.visible = false;
  prefs.client.visible = false;
  const layout = getListColumnLayout(prefs);
  assert.equal(layout.widths.priority, 0);
  assert.equal(layout.widths.client, 0);
  assert.equal(layout.propertiesWidth, 260 + 144 + 144 + 144);
  assert.equal(layout.metadataWidth, 184 + 160 + 160);
  assert.equal(layout.rowWidth, layout.linkWidth + layout.metadataWidth);
});

test("redimensionar estado y fecha actualiza exactamente el ancho de ambas regiones", () => {
  const prefs = defaults();
  prefs.state.width = 340;
  prefs.event.width = 230;
  const layout = getListColumnLayout(prefs);
  assert.equal(layout.widths.state, 340);
  assert.equal(layout.widths.event, 230);
  assert.equal(layout.linkWidth, LIST_NAME_WIDTH + 340 + 150 + 144 + 144 + 144);
  assert.equal(layout.rowWidth, layout.linkWidth + 184 + 160 + 230 + 160);
});

test("columnas ocultas no incrementan el ancho aunque conserven su tamaño configurado", () => {
  const prefs = defaults();
  prefs.due.visible = false;
  prefs.due.width = 450;
  const layout = getListColumnLayout(prefs);
  assert.equal(layout.widths.due, 0);
  assert.equal(layout.propertiesWidth, 260 + 150 + 144 + 144);
});

test("ocultar todas las columnas mantiene exactamente el ancho fijo de Carga", () => {
  const prefs = defaults();
  for (const column of LIST_COLUMNS) {
    prefs[column.id].visible = false;
  }
  const layout = getListColumnLayout(prefs);
  assert.equal(layout.linkWidth, LIST_NAME_WIDTH);
  assert.equal(layout.rowWidth, LIST_NAME_WIDTH);
  assert.equal(layout.propertiesWidth, 0);
  assert.equal(layout.metadataWidth, 0);
});

test("tres grupos mantienen idéntica geometría con las mismas preferencias", () => {
  const prefs = defaults();
  prefs.state.width = 320;
  prefs.priority.visible = false;
  const groupedLayouts = ["Por hacer", "En curso", "Terminado"].map(() => getListColumnLayout(prefs));
  assert.deepEqual(groupedLayouts[0], groupedLayouts[1]);
  assert.deepEqual(groupedLayouts[1], groupedLayouts[2]);
});
