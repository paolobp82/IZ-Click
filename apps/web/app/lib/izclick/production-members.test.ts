import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeProductionMembers } from "./production-members.ts";

test("normaliza miembros de workspace y nombres", () => {
  const members = normalizeProductionMembers([
    { member: { id: "u1", first_name: "Ana", last_name: "Estupiñán" } },
    { member: { id: "u2", display_name: "Miguel Salas" } },
  ]);
  assert.equal(members.length, 2);
  assert.deepEqual(members.map(({ name }) => name), ["Ana Estupiñán", "Miguel Salas"]);
});

test("elimina duplicados y evita exponer email como nombre", () => {
  const members = normalizeProductionMembers({
    results: [
      { member: { id: "u1", email: "private@example.com" } },
      { member: { id: "u1", email: "private@example.com" } },
    ],
  });
  assert.deepEqual(members, [{ id: "u1", name: "Usuario u1" }]);
});

test("rechaza respuesta de miembros incorrecta", () => {
  assert.throws(() => normalizeProductionMembers({ detail: "Forbidden" }));
});
