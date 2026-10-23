import type { ProductionWorkItem } from "./production-metrics.ts";
export function groupLoadsByProducer(issues: readonly ProductionWorkItem[], members: readonly { id: string; name: string }[]) {
  const names = new Map(members.map(member => [member.id, member.name]));
  const groups = new Map<string, ProductionWorkItem[]>();
  const seen = new Set<string>();
  for (const issue of issues) {
    if (issue.parent_id || seen.has(issue.id)) continue;
    seen.add(issue.id);
    const assignees = [...new Set(issue.assignee_ids ?? [])];
    for (const id of assignees.length ? assignees : ["__unassigned__"]) {
      const group = groups.get(id) ?? [];
      group.push(issue); groups.set(id, group);
    }
  }
  return [...groups].map(([key, issues]) => ({ key, issues, color: "#3b82f6", name: key === "__unassigned__" ? "Sin productor" : names.get(key) ?? "Miembro no disponible" }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}
