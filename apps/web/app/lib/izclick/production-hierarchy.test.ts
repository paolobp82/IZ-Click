import assert from "node:assert/strict";
import { test } from "node:test";
import { rootIssueIds } from "./production-hierarchy.ts";

test("lista y tabla muestran raíces, dejando las subtareas al renderizador anidado", () => {
  const issues = {
    parent: { parent_id: null },
    child: { parent_id: "parent" },
    grandchild: { parent_id: "child" },
    other: {},
  };
  const ids = ["parent", "child", "grandchild", "other"];
  assert.deepEqual(rootIssueIds(ids, issues), ["parent", "other"]);
  assert.deepEqual(ids, ["parent", "child", "grandchild", "other"]);
  assert.equal(issues.child.parent_id, "parent");
});
test("una subtarea de otro estado o página tampoco aparece como independiente", () => {
  assert.deepEqual(rootIssueIds(["child"], { child: { parent_id: "parent-on-another-page" } }), []);
});
test("reasignar o quitar el padre actualiza inmediatamente las filas visibles", () => {
  const issues = { child: { parent_id: "parent" as string | null } };
  assert.deepEqual(rootIssueIds(["child"], issues), []);
  issues.child.parent_id = null;
  assert.deepEqual(rootIssueIds(["child"], issues), ["child"]);
});
test("conserva el orden de las raíces y los IDs aún pendientes de carga", () => {
  assert.deepEqual(rootIssueIds(["b", "pending", "a"], { a: {}, b: {} }), ["b", "pending", "a"]);
});
