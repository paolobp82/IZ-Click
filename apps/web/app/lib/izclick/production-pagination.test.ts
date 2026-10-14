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


test("Plane incluye next_cursor aun cuando next_page_results=false: no repetir ultima pagina", async () => {
  let requests = 0;
  const rows = await collectPlanePages(async () => {
    requests++;
    return { results: ["last"], next_cursor: "100:1:0", next_page_results: false };
  }, (payload) => (payload as { results: string[] }).results);
  assert.deepEqual(rows, ["last"]);
  assert.equal(requests, 1);
});

test("Plane pagina correctamente si el indicador true y luego false", async () => {
  const visited: Array<string | null> = [];
  const rows = await collectPlanePages(async (cursor) => {
    visited.push(cursor);
    return cursor === null
      ? { results: ["a"], next_cursor: "100:1:0", next_page_results: true }
      : { results: ["b"], next_cursor: "100:2:0", next_page_results: false };
  }, (payload) => (payload as { results: string[] }).results);
  assert.deepEqual(rows, ["a", "b"]);
  assert.deepEqual(visited, [null, "100:1:0"]);
});
