import { useCallback, useEffect, useMemo, useState } from "react";
import { IssueService } from "@/services/issue";
import { fetchProjectProductionMetadata, invalidateProjectProductionMetadata } from "./production-project-metadata";
import { validCalendarDate } from "@/app/lib/izclick/production-schedule";
import { sigLinkPayload, sigProjectAssociation } from "@/app/lib/izclick/production-sig";
import type { PlaneExternalLink } from "@/app/lib/izclick/production-sig";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  canEdit: boolean;
  labelIds: string[];
  onUpdateLabels: (ids: string[]) => Promise<void>;
  asDiv?: boolean;
};
const EVENT_KIND = "event-date";
const dateOf = (links: PlaneExternalLink[]): string => {
  const raw = links.find((link) => link.metadata?.izclick_kind === EVENT_KIND)?.metadata?.izclick_event_date;
  return validCalendarDate(raw) ? raw : "";
};

/** Inline editor on the native spreadsheet; reads and writes Plane IssueLink records. */
export function ProductionMetadataCells({ workspaceSlug, projectId, issueId, canEdit, labelIds, onUpdateLabels, asDiv = false }: Props) {
  const service = useMemo(() => new IssueService(), []);
  const [date, setDate] = useState("");
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editingClient, setEditingClient] = useState(false);
  const [clientBusy, setClientBusy] = useState(false);
  const [clientError, setClientError] = useState("");
  const [clients, setClients] = useState<{ id: string; name: string; color: string }[]>([]);
  const [sig, setSig] = useState<{ code: string; url: string } | null>(null);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState(false);
  const [editingSig, setEditingSig] = useState(false);
  const [sigCodeDraft, setSigCodeDraft] = useState("");
  const [sigUrlDraft, setSigUrlDraft] = useState("");

  const refresh = useCallback(async () => {
    const response = await service.fetchIssueLinks(workspaceSlug, projectId, issueId);
    if (!Array.isArray(response)) throw new Error("No se pudieron leer los campos de la carga.");
    const links = response as PlaneExternalLink[];
    const current = dateOf(links);
    setDate(current);
    setDraft(current);
    const match = links.map(sigProjectAssociation).find((link) => link !== null);
    setSig(match ? { code: match.code, url: match.url } : null);
    setSigCodeDraft(match?.code ?? "");
    setSigUrlDraft(match?.url ?? "");
  }, [service, workspaceSlug, projectId, issueId]);

  useEffect(() => {
    let active = true;
    setDate("");
    setDraft("");
    setSig(null);
    setClients([]);
    setEditing(false);
    setEditingClient(false);
    setClientError("");
    setEditingSig(false);
    setError("");
    setLoadError(false);
    setLoading(true);
    // Two shared project requests replace one request per visible row.
    fetchProjectProductionMetadata(workspaceSlug, projectId)
      .then(({ dates, sigLinks, clients: projectClients }) => {
        if (!active) return;
        const current = dates[issueId] ?? "";
        const match = sigLinks[issueId] ?? null;
        setDate(current);
        setDraft(current);
        setClients(projectClients);
        setSig(match);
        setSigCodeDraft(match?.code ?? "");
        setSigUrlDraft(match?.url ?? "");
      })
      .catch(() => { if (active) setLoadError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [workspaceSlug, projectId, issueId]);

  const saveDate = async () => {
    if (!canEdit || busy || loading || loadError) return;
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
      invalidateProjectProductionMetadata(workspaceSlug, projectId);
      await refresh(); // Read the persisted values, not an optimistic assumption.
      setEditing(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar la fecha.");
    } finally { setBusy(false); }
  };

  const saveSig = async () => {
    if (!canEdit || busy || loading || loadError) return;
    setBusy(true);
    setError("");
    try {
      const response = await service.fetchIssueLinks(workspaceSlug, projectId, issueId);
      if (!Array.isArray(response)) throw new Error("No se pudieron comprobar los enlaces SIG.");
      const links = response as PlaneExternalLink[];
      const existing = links.map(sigProjectAssociation).find((link) => link !== null);
      if ((existing?.code ?? "") !== (sig?.code ?? "") || (existing?.url ?? "") !== (sig?.url ?? "")) {
        throw new Error("Otro usuario cambió el vínculo SIG. Actualiza la carga antes de editar.");
      }
      const normalizedCode = sigCodeDraft.trim();
      const normalizedUrl = sigUrlDraft.trim();
      if (!normalizedCode && !normalizedUrl) {
        if (existing) await service.deleteIssueLink(workspaceSlug, projectId, issueId, existing.id);
      } else {
        const payload = sigLinkPayload(normalizedCode, normalizedUrl);
        if (existing) await service.updateIssueLink(workspaceSlug, projectId, issueId, existing.id, payload);
        else await service.createIssueLink(workspaceSlug, projectId, issueId, payload);
      }
      invalidateProjectProductionMetadata(workspaceSlug, projectId);
      await refresh();
      setEditingSig(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar el vínculo SIG.");
    } finally { setBusy(false); }
  };

  const client = clients.find((candidate) => labelIds.includes(candidate.id));
  const changeClient = async (clientId: string) => {
    if (!canEdit || clientBusy || loading || loadError) return;
    setClientBusy(true);
    setClientError("");
    try {
      // Avoid duplicate native Plane labels and leave unrelated labels intact.
      const clientIds = new Set(clients.map((item) => item.id));
      const untouchedLabels = [...new Set(labelIds)].filter((id) => !clientIds.has(id));
      const nextLabels = clientId ? [...untouchedLabels, clientId] : untouchedLabels;
      if (nextLabels.length !== labelIds.length || nextLabels.some((id, index) => id !== labelIds[index])) {
        await onUpdateLabels(nextLabels);
      }
      invalidateProjectProductionMetadata(workspaceSlug, projectId);
      setEditingClient(false);
    } catch {
      setClientError("No se pudo actualizar el cliente.");
    } finally { setClientBusy(false); }
  };

  const Cell = asDiv ? "div" : "td";

  return (
    <>
      <Cell className="h-11 min-w-40 border-r border-subtle px-3 text-13">
        {editingClient ? (
          <div className="flex flex-col gap-1 py-1">
            <select aria-label="Seleccionar cliente" value={client?.id ?? ""} disabled={clientBusy}
              onChange={(event) => void changeClient(event.target.value)}
              className="max-w-48 rounded border border-subtle bg-surface-1 p-1 text-xs">
              <option value="">Sin cliente</option>
              {clients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <button type="button" disabled={clientBusy} className="text-left text-xs underline"
              onClick={() => { setEditingClient(false); setClientError(""); }}>Cancelar</button>
            {clientError && <span role="alert" className="whitespace-normal text-xs text-red-500">{clientError}</span>}
          </div>
        ) : (
          <button type="button" disabled={!canEdit || loading || loadError}
            onClick={() => { setEditingClient(true); setClientError(""); }}
            title="Seleccionar cliente de esta carga"
            className="inline-flex max-w-44 items-center gap-1.5 truncate rounded px-2 py-1 text-left disabled:cursor-default"
            style={client ? { border: `1px solid ${client.color}` } : undefined}>
            {client && <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: client.color }} />}
            <span className="truncate">{client?.name ?? (loading ? "…" : "Sin cliente")}</span>
          </button>
        )}
      </Cell>
      <Cell className="h-11 min-w-40 border-r border-subtle px-2 text-13">
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
          <button type="button" disabled={!canEdit || loading || loadError} onClick={() => { setDraft(date); setEditing(true); setError(""); }}
            title={canEdit ? "Editar fecha del evento en esta celda" : "Sin permiso de edición"}
            className="w-full text-left hover:underline disabled:cursor-default">
            {loading ? "…" : loadError ? "No disponible" : date || "—"}
          </button>
        )}
      </Cell>
      <Cell className="h-11 min-w-40 border-r border-subtle px-2 text-13">
        {editingSig ? (
          <div className="flex min-w-56 flex-col gap-1 py-1">
            <input aria-label="Código SIG" maxLength={60} value={sigCodeDraft} disabled={busy}
              onChange={(event) => setSigCodeDraft(event.target.value)}
              placeholder="IZ-26968" className="rounded border border-subtle bg-surface-1 px-2 py-1 text-xs" />
            <input aria-label="Enlace del proyecto SIG" type="url" value={sigUrlDraft} disabled={busy}
              onChange={(event) => setSigUrlDraft(event.target.value)}
              placeholder="https://izango-erp.vercel.app/proyectos/..."
              className="rounded border border-subtle bg-surface-1 px-2 py-1 text-xs" />
            <div className="flex gap-2">
              <button type="button" disabled={busy} onClick={() => void saveSig()} className="underline">Guardar</button>
              <button type="button" disabled={busy} onClick={() => {
                setSigCodeDraft(sig?.code ?? ""); setSigUrlDraft(sig?.url ?? ""); setEditingSig(false); setError("");
              }} className="underline">Cancelar</button>
            </div>
            {error && <span role="alert" className="whitespace-normal text-xs text-red-500">{error}</span>}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {sig ? <a href={sig.url} target="_blank" rel="noopener noreferrer" className="underline"
              title="Abrir proyecto asociado en SIG">{sig.code} ↗</a> : <span>{loading ? "…" : "—"}</span>}
            {canEdit && <button type="button" disabled={loading || loadError} className="text-xs underline"
              onClick={() => { setSigCodeDraft(sig?.code ?? ""); setSigUrlDraft(sig?.url ?? ""); setEditingSig(true); setError(""); }}>
              Editar
            </button>}
          </div>
        )}
      </Cell>
    </>
  );
}
