import { useEffect, useState } from "react";
import { API_BASE_URL } from "@plane/constants";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { fetchProjectProductionMetadata, invalidateProjectProductionMetadata } from "@/components/issues/issue-layouts/spreadsheet/production-project-metadata";

export function CommercialAssignment({ workspaceSlug, projectId, issueId, canEdit }: {
  workspaceSlug: string; projectId: string; issueId: string; canEdit: boolean;
}) {
  const [value, setValue] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    setLoading(true); setError(""); setValue(null);
    fetchProjectProductionMetadata(workspaceSlug, projectId).then(data => {
      if (alive) setValue(data.commercial[issueId] ?? null);
    }).catch(() => { if (alive) setError("No se pudo cargar el comercial. Actualiza la vista."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [workspaceSlug, projectId, issueId]);
  return <div className="min-w-0" data-izclick-commercial={issueId}>
    <MemberDropdown projectId={projectId} multiple={false} value={value}
      disabled={!canEdit || loading || busy || Boolean(error)} placeholder={loading ? "Cargando…" : "Sin comercial"}
      tooltipContent="Comercial asignado" buttonVariant="border-with-text" showUserDetails
      onChange={async memberId => {
        if (!canEdit || loading || busy) return;
        setBusy(true); setError("");
        try {
          const url = `${(API_BASE_URL || "").replace(/\/$/, "")}/api/workspaces/${encodeURIComponent(workspaceSlug)}/projects/${encodeURIComponent(projectId)}/issues/${encodeURIComponent(issueId)}/production-commercial/`;
          const response = await fetch(url, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ member_id: memberId }) });
          if (!response.ok) throw new Error();
          const result = await response.json();
          setValue(result.member_id ?? null);
          invalidateProjectProductionMetadata(workspaceSlug, projectId);
        } catch { setError("No se pudo guardar el comercial. Actualiza la vista para reintentar."); }
        finally { setBusy(false); }
      }} />
    {error && <span role="alert" className="block text-xs text-red-500">{error}</span>}
  </div>;
}
