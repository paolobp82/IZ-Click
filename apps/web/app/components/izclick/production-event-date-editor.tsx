import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { IssueService } from "@/services/issue";
import { validCalendarDate } from "@/app/lib/izclick/production-schedule";

type Props = { workspaceSlug: string; projectId: string; issueId: string; onClose: () => void };
type EventLink = {
  id: string;
  title: string;
  url: string;
  metadata?: Record<string, unknown> | null;
};
const KIND = "event-date";

function getEventLink(links: readonly EventLink[]): EventLink | null {
  return links.find((link) => link.metadata?.izclick_kind === KIND) ?? null;
}
function getEventDate(link: EventLink | null): string | null {
  const date = link?.metadata?.izclick_event_date;
  return typeof date === "string" && validCalendarDate(date) ? date : null;
}

/** Uses native IssueLink metadata: producers don't need administrator-only label creation permissions. */
export function ProductionEventDateEditor({ workspaceSlug, projectId, issueId, onClose }: Props) {
  const service = useMemo(() => new IssueService(), []);
  const [link, setLink] = useState<EventLink | null>(null);
  const [original, setOriginal] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(true);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setBusy(true);
    setReady(false);
    setError(null);
    service.fetchIssueLinks(workspaceSlug, projectId, issueId)
      .then((links) => {
        if (!active) return;
        if (!Array.isArray(links)) throw new Error("Plane no devolvió los enlaces de la carga");
        const found = getEventLink(links as EventLink[]);
        const current = getEventDate(found);
        setLink(found);
        setOriginal(current);
        setDate(current ?? "");
        setReady(true);
      })
      .catch(() => { if (active) setError("No se pudo consultar la fecha del evento en Plane"); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [workspaceSlug, projectId, issueId, service]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaved(false);
    setError(null);
    if (date && !validCalendarDate(date)) { setError("Fecha inválida"); return; }
    if (!ready) return;
    setSaving(true);
    try {
      // Verify existing date before updating to detect concurrent edits.
      const links = await service.fetchIssueLinks(workspaceSlug, projectId, issueId);
      if (!Array.isArray(links)) throw new Error("No se pudieron comprobar los enlaces actuales");
      const existing = getEventLink(links as EventLink[]);
      if (getEventDate(existing) !== original) {
        throw new Error("Otro usuario modificó la fecha; cierra y vuelve a abrir el editor");
      }
      if (!date) {
        if (existing) await service.deleteIssueLink(workspaceSlug, projectId, issueId, existing.id);
        setLink(null);
      } else {
        const payload = {
          title: "IZ-Click | Fecha de realización del evento",
          url: `https://izclick.izango.com.pe/${encodeURIComponent(workspaceSlug)}/projects/${encodeURIComponent(projectId)}/issues/${encodeURIComponent(issueId)}`,
          metadata: { izclick_kind: KIND, izclick_event_date: date },
        };
        const result = existing
          ? await service.updateIssueLink(workspaceSlug, projectId, issueId, existing.id, payload)
          : await service.createIssueLink(workspaceSlug, projectId, issueId, payload);
        setLink(result as EventLink);
      }
      setOriginal(date || null);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la fecha del evento");
    } finally { setSaving(false); }
  };

  return (
    <section className="rounded border border-subtle bg-surface-1 p-3" aria-label="Fecha de realización del evento">
      <div className="mb-3 flex justify-between gap-3">
        <h3 className="text-sm font-semibold">Fecha de realización del evento</h3>
        <button type="button" onClick={onClose} className="text-sm underline">Cerrar</button>
      </div>
      <p className="mb-3 text-xs text-custom-text-300">Independiente del vencimiento. Se guarda en los metadatos de Plane, sin modificar otras etiquetas ni enlaces.</p>
      {busy ? <p role="status" className="text-sm">Consultando fecha…</p> : (
        <form onSubmit={save} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Fecha del evento
            <input type="date" value={date}
              onChange={(e) => { setDate(e.target.value); setError(null); setSaved(false); }}
              className="rounded border border-subtle bg-surface-1 px-2 py-1.5" />
          </label>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          {saved && <p role="status" className="text-sm">Fecha guardada. Actualiza el calendario para verla.</p>}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={!ready || saving}
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
