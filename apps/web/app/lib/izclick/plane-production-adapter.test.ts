import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizePlaneIssue, normalizePlaneState, normalizePlaneCollection } from "./plane-production-adapter.ts";

test("normaliza issue Plane: estado, responsable, proyecto y subtarea", () => {
  const item = normalizePlaneIssue({
    id: "i1", state: "s1", assignees: ["u1", { id: "u2" }],
    parent: "parent1", project: "p1",
  });
  assert.deepEqual(item, {
    id: "i1", parent_id: "parent1", state_id: "s1",
    assignee_ids: ["u1", "u2"], project_id: "p1",
    client_id: null, event_date: null,
  });
});

test("normaliza estados e ignora registros sin id", () => {
  assert.deepEqual(normalizePlaneCollection(
    { results: [{ id: "s1", name: "En curso", color: "#aabbcc" }, { name: "Invalido" }] },
    normalizePlaneState
  ), [{ id: "s1", name: "En curso", color: "#aabbcc" }]);
});

test("rechaza payload desconocido para no mostrar métricas ficticias", () => {
  assert.throws(() => normalizePlaneCollection({ message: "Forbidden" }, normalizePlaneIssue));
});

test("el padre puede ser objeto y no solo uuid", () => {
  const issue = normalizePlaneIssue({ id: "sub", parent: { id: "root" }, assignees: null });
  assert.equal(issue?.parent_id, "root");
  assert.deepEqual(issue?.assignee_ids, []);
});
