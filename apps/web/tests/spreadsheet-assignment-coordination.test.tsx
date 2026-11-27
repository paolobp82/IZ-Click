// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { TIssue } from "@plane/types";
import { SpreadsheetAssigneeColumn } from "../core/components/issues/issue-layouts/spreadsheet/columns/assignee-column";

const state = vi.hoisted(() => ({ role: "coordinator", managed: true, failed: false,
  assign: vi.fn(), mutate: vi.fn(), native: vi.fn(),
  task: { id: "task", version: 4, producer_id: "old", closed: false },
}));
vi.mock("react-router", () => ({ useParams: () => ({ workspaceSlug: "izango" }) }));
vi.mock("mobx-react", () => ({ observer: (component: unknown) => component }));
vi.mock("@/hooks/use-izclick-access", () => ({ useIzclickAccess: () => ({ enabled: true, role: state.role }) }));
vi.mock("@/services/izclick-coordination.service", () => ({ coordinationService: { assignTask: state.assign } }));
vi.mock("@/components/dropdowns/member/dropdown", () => ({ MemberDropdown: ({ onChange }: { onChange: (ids: string[]) => void }) =>
  <button onClick={() => onChange(["producer"])}>Selector anterior</button> }));
vi.mock("swr", () => ({ default: (key: string[]) => ({
  data: key[0] === "izclick-task-board" ? { tasks: state.managed ? [state.task] : [] } : [
    { user_id: "producer", name: "Productor disponible", role: "producer" },
    { user_id: "coordinator", name: "Coordinadora excluida", role: "coordinator" },
  ], error: state.failed ? new Error("denied") : undefined, mutate: state.mutate,
}) }));
let node: HTMLDivElement;
let root: Root;
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  state.role = "coordinator"; state.managed = true; state.failed = false;
  state.task.closed = false; state.assign.mockReset().mockResolvedValue({});
  state.native.mockReset(); state.mutate.mockReset().mockResolvedValue(undefined);
  node = document.createElement("div"); document.body.appendChild(node); root = createRoot(node);
});
afterEach(async () => { await act(async () => root.unmount()); node.remove(); });
async function render() {
  await act(async () => root.render(<SpreadsheetAssigneeColumn issue={{ id: "task", project_id: "project" } as TIssue}
    onChange={state.native} onClose={vi.fn()} disabled={false} />));
}
async function assign() {
  await act(async () => {
    const select = node.querySelector("select")!;
    select.value = "producer"; select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
describe("Spreadsheet managed assignment", () => {
  it("uses coordination with the observed version and never sends native PATCH", async () => {
    await render(); await assign();
    expect(state.assign).toHaveBeenCalledWith("izango", state.task, "producer");
    expect(state.task.version).toBe(4); expect(state.task.producer_id).toBe("old");
    expect(state.native).not.toHaveBeenCalled(); expect(state.mutate).toHaveBeenCalled();
    expect(node.textContent).not.toContain("Coordinadora excluida");
  });
  it.each(["commercial", "producer"])("does not expose assignment to %s", async role => {
    state.role = role; await render(); expect(node.querySelector("select")).toBeNull();
    expect(node.textContent).not.toContain("Selector anterior");
  });
  it("keeps historical tasks on their existing assignment path", async () => {
    state.managed = false; await render();
    await act(async () => node.querySelector("button")!.click());
    expect(state.native).toHaveBeenCalled(); expect(state.assign).not.toHaveBeenCalled();
  });
  it("refreshes and shows an error on an assignment conflict without native retry", async () => {
    state.assign.mockRejectedValue(new Error("conflict")); await render(); await assign();
    expect(node.querySelector('[role="alert"]')?.textContent).toContain("No se pudo asignar");
    expect(state.mutate).toHaveBeenCalled(); expect(state.native).not.toHaveBeenCalled();
  });
  it("disables assignment for a closed managed load", async () => {
    state.task.closed = true; await render(); expect(node.querySelector("select")!.disabled).toBe(true);
  });
  it("does not fall back to native PATCH when loading coordination fails", async () => {
    state.failed = true; await render(); expect(node.querySelector('[role="alert"]')).not.toBeNull();
    expect(node.textContent).not.toContain("Selector anterior");
  });
});
