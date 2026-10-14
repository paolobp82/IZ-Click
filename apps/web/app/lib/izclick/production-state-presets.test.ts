import assert from "node:assert/strict";
import { test } from "node:test";
import { missingProductionStates, normalizedStateName, PRODUCTION_STATES } from "./production-state-presets.ts";

test("omite estados existentes con variaciones de mayúsculas y tildes", () => {
  const missing = missingProductionStates([{ name: " EN PRODUCCION " }, { name: "por Cotizar" }]);
  assert.equal(missing.length, PRODUCTION_STATES.length - 2);
  assert.ok(!missing.some((row) => row.name === "En producción"));
  assert.ok(!missing.some((row) => row.name === "Por cotizar"));
  assert.equal(normalizedStateName("Rechazado"), "rechazado");
});

test("si el proyecto tiene todos los estados no crea ninguno", () => {
  assert.deepEqual(missingProductionStates(PRODUCTION_STATES), []);
});
