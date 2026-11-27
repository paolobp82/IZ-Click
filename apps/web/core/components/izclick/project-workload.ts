import type { TaskWorkload } from "@/services/izclick-coordination.service";

export function projectWorkloadHref(slug: string, projectId: string) {
  return `/${encodeURIComponent(slug)}/coordination?workload_project=${encodeURIComponent(projectId)}`;
}

export function projectWorkload(rows: TaskWorkload[], projectId: string, today: string) {
  const weekEnd = new Date(`${today}T00:00:00Z`);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
  const soon = weekEnd.toISOString().slice(0, 10);
  return rows.map(row => {
    const tasks = [...new Map(row.tasks.filter(task => task.project_id === projectId && !task.closed)
      .map(task => [task.id, task])).values()];
    return { ...row, tasks, active_count: tasks.length,
      overdue_count: tasks.filter(task => task.due_date && task.due_date < today).length,
      due_soon_count: tasks.filter(task => task.due_date && task.due_date >= today && task.due_date <= soon).length };
  }).sort((a, b) => b.active_count - a.active_count || a.producer_name.localeCompare(b.producer_name, "es"));
}
