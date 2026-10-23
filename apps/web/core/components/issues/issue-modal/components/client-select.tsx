import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { observer } from "mobx-react";
import { Controller, useFormContext } from "react-hook-form";
import type { TIssue } from "@plane/types";
import { useLabel } from "@/hooks/store/use-label";
import { clientsFromPlaneLabels } from "@/app/lib/izclick/production-clients";

export const IssueClientSelect = observer(function IssueClientSelect({ projectId, onChange }: { projectId: string | null; onChange: () => void }) {
  const { control, formState: { isSubmitting } } = useFormContext<TIssue>();
  const { getProjectLabels, fetchProjectLabels } = useLabel();
  const { workspaceSlug } = useParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!workspaceSlug || !projectId) return;
    let active = true;
    setLoading(true); setError(false);
    fetchProjectLabels(String(workspaceSlug), projectId)
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [workspaceSlug, projectId, fetchProjectLabels]);
  const clients = clientsFromPlaneLabels(projectId ? getProjectLabels(projectId) ?? [] : []);
  return <Controller control={control} name="label_ids" render={({ field }) => {
    const values = field.value ?? [];
    const clientIds = new Set(clients.map(client => client.id));
    const selectedIds = new Set(values);
    return <label className="flex items-center gap-2 text-xs">Cliente
      <select aria-label="Cliente de la nueva tarea" disabled={!projectId || isSubmitting || loading || error}
        className="h-8 max-w-60 rounded border border-subtle bg-surface-1 px-2"
        value={clients.find(client => selectedIds.has(client.id))?.id ?? ""}
        onChange={event => {
          field.onChange([...values.filter(id => !clientIds.has(id)), ...(event.target.value ? [event.target.value] : [])]);
          onChange();
        }}>
        <option value="">{loading ? "Cargando clientes…" : error ? "Error: vuelve a abrir la tarea" : "Sin cliente"}</option>
        {clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}
      </select>
    </label>;
  }} />;
});
