import assert from "node:assert/strict";
import { test } from "node:test";
import { groupLoadsByProducer } from "./production-producers.ts";
test("cargas compartidas no duplican miembros y subtareas no cuentan", () => {
  const issue = { id: "a", assignee_ids: ["p", "p", "q"] };
  const groups = groupLoadsByProducer([issue, issue, { id: "child", parent_id: "a", assignee_ids: ["p"] }, { id: "none" }], [{ id: "p", name: "Paolo" }, { id: "q", name: "Ana" }]);
  assert.equal(groups.find(g => g.key === "p")?.issues.length, 1);
  assert.equal(groups.find(g => g.key === "q")?.issues.length, 1);
  assert.equal(groups.find(g => g.key === "__unassigned__")?.issues[0].id, "none");
  assert.equal(groups[0].name, "Ana");
});
