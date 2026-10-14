import assert from "node:assert/strict";
import { test } from "node:test";
import { productionMonthCells } from "./production-month.ts";

test("octubre 2026 empieza jueves con lunes como primera columna", () => {
  const dates = productionMonthCells(2026, 10);
  assert.equal(dates.length % 7, 0);
  assert.deepEqual(dates.slice(0, 4), [null, null, null, "2026-10-01"]);
  assert.ok(dates.includes("2026-10-31"));
});

test("febrero en año bisiesto usa día 29 y febrero normal no", () => {
  assert.ok(productionMonthCells(2024, 2).includes("2024-02-29"));
  assert.equal(productionMonthCells(2026, 2).includes("2026-02-29"), false);
});

test("rechaza meses inválidos", () => {
  assert.throws(() => productionMonthCells(2026, 13));
  assert.throws(() => productionMonthCells(2026, 0));
});
