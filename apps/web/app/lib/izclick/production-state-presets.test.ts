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

test("catálogo de la imagen: veinte estados en cinco segmentos, en el orden indicado", async () => {
  const { segmentProductionStates } = await import("./production-state-presets.ts");
  const segments = segmentProductionStates(PRODUCTION_STATES);
  assert.deepEqual(segments.map(s => [s.label, s.states.length]), [
    ["Pendiente", 5], ["Por hacer", 2], ["En progreso", 9], ["Completado", 1], ["Cancelado", 3],
  ]);
  assert.deepEqual(segments[0].states.map(s => s.name), ["Recibida", "Pendiente de información", "Pendiente de aprobación comercial", "Esperando respuesta del cliente", "Pausado"]);
  assert.deepEqual(segments[1].states.map(s => s.name), ["Por cotizar", "Por iniciar proyecto"]);
  assert.deepEqual(segments[2].states.map(s => s.name), ["En cotización", "En revisión PM", "Ajustes en cotización", "Cotización aprobada", "En planificación", "En producción", "Listo para ejecutar", "En ejecución", "En cierre"]);
  assert.deepEqual(segments[4].states.map(s => s.name), ["Rechazado", "Rechazado fuera de tiempo", "Cancelado"]);
  assert.equal(new Set(PRODUCTION_STATES.map(s => normalizedStateName(s.name))).size, 20);
});

test("agrupar conserva la identidad y el color individual editado", async () => {
  const { segmentProductionStates } = await import("./production-state-presets.ts");
  const states = [{ id: "a", name: "Mi estado", group: "started", color: "#123456" }, { id: "b", name: "Otro", group: "started", color: "#abcdef" }];
  const before = structuredClone(states);
  const result = segmentProductionStates(states);
  assert.equal(result[2].states[0], states[0]);
  assert.deepEqual(result[2].states.map(s => s.color), ["#123456", "#abcdef"]);
  assert.deepEqual(states, before);
});
