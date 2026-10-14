import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { IssueService } from "@/services/issue";
import { SIG_LINK_PREFIX, sigLinkPayload, sigProjectAssociation } from "@/app/lib/izclick/production-sig";
import type { PlaneExternalLink } from "@/app/lib/izclick/production-sig";

type Props = { workspaceSlug: string; projectId: string; issueId: string; onClose: () => void };

/**
 * Persists SIG code and project URL together in an existing Plane IssueLink.
 * Other links are never touched. Plane's own service handles auth/CSRF.
 */
export function ProductionSigLinkEditor({ workspaceSlug, projectId, issueId, onClose }: Props) {
  const service = useMemo(() => new IssueService(), []);
  const [link, setLink] = useState<PlaneExternalLink | null>(null);
  const [code, setCode] = useState("");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setSaved(false);
    service.fetchIssueLinks(workspaceSlug, projectId, issueId)
      .then((response) => {
        if (!active) return;
        if (!Array.isArray(response)) throw new Error("La API de enlaces devolvió un formato inesperado");
        const candidate = (response as PlaneExternalLink[]).find(
          (item) => sigProjectAssociation(item) !== null
        ) ?? null;
        const existing = candidate ? sigProjectAssociation(candidate) : null;
        setLink(candidate);
        setCode(existing?.code ?? "");
        setUrl(existing?.url ?? "");
      })
      .catch(() => { if (active) setError("No se pudieron consultar los enlaces de la carga. Comprueba los permisos."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [service, workspaceSlug, projectId, issueId]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSaved(false);
    let payload;
    try { payload = sigLinkPayload(code, url); }
    catch (err) { setError(err instanceof Error ? err.message : "Datos SIG inválidos"); return; }
    setSaving(true);
    try {
      const result = link
        ? await service.updateIssueLink(workspaceSlug, projectId, issueId, link.id, payload)
        : await service.createIssueLink(workspaceSlug, projectId, issueId, payload);
      setLink(result as PlaneExternalLink);
      setCode(payload.title.slice(SIG_LINK_PREFIX.length));
      setUrl(payload.url);
      setSaved(true);
    } catch {
      setError("Plane no guardó la asociación. Verifica tus permisos y vuelve a intentar.");
    } finally { setSaving(false); }
  };

  return (
    <section className="rounded-md border border-subtle bg-surface-1 p-3" aria-label="Asociación SIG Izango 360">
      <div className="mb-3 flex justify-between gap-3">
        <h3 className="font-semibold text-sm">Proyecto SIG Izango 360</h3>
        <button type="button" onClick={onClose} className="text-sm underline">Cerrar</button>
      </div>
      {loading ? <p role="status" className="text-sm">Consultando enlaces…</p> : (
        <form onSubmit={save} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Código SIG
            <input required maxLength={60} value={code} onChange={(e) => setCode(e.target.value)}
              placeholder="IZ-26968" className="rounded border border-subtle bg-surface-1 px-2 py-1.5" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Enlace al proyecto SIG
            <input required type="url" value={url} onChange={(e) => setUrl(e.target.value)}
              placeholder="https://izango-erp.vercel.app/proyectos/..." className="rounded border border-subtle bg-surface-1 px-2 py-1.5" />
          </label>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          {saved && <p role="status" className="text-sm">Asociación SIG guardada en Plane.</p>}
          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={saving || !!error && error.includes("consultar los enlaces")}
              className="rounded bg-custom-primary-100 px-3 py-1.5 text-sm text-white disabled:opacity-50">
              {saving ? "Guardando…" : link ? "Actualizar vínculo SIG" : "Guardar vínculo SIG"}
            </button>
            {sigProjectAssociation(link ?? { id: "", title: "", url: "" }) && (
              <a href={sigProjectAssociation(link ?? { id: "", title: "", url: "" })?.url} target="_blank" rel="noopener noreferrer" className="self-center text-sm underline">
                Abrir proyecto SIG ↗
              </a>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
