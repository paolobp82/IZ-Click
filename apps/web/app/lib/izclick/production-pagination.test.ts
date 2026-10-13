import assert from "node:assert/strict";
import { test } from "node:test";
import { collectPlanePages } from "./production-pagination.ts";

test("reúne varias páginas completas sin perder cargas", async () => {
  const cursors: Array<string | null> = [];
  const result = await collectPlanePages(async (cursor) => {
    cursors.push(cursor);
    return cursor ? { results: ["c"], next_page_results: false } :
      { results: ["a", "b"], next_page_results: true, next_cursor: "next" };
  }, (response) => (response as { results: string[] }).results);
  assert.deepEqual(result, ["a", "b", "c"]);
  assert.deepEqual(cursors, [null, "next"]);
});

test("rechaza repetición de cursor", async () => {
  await assert.rejects(
    collectPlanePages(async () => ({ results: ["a"], next_cursor: "loop", next_page_results: true }),
      (response) => (response as { results: string[] }).results),
    /Paginación inconsistente/
  );
});

test("rechaza marcador next=true sin cursor", async () => {
  await assert.rejects(
    collectPlanePages(async () => ({ results: ["a"], next_page_results: true }),
      (response) => (response as { results: string[] }).results),
    /Paginación inconsistente/
  );
});

test("acepta respuesta de arreglo directo", async () => {
  assert.deepEqual(await collectPlanePages(async () => [1, 2], (v) => v as number[]), [1, 2]);
});
