import { useCallback, useEffect, useMemo, useState } from "react";
import { IssueService } from "@/services/issue";
import { validCalendarDate } from "@/app/lib/izclick/production-schedule";
import { sigProjectAssociation } from "@/app/lib/izclick/production-sig";
import type { PlaneExternalLink } from "@/app/lib/izclick/production-sig";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  canEdit: boolean;
  openDetails: () => void;
};
const EVENT_KIND = "event-date";
const dateOf = (links: PlaneExternalLink[]): string => {
  const raw = links.find((link) => link.metadata?.izclick_kind === EVENT_KIND)?.metadata?.izclick_event_date;
  return validCalendarDate(raw) ? raw : "";
};

/** Inline editor on the native spreadsheet; reads and writes Plane IssueLink records. */
export function ProductionMetadataCells({ workspaceSlug, projectId, issueId, canEdit, openDetails }: Props) {
  const service = useMemo(() => new IssueService(), []);
  const [date, setDate] = useState("");
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sig, setSig] = useState<{ code: string; url: string } | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const response = await service.fetchIssueLinks(workspaceSlug, projectId, issueId);
    if (!Array.isArray(response)) throw new Error("No se pudieron leer los campos de la carga.");
    const links = response as PlaneExternalLink[];
    const current = dateOf(links);
    setDate(current);
    setDraft(current);
    const match = links.map(sigProjectAssociation).find((link) => link !== null);
    setSig(match ? { code: match.code, url: match.url } : null);
  }, [service, workspaceSlug, projectId, issueId]);

  useEffect(() => {
    let active = true;
    setDate("");
    setDraft("");
    setSig(null);
    setEditing(false);
    setError("");
    setLoading(true);
    // The cancellation guard prevents stale completion from changing UI state.
    service.fetchIssueLinks(workspaceSlug, projectId, issueId)
      .then((response) => {
        if (!active) return;
        if (!Array.isArray(response)) throw new Error("No se pudieron leer los campos de la carga.");
        const links = response as PlaneExternalLink[];
        const current = dateOf(links);
        setDate(current);
        setDraft(current);
        const match = links.map(sigProjectAssociation).find((link) => link !== null);
        setSig(match ? { code: match.code, url: match.url } : null);
      })
      .catch(() => { if (active) setError("No se pudieron consultar los campos."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [service, workspaceSlug, projectId, issueId]);

  const saveDate = async () => {
    if (!canEdit || busy || loading) return;
    if (draft && !validCalendarDate(draft)) { setError("Fecha inválida."); return; }
    if (draft === date) { setEditing(false); return; }
    setBusy(true);
    setError("");
    try {
      const response = await service.fetchIssueLinks(workspaceSlug, projectId, issueId);
      if (!Array.isArray(response)) throw new Error("No se pudieron comprobar los datos actuales.");
      const links = response as PlaneExternalLink[];
      if (dateOf(links) !== date) throw new Error("La fecha cambió en otra sesión. Actualiza la carga antes de editar.");
      const existing = links.find((link) => link.metadata?.izclick_kind === EVENT_KIND);
      if (!draft) {
        if (existing) await service.deleteIssueLink(workspaceSlug, projectId, issueId, existing.id);
      } else {
        const payload = {
          title: "IZ-Click | Fecha de realización del evento",
          url: `https://izclick.izango.com.pe/${encodeURIComponent(workspaceSlug)}/projects/${encodeURIComponent(projectId)}/issues/${encodeURIComponent(issueId)}`,
          metadata: { izclick_kind: EVENT_KIND, izclick_event_date: draft },
        };
        if (existing) await service.updateIssueLink(workspaceSlug, projectId, issueId, existing.id, payload);
        else await service.createIssueLink(workspaceSlug, projectId, issueId, payload);
      }
      await refresh(); // Read the persisted values, not an optimistic assumption.
      setEditing(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar la fecha.");
    } finally { setBusy(false); }
  };

  return (
    <>
      <td className="h-11 min-w-40 border-r border-subtle px-2 text-13">
        {editing ? (
          <div className="flex flex-wrap items-center gap-1">
            <input type="date" aria-label="Fecha del evento" value={draft} disabled={busy}
              onChange={(event) => setDraft(event.target.value)}
              className="max-w-36 rounded border border-subtle bg-surface-1 px-1 py-1 text-xs" />
            <button type="button" disabled={busy} onClick={() => void saveDate()} className="px-1 underline">Guardar</button>
            <button type="button" disabled={busy} onClick={() => { setDraft(date); setEditing(false); setError(""); }} className="px-1 underline">Cancelar</button>
            {error && <span role="alert" className="w-full whitespace-normal text-xs text-red-500">{error}</span>}
          </div>
        ) : (
          <button type="button" disabled={!canEdit || loading} onClick={() => { setDraft(date); setEditing(true); setError(""); }}
            title={canEdit ? "Editar fecha del evento en esta celda" : "Sin permiso de edición"}
            className="w-full text-left hover:underline disabled:cursor-default">
            {loading ? "…" : error ? "No disponible" : date || "—"}
          </button>
        )}
      </td>
      <td className="h-11 min-w-40 border-r border-subtle px-3 text-13">
        {sig ? (
          <a href={sig.url} target="_blank" rel="noopener noreferrer" className="underline"
            title="Abrir proyecto asociado en SIG">{sig.code} ↗</a>
        ) : (
          <button type="button" disabled={!canEdit} className="w-full text-left hover:underline" onClick={openDetails}
            title="Vincular SIG en la ficha de carga">{loading ? "…" : "—"}</button>
        )}
      </td>
    </>
  );
}
