// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import ProjectWorkloadPanel from "../core/components/izclick/project-workload-panel";
import { projectWorkloadHref } from "../core/components/izclick/project-workload";
const state = vi.hoisted(() => ({ failed: false, loading: false, mutate: vi.fn(), rows: [] as any[] }));
vi.mock("react-router", () => ({ useParams: () => ({ workspaceSlug: "izango" }),
  useSearchParams: () => [new URLSearchParams("workload_project=cotizaciones")],
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}));
vi.mock("@/services/izclick-coordination.service", () => ({ coordinationService: { taskWorkload: vi.fn() } }));
vi.mock("swr", () => ({ default: () => ({ data: state.loading ? undefined : state.rows,
  error: state.failed ? new Error("denied") : undefined, mutate: state.mutate }) }));
let node: HTMLDivElement; let root: Root;
const task = (id: string, extra = {}) => ({ id, project_id: "cotizaciones", name: "Activación " + id,
  identifier: "COT-" + id, project_name: "COTIZACIONES IZANGO", clients: ["Cliente Acme"],
  closed: false, state: "Por cotizar", start_date: "2026-11-01", due_date: "2026-11-20", url: "/izango/browse/COT-" + id, ...extra });
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-27T18:00:00Z"));
  state.failed = false; state.loading = false; state.mutate.mockReset();
  state.rows = [
    { producer_id: "ana", producer_name: "Ana", active_count: 999, overdue_count: 999, due_soon_count: 999,
      tasks: [task("1"), task("2", { due_date: "2026-12-01" }), task("3", { project_id: "other" }), task("4", { closed: true })] },
    { producer_id: "pedro", producer_name: "Pedro", active_count: 1, tasks: [task("5", { clients: ["Honda"], due_date: null })] },
    { producer_id: "zero", producer_name: "Sin asignaciones", active_count: 0, tasks: [] },
  ];
  node = document.createElement("div"); document.body.appendChild(node); root = createRoot(node);
});
afterEach(async () => { await act(async () => root.unmount()); node.remove(); vi.useRealTimers(); });
async function render() { await act(async () => root.render(<ProjectWorkloadPanel />)); }
describe("Project producer workload", () => {
  it("counts all active assignments for this project and shows task detail links", async () => {
    await render(); expect(node.textContent).toContain("3 cargas activas asignadas");
    expect(node.textContent).toContain("2 cargas activas");
    expect(node.textContent).toContain("1 vencidas · 1 vencen en 7 días");
    expect(node.textContent).not.toContain("999"); expect(node.textContent).not.toContain("Activación 3");
    expect(node.textContent).not.toContain("Activación 4"); expect(node.textContent).toContain("Cliente Acme");
    expect(node.textContent).toContain("Por cotizar"); expect(node.textContent).toContain("20/11/2026");
    expect(node.querySelector('a[href="/izango/browse/COT-1"]')).not.toBeNull();
  });
  it("opens a producer's assignments from its summary and can return to all", async () => {
    await render();
    const button = Array.from(node.querySelectorAll("button")).find(item => item.textContent?.includes("Pedro"))!;
    await act(async () => button.click()); expect(node.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(node.textContent).not.toContain("Activación 1");
    await act(async () => button.click()); expect(node.querySelectorAll("tbody tr")).toHaveLength(3);
  });
  it("keeps zero-load producers visible", async () => {
    await render(); expect(node.textContent).toContain("Sin asignaciones");
    expect(node.textContent).toContain("Sin cargas activas en este proyecto.");
  });
  it("shows a recoverable failure rather than fabricated zero counts", async () => {
    state.failed = true; await render(); expect(node.querySelector('[role="alert"]')).not.toBeNull();
    expect(node.textContent).not.toContain("cargas activas asignadas");
    await act(async () => Array.from(node.querySelectorAll("button")).find(item => item.textContent === "Actualizar")!.click());
    expect(state.mutate).toHaveBeenCalledOnce();
  });
  it("distinguishes loading and an empty roster", async () => {
    state.loading = true; await render(); expect(node.querySelector('[role="status"]')).not.toBeNull();
    state.loading = false; state.rows = []; await render(); expect(node.textContent).toContain("No hay productores activos");
  });
  it("uses the same project-scoped destination for navigation entry points", () => {
    expect(projectWorkloadHref("izango", "cotizaciones")).toBe("/izango/coordination?workload_project=cotizaciones");
  });
});
