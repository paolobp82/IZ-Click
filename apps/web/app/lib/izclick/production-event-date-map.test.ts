import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeEventDateMap } from "./production-event-date-map.ts";

const issue = "664584ac-7152-4799-9b9e-72e980213a67";
test("acepta fechas del backend correctamente", () => {
  assert.deepEqual(normalizeEventDateMap({ [issue]: "2026-10-20" }), { [issue]: "2026-10-20" });
});
test("rechaza fechas corruptas y respuestas ajenas al esquema", () => {
  assert.throws(() => normalizeEventDateMap({ [issue]: "2026-02-30" }));
  assert.throws(() => normalizeEventDateMap({ error: "forbidden" }));
  assert.throws(() => normalizeEventDateMap(null));
});
