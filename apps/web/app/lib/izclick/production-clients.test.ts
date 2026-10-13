import assert from "node:assert/strict";
import { test } from "node:test";
import { clientsFromPlaneLabels, productionClientKey } from "./production-clients.ts";

test("solo incorpora etiquetas de cliente y conserva colores", () => {
  const clients = clientsFromPlaneLabels([
    { id: "1", name: "Cliente: Ripley", color: "#ff6600" },
    { id: "2", name: "Urgente", color: "#abcdef" },
    { id: "3", name: "cliente: Qroma", color: "#00bbff" },
  ]);
  assert.deepEqual(clients, [
    { id: "3", name: "Qroma", color: "#00bbff" },
    { id: "1", name: "Ripley", color: "#ff6600" },
  ]);
});

test("rechaza respuesta de API incorrecta", () => {
  assert.throws(() => clientsFromPlaneLabels({ detail: "Forbidden" }));
});

test("evita códigos CSS inválidos", () => {
  assert.equal(clientsFromPlaneLabels([{ id: "1", name: "Cliente: Test", color: "url(javascript:)" }])[0].color, "#64748b");
});


test("agrupa cliente con etiquetas diferentes y acentos", () => {
  assert.equal(productionClientKey("  Ripley "), productionClientKey("RIPLEY"));
  assert.equal(productionClientKey("San José"), productionClientKey("san jose"));
});
