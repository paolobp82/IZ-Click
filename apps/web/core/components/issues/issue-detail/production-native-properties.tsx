import { CommercialAssignment } from "@/components/issues/commercial-assignment";
import { useEffect, useMemo, useState } from "react";
import { invalidateProjectProductionMetadata } from "@/components/issues/issue-layouts/spreadsheet/production-project-metadata";
import { IssueService } from "@/services/issue";
import { validCalendarDate } from "@/app/lib/izclick/production-schedule";
import { sigLinkPayload, sigProjectAssociation } from "@/app/lib/izclick/production-sig";
import type { PlaneExternalLink } from "@/app/lib/izclick/production-sig";

/**
 * First-class fields inside Plane's normal editable issue sidebar.
 * Same IssueLink records as previous pilot: nothing copied to a parallel store.
 */
type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  isEditable: boolean;
};
type NativeLink = PlaneExternalLink & { metadata?: Record<string, unknown> | null };
const EVENT_KIND = "event-date";
function readEventDate(links: NativeLink[]): string {
  const raw = links.find((item) => item.metadata?.izclick_kind === EVENT_KIND)?.metadata?.izclick_event_date;
  return typeof raw === "string" && validCalendarDate(raw) ? raw : "";
}
function readSig(links: NativeLink[]) {
  const found = links.map(sigProjectAssociation).find((value) => value !== null);
  return { code: found?.code ?? "", url: found?.url ?? "" };
}

