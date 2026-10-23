import assert from "node:assert/strict";
import { test } from "node:test";
import { completionTarget } from "./production-completion.ts";
test("culminar usa un estado nativo completado y nunca cancelado", () => {
  const states = [{ id: "cancelled", group: "cancelled", default: true }, { id: "done", group: "completed" }];
  assert.equal(completionTarget(states, true), "done");
  assert.deepEqual(states.map(s => s.id), ["cancelled", "done"]);
});
test("reabrir prefiere el estado pendiente por defecto y conserva estados existentes", () => {
  assert.equal(completionTarget([{ id: "open", group: "unstarted" }, { id: "default", group: "backlog", default: true }], false), "default");
  assert.equal(completionTarget([{ id: "cancelled", group: "cancelled" }], false), null);
  assert.equal(completionTarget([], true), null);
});
