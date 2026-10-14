import assert from "node:assert/strict";
import { test } from "node:test";
import {
  eventDateFromLabels,
  eventDateLabelName,
  mergeEventDateLabelIds,
  parseIssueLabelIds,
} from "./production-event-date.ts";

const labels = [
  { id: "client", name: "Cliente: Ripley" },
  { id: "old", name: "Evento: 2026-10-15" },
  { id: "new", name: "Evento: 2026-10-20" },
  { id: "urgent", name: "Urgente" },
];

test("interpreta la fecha del evento sin mezclarla con el vencimiento", () => {
  assert.equal(eventDateFromLabels(labels, ["client", "old"]), "2026-10-15");
  assert.equal(eventDateLabelName("2026-10-20"), "Evento: 2026-10-20");
  assert.throws(() => eventDateLabelName("2026-02-30"));
});

test("preserva otras etiquetas cuando cambia o quita la fecha", () => {
  assert.deepEqual(mergeEventDateLabelIds(["client", "old", "urgent"], labels, "new"), ["client", "urgent", "new"]);
  assert.deepEqual(mergeEventDateLabelIds(["client", "old", "urgent"], labels, null), ["client", "urgent"]);
});

test("rechaza dos fechas de evento simultáneas", () => {
  assert.throws(() => eventDateFromLabels(labels, ["old", "new"]));
});

test("rechaza payload sin etiquetas para prevenir borrado", () => {
  assert.deepEqual(parseIssueLabelIds({ labels: ["client", { id: "old" }] }), ["client", "old"]);
  assert.throws(() => parseIssueLabelIds({}), /no devolvió/);
  assert.throws(() => parseIssueLabelIds({ labels: null }), /inesperado/);
});