export function ProductionNativeProperties({ workspaceSlug, projectId, issueId, isEditable }: Props) {
  const service = useMemo(() => new IssueService(), []);
  const [links, setLinks] = useState<NativeLink[]>([]);
  const [date, setDate] = useState("");
  const [code, setCode] = useState("");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    setMessage("");
    service.fetchIssueLinks(workspaceSlug, projectId, issueId)
      .then((response) => {
        if (!alive) return;
        if (!Array.isArray(response)) throw new Error("Formato de enlaces inválido");
        const existing = response as NativeLink[];
        const sig = readSig(existing);
        setLinks(existing);
        setDate(readEventDate(existing));
        setCode(sig.code);
        setUrl(sig.url);
      })
      .catch(() => { if (alive) setError("No se pudieron cargar los campos de Producción."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [workspaceSlug, projectId, issueId, service]);

  const originalSig = readSig(links);
  const hasChanges = !loading && (
    date !== readEventDate(links) ||
    code.trim() !== originalSig.code ||
    url.trim() !== originalSig.url
  );
  const discardChanges = () => {
    const original = readSig(links);
    setDate(readEventDate(links));
    setCode(original.code);
    setUrl(original.url);
    setError("");
    setMessage("");
  };

  const save = async () => {
    if (!isEditable || loading || saving || !hasChanges) return;
    setError("");
    setMessage("");
    if (date && !validCalendarDate(date)) { setError("Fecha del evento inválida."); return; }
    setSaving(true);
    try {
      const response = await service.fetchIssueLinks(workspaceSlug, projectId, issueId);
      if (!Array.isArray(response)) throw new Error("No se pudieron comprobar los campos actuales.");
      const current = response as NativeLink[];
      // Avoid silent overwrite when another producer has edited the same work item.
      if (readEventDate(current) !== readEventDate(links)) {
        throw new Error("La fecha fue modificada por otro usuario. Actualiza antes de guardar.");
      }
      const beforeSig = readSig(links);
      const currentSig = readSig(current);
      if (currentSig.code !== beforeSig.code || currentSig.url !== beforeSig.url) {
        throw new Error("El vínculo SIG fue modificado por otro usuario. Actualiza antes de guardar.");
      }
      const eventLink = current.find((item) => item.metadata?.izclick_kind === EVENT_KIND);
      if (date !== readEventDate(current)) {
        if (!date) {
          if (eventLink) await service.deleteIssueLink(workspaceSlug, projectId, issueId, eventLink.id);
        } else {
          const payload = {
            title: "IZ-Click | Fecha de realización del evento",
            url: `https://izclick.izango.com.pe/${encodeURIComponent(workspaceSlug)}/projects/${encodeURIComponent(projectId)}/issues/${encodeURIComponent(issueId)}`,
            metadata: { izclick_kind: EVENT_KIND, izclick_event_date: date },
          };
          if (eventLink) await service.updateIssueLink(workspaceSlug, projectId, issueId, eventLink.id, payload);
          else await service.createIssueLink(workspaceSlug, projectId, issueId, payload);
        }
      }
      const sigLink = current.find((item) => sigProjectAssociation(item) !== null);
      if (code.trim() !== currentSig.code || url.trim() !== currentSig.url) {
        if (!code.trim() && !url.trim()) {
          if (sigLink) await service.deleteIssueLink(workspaceSlug, projectId, issueId, sigLink.id);
        } else {
          const payload = sigLinkPayload(code, url);
          if (sigLink) await service.updateIssueLink(workspaceSlug, projectId, issueId, sigLink.id, payload);
          else await service.createIssueLink(workspaceSlug, projectId, issueId, payload);
        }
      }
      const after = await service.fetchIssueLinks(workspaceSlug, projectId, issueId);
      if (!Array.isArray(after)) throw new Error("No se pudo verificar el guardado.");
      const updated = after as NativeLink[];
      const sig = readSig(updated);
      if (readEventDate(updated) !== date) throw new Error("No se pudo verificar la fecha guardada. Vuelve a intentarlo.");
      setLinks(updated);
      setDate(readEventDate(updated));
      setCode(sig.code);
      setUrl(sig.url);
      invalidateProjectProductionMetadata(workspaceSlug, projectId);
      setMessage("Campos guardados.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudieron guardar los campos.");
    } finally { setSaving(false); }
  };

  return (
    <section aria-label="Campos de Producción" className="mt-5 border-t border-subtle pt-4">
      <h5 className="mb-3 text-body-xs-medium">Producción · Campos</h5>
      <div className="mb-3 text-xs"><span className="mb-1 block">Comercial asignado</span><CommercialAssignment workspaceSlug={workspaceSlug} projectId={projectId} issueId={issueId} canEdit={isEditable} /></div>
      {loading ? <p role="status" className="text-xs">Consultando campos…</p> : (
        <div className="space-y-3">
          <label className="flex flex-col gap-1 text-xs">
            Fecha del evento
            <input aria-label="Fecha de realización del evento" type="date" value={date}
              onChange={(event) => { setDate(event.target.value); setMessage(""); }}
              disabled={!isEditable || saving}
              className="h-8 w-full rounded border border-subtle bg-surface-1 px-2 text-xs" />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            Código SIG
            <input value={code} maxLength={60} placeholder="IZ-26968"
              onChange={(event) => { setCode(event.target.value); setMessage(""); }}
              disabled={!isEditable || saving}
              className="h-8 w-full rounded border border-subtle bg-surface-1 px-2 text-xs" />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            Enlace SIG
            <input value={url} type="url" placeholder="https://izango-erp.vercel.app/proyectos/..."
              onChange={(event) => { setUrl(event.target.value); setMessage(""); }}
              disabled={!isEditable || saving}
              className="h-8 w-full rounded border border-subtle bg-surface-1 px-2 text-xs" />
          </label>
          {url && <a className="block truncate text-xs underline" href={url} target="_blank" rel="noopener noreferrer">Abrir SIG ↗</a>}
          {hasChanges && <p role="status" className="text-xs text-custom-text-300">Cambios sin guardar</p>}
          {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
          {message && <p role="status" className="text-xs text-green-500">{message}</p>}
          {isEditable && (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" disabled={saving || !hasChanges} onClick={() => void save()}
                className="rounded border border-subtle px-3 py-1.5 text-xs disabled:opacity-50">
                {saving ? "Guardando…" : "Guardar cambios"}
              </button>
              {hasChanges && (
                <button type="button" disabled={saving} onClick={discardChanges}
                  className="rounded px-3 py-1.5 text-xs text-custom-text-300 hover:bg-layer-2 disabled:opacity-50">
                  Descartar
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
