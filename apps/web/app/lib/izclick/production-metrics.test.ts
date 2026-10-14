import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateProductionMetrics, matchesProductionFilter } from "./production-metrics.ts";

const states = [
  { id: "a", name: "Aprobado", color: "#008000" },
  { id: "p", name: "Pendiente", color: "#ff9900" },
] as const;

test("excluye subtareas y registros repetidos", () => {
  const actual = calculateProductionMetrics([
    { id: "1", state_id: "a" },
    { id: "1", state_id: "a" },
    { id: "2", parent_id: "1", state_id: "p" },
    { id: "3", state_id: "p" },
  ], states);
  assert.equal(actual.total, 2);
  assert.deepEqual(actual.slices.map(({ count, percent }) => [count, percent]), [[1, 50], [1, 50]]);
});

test("filtra responsable y proyecto sin incluir subtareas", () => {
  const actual = calculateProductionMetrics([
    { id: "1", state_id: "a", assignee_ids: ["u1"], project_id: "p1" },
    { id: "2", state_id: "p", assignee_ids: ["u2"], project_id: "p1" },
    { id: "3", parent_id: "1", state_id: "p", assignee_ids: ["u1"], project_id: "p1" },
    { id: "4", state_id: "a", assignee_ids: ["u1"], project_id: "p2" },
  ], states, { producerId: "u1", projectId: "p1" });
  assert.equal(actual.total, 1);
  assert.deepEqual(actual.slices.map(({ count, percent }) => [count, percent]), [[1, 100]]);
});

test("los porcentajes suman 100 aunque existan tercios", () => {
  const result = calculateProductionMetrics([
    { id: "1", state_id: "a" },
    { id: "2", state_id: "p" },
    { id: "3", state_id: null },
  ], states);
  assert.equal(result.total, 3);
  assert.equal(result.slices.reduce((sum, item) => sum + item.percent, 0), 100);
});

test("sin registros no divide entre cero", () => {
  assert.deepEqual(calculateProductionMetrics([], states), { total: 0, slices: [] });
});

test("las cargas sin estado reconocido se agrupan como Sin estado", () => {
  const result = calculateProductionMetrics([{ id: "1", state_id: "desconocido" }], states);
  assert.equal(result.slices[0].name, "Sin estado");
  assert.equal(result.slices[0].percent, 100);
});

test("filtra por cliente", () => {
  const result = calculateProductionMetrics([
    { id: "1", client_id: "ripley", state_id: "a" },
    { id: "2", client_id: "qroma", state_id: "p" },
  ], states, { clientId: "ripley" });
  assert.equal(result.total, 1);
  assert.equal(result.slices[0].name, "Aprobado");
});


test("filtra clientes mediante etiquetas nativas sin requerir una columna nueva", () => {
  const result = calculateProductionMetrics([
    { id: "1", state_id: "a", label_ids: ["cliente-ripley"] },
    { id: "2", state_id: "p", label_ids: ["cliente-qroma"] },
  ], states, { clientId: "cliente-ripley" });
  assert.equal(result.total, 1);
  assert.equal(result.slices[0].name, "Aprobado");
});


test("carga compartida: cada productor la ve, pero el global no la duplica", () => {
  const issues = [{ id: "compartida", state_id: "a", assignee_ids: ["u1", "u2"] }];
  assert.equal(calculateProductionMetrics(issues, states).total, 1);
  assert.equal(calculateProductionMetrics(issues, states, { producerId: "u1" }).total, 1);
  assert.equal(calculateProductionMetrics(issues, states, { producerId: "u2" }).total, 1);
});


test("los filtros de calendario y directorio coinciden con los del gráfico", () => {
  const issue = {
    id: "sig1", project_id: "p1", client_id: "cliente:ripley",
    assignee_ids: ["u1", "u2"], state_id: "a",
  };
  const criteria = { producerId: "u1", projectId: "p1", clientId: "cliente:ripley" };
  assert.equal(matchesProductionFilter(issue, criteria), true);
  assert.equal(calculateProductionMetrics([issue], states, criteria).total, 1);
  assert.equal(matchesProductionFilter(issue, { ...criteria, projectId: "p2" }), false);
  assert.equal(calculateProductionMetrics([issue], states, { ...criteria, projectId: "p2" }).total, 0);
});
