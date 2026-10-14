import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { IssueService, IssueLabelService } from "@/services/issue";
import {
  EVENT_LABEL_COLOR,
  eventDateFromLabels,
  eventDateLabelName,
  mergeEventDateLabelIds,
  parseIssueLabelIds,
} from "@/app/lib/izclick/production-event-date";
import type { PlaneLabelSummary } from "@/app/lib/izclick/production-event-date";
import { validCalendarDate } from "@/app/lib/izclick/production-schedule";

type Props = { workspaceSlug: string; projectId: string; issueId: string; onClose: () => void };

export function ProductionEventDateEditor({ workspaceSlug, projectId, issueId, onClose }: Props) {
  const issueService = useMemo(() => new IssueService(), []);
  const labelService = useMemo(() => new IssueLabelService(), []);
  const [labels, setLabels] = useState<PlaneLabelSummary[]>([]);
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setBusy(true);
    setError(null);
    setSaved(false);
    Promise.all([
      issueService.retrieve(workspaceSlug, projectId, issueId),
      labelService.getProjectLabels(workspaceSlug, projectId),
    ]).then(([issue, availableLabels]) => {
      if (!active) return;
      if (!Array.isArray(availableLabels)) throw new Error("No se pudieron interpretar las etiquetas del proyecto");
      const projectLabels = availableLabels as PlaneLabelSummary[];
      const current = parseIssueLabelIds(issue);
      const existingDate = eventDateFromLabels(projectLabels, current);
      setLabels(projectLabels);
      setDate(existingDate ?? "");
    }).catch((err: unknown) => {
      if (active) setError(err instanceof Error ? err.message : "Error al consultar fecha del evento");
    }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [workspaceSlug, projectId, issueId, issueService, labelService]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSaved(false);
    if (date && !validCalendarDate(date)) {
      setError("Selecciona una fecha de evento válida"); return;
    }
    setSaving(true);
    try {
      // Re-read the issue immediately before saving to preserve all currently assigned labels.
      const currentIssue = await issueService.retrieve(workspaceSlug, projectId, issueId);
      const currentIds = parseIssueLabelIds(currentIssue);
      const freshLabels = await labelService.getProjectLabels(workspaceSlug, projectId);
      if (!Array.isArray(freshLabels)) throw new Error("No se pudieron verificar las etiquetas actuales");
      const projectLabels: PlaneLabelSummary[] = freshLabels;
      const currentDate = eventDateFromLabels(projectLabels, currentIds);
      const initialDate = eventDateFromLabels(labels, currentIds);
      if (initialDate !== currentDate) throw new Error("Otro usuario cambió la fecha del evento. Cierra y vuelve a abrir el editor.");

      let nextLabelId: string | null = null;
      if (date) {
        const desiredName = eventDateLabelName(date);
        const existing = projectLabels.find((label) => label.name === desiredName);
        if (existing) nextLabelId = existing.id;
        else {
          const created = await labelService.createIssueLabel(workspaceSlug, projectId, {
            name: desiredName,
            color: EVENT_LABEL_COLOR,
          });
          if (!created || typeof created.id !== "string") throw new Error("Plane no confirmó la nueva etiqueta de fecha");
          nextLabelId = created.id;
        }
      }

      // Plane's labels PATCH replaces the full list. Keep all non-event labels intact.
      const desired = mergeEventDateLabelIds(currentIds, projectLabels, nextLabelId);
      await issueService.patchIssue(workspaceSlug, projectId, issueId, { labels: desired });
      setLabels([...projectLabels, ...(nextLabelId && !projectLabels.some((label) => label.id === nextLabelId)
        ? [{ id: nextLabelId, name: eventDateLabelName(date), color: EVENT_LABEL_COLOR }] : [])]);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Plane no pudo guardar la fecha");
    } finally { setSaving(false); }
  };

  return (
    <section className="rounded border border-subtle bg-surface-1 p-3" aria-label="Fecha de realización del evento">
      <div className="mb-3 flex justify-between gap-3">
        <h3 className="text-sm font-semibold">Fecha de realización del evento</h3>
        <button type="button" onClick={onClose} className="text-sm underline">Cerrar</button>
      </div>
      <p className="mb-3 text-xs text-custom-text-300">Independiente de la fecha de entrega de la tarea en Plane.</p>
      {busy ? <p role="status" className="text-sm">Consultando fecha…</p> : (
        <form onSubmit={save} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Fecha del evento
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="rounded border border-subtle bg-surface-1 px-2 py-1.5" />
          </label>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          {saved && <p role="status" className="text-sm">Fecha guardada. Actualiza la vista para reflejarla en el calendario.</p>}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy || saving || Boolean(error && !saved)}
              className="rounded border border-subtle px-3 py-1.5 text-sm disabled:opacity-50">
              {saving ? "Guardando…" : "Guardar fecha"}
            </button>
            {date && <button type="button" onClick={() => { setDate(""); setError(null); setSaved(false); }}
              className="text-sm underline">Quitar fecha</button>}
            {saved && <button type="button" onClick={() => window.location.reload()} className="text-sm underline">
              Actualizar calendario
            </button>}
          </div>
        </form>
      )}
    </section>
  );
}
