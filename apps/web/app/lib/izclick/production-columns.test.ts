import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultProductionColumns, parseProductionColumns, PRODUCTION_COLUMNS } from "./production-columns.ts";

test("por defecto muestra todas las columnas operativas", () => {
  const columns = defaultProductionColumns();
  assert.ok(PRODUCTION_COLUMNS.every((column) => columns[column.id]));
});

test("restituye columnas faltantes y descarta valores inválidos", () => {
  const result = parseProductionColumns({
    sig: false, client: false, priority: "mal", unknown: false,
  });
  assert.equal(result.sig, false);
  assert.equal(result.client, false);
  assert.equal(result.priority, true);
  assert.equal(result.project, true);
});

test("descarta preferencias corruptas", () => {
  assert.deepEqual(parseProductionColumns(null), defaultProductionColumns());
  assert.deepEqual(parseProductionColumns([]), defaultProductionColumns());
});
