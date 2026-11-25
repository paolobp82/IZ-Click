import { useState, type ReactNode } from "react";
import useSWR from "swr";
import { useIzclickAccess } from "@/hooks/use-izclick-access";
import { coordinationService } from "@/services/izclick-coordination.service";

/** Uses workspace business roles, including producers not yet in this project. */
export function CoordinatorProducerSelect({ slug, value, onChange, disabled = false }: {
  slug: string; value: string; onChange: (id: string) => void; disabled?: boolean;
}) {
  const members = useSWR(["izclick-producers", slug], () => coordinationService.roles(slug));
  return <div>
    <select aria-label="Productor asignado" value={value} disabled={disabled || !members.data}
      className="w-full rounded border border-subtle bg-surface-1 p-2 text-xs"
      onChange={(event) => onChange(event.target.value)}>
      <option value="">Seleccionar productor</option>
      {members.data?.filter(member => member.role === "producer").map(member =>
        <option key={member.user_id} value={member.user_id}>{member.name}</option>)}
    </select>
    {members.error && <p role="alert">No se pudieron cargar los productores. <button type="button" onClick={() => void members.mutate()}>Reintentar</button></p>}
    {members.data && !members.data.some(member => member.role === "producer") && <p role="status">No hay productores activos configurados en este espacio.</p>}
  </div>;
}

/** All native updates for managed loads go through the audited assignment API. */
export function ManagedProducerAssignment({ slug, issueId, children }: {
  slug: string; issueId: string; children: ReactNode;
}) {
  const access = useIzclickAccess(slug);
  const board = useSWR(access.enabled ? ["izclick-task-board", slug] : null, () => coordinationService.tasks(slug));
  const task = board.data?.tasks.find(item => item.id === issueId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  if (!access.enabled) return <>{children}</>;
  if (board.error) return <p role="alert">No se pudo consultar la asignación. <button type="button" onClick={() => void board.mutate()}>Reintentar</button></p>;
  if (!board.data) return <span>Cargando asignación…</span>;
  if (!task) return <>{children}</>;
  if (access.role !== "coordinator" && access.role !== "superadmin") return <span>{task.producer_id ? "Productor asignado" : "Pendiente de coordinación"}</span>;
  async function assign(id: string) {
    if (!task || !id || saving || id === task.producer_id) return;
    setSaving(true); setError("");
    try { await coordinationService.assignTask(slug, task, id); }
    catch { setError("No se pudo asignar. Revisa la asignación actualizada e inténtalo otra vez."); }
    finally { await board.mutate(); setSaving(false); }
  }
  return <div><CoordinatorProducerSelect slug={slug} value={task.producer_id ?? ""}
    disabled={saving || task.closed} onChange={id => void assign(id)} />
    {error && <p role="alert">{error}</p>}</div>;
}
