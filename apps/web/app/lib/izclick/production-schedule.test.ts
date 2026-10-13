import assert from "node:assert/strict";
import { test } from "node:test";
import { scheduledProductionLoads, validCalendarDate } from "./production-schedule.ts";

test("acepta fechas reales y rechaza fechas imposibles", () => {
  assert.equal(validCalendarDate("2026-02-28"), true);
  assert.equal(validCalendarDate("2026-02-30"), false);
  assert.equal(validCalendarDate("2026-13-01"), false);
  assert.equal(validCalendarDate("2024-02-29"), true);
});

test("prioriza fecha de evento cuando está presente sin sobrescribir target_date", () => {
  const rows = scheduledProductionLoads([
    { id: "one", project_id: "p1", event_date: "2026-10-20", target_date: "2026-10-15", name: "Activación", priority: "high" },
  ]);
  assert.equal(rows[0].date, "2026-10-20");
  assert.equal(rows[0].source, "event_date");
  assert.equal(rows[0].priority, "high");
});

test("usa fecha prevista nativa de Plane si no hay fecha de evento", () => {
  const rows = scheduledProductionLoads([{ id: "one", project_id: "p1", target_date: "2026-11-01" }]);
  assert.equal(rows[0].source, "target_date");
  assert.equal(rows[0].date, "2026-11-01");
});

test("no duplica cargas ni cuenta subtareas, ni muestra fechas inválidas", () => {
  const rows = scheduledProductionLoads([
    { id: "1", project_id: "p1", target_date: "2026-11-01" },
    { id: "1", project_id: "p1", target_date: "2026-11-01" },
    { id: "sub", project_id: "p1", parent_id: "1", target_date: "2026-11-01" },
    { id: "2", project_id: "p1", target_date: "2026-02-30" },
    { id: "3", target_date: "2026-11-01" },
  ]);
  assert.deepEqual(rows.map((item) => item.id), ["1"]);
});
