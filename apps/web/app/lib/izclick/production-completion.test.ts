import assert from "node:assert/strict";
import { test } from "node:test";
import { completionTarget } from "./production-completion.ts";
test("culminar usa un estado nativo completado y nunca cancelado", () => {
  const states = [{ id: "cancelled", group: "cancelled", default: true }, { id: "done", name: "Completado", group: "completed" }];
  assert.equal(completionTarget(states, true), "done");
  assert.deepEqual(states.map(s => s.id), ["cancelled", "done"]);
});
test("completar nunca selecciona Aprobada aunque sea el primer estado o el predeterminado", () => {
  const approved = { id: "approved", name: "Aprobada", group: "completed", default: true, sequence: 0 };
  const done = { id: "done", name: "Completado", group: "completed", sequence: 10 };
  assert.equal(completionTarget([approved, done], true), "done");
  assert.equal(completionTarget([done, approved], true), "done");
  assert.equal(completionTarget([approved], true), null);
  assert.equal(completionTarget([{ ...done, group: "started" }], true), "done");
  assert.equal(completionTarget([{ ...done, name: " COMPLETADO " }], true), "done");
});
test("reabrir prefiere el estado pendiente por defecto y conserva estados existentes", () => {
  assert.equal(completionTarget([{ id: "open", group: "unstarted" }, { id: "default", group: "backlog", default: true }], false), "default");
  assert.equal(completionTarget([{ id: "custom", name: "Revisión interna", group: "started", default: true }], false), "custom");
  assert.equal(completionTarget([{ id: "done", name: "Completado", group: "started" }], false), null);
  assert.equal(completionTarget([], true), null);
});
