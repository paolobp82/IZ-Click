import assert from "node:assert/strict";
import { test } from "node:test";
import { mapWithConcurrency } from "./production-concurrency.ts";

test("mantiene el orden de proyectos aun si responden en orden distinto", async () => {
  let concurrent = 0;
  let peak = 0;
  const data = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => {
    concurrent++; peak = Math.max(peak, concurrent);
    await new Promise((resolve) => setTimeout(resolve, (6 - n) * 2));
    concurrent--;
    return n * 10;
  });
  assert.deepEqual(data, [10, 20, 30, 40, 50]);
  assert.equal(peak, 2);
});

test("no publica totales parciales si una consulta falla", async () => {
  await assert.rejects(
    mapWithConcurrency(["p1", "p2", "p3"], 2, async (id) => {
      if (id === "p2") throw new Error("403");
      return id;
    }),
    /403/
  );
});

test("con cero proyectos no hace llamadas", async () => {
  const result = await mapWithConcurrency([], 4, async () => { throw new Error("No ejecutar"); });
  assert.deepEqual(result, []);
});
