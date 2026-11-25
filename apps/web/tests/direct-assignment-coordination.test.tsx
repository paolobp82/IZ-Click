import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CoordinatorProducerSelect, ManagedProducerAssignment } from "../core/components/issues/coordinator-producer-select";
const state = vi.hoisted(() => ({ role: "coordinator", failed: false }));
vi.mock("@/hooks/use-izclick-access", () => ({ useIzclickAccess: () => ({ enabled: true, role: state.role }) }));
vi.mock("@/services/izclick-coordination.service", () => ({ coordinationService: {} }));
vi.mock("swr", () => ({ default: (key: string[]) => ({
  data: key[0] === "izclick-task-board" ? { tasks: [{ id: "task", producer_id: null, closed: false }] } : [
    { user_id: "producer", name: "Productora disponible", role: "producer" },
    { user_id: "commercial", name: "Comercial excluido", role: "commercial" },
  ], error: state.failed ? new Error("failed") : undefined, mutate: vi.fn(),
}) }));
describe("Direct coordinator assignment", () => {
  it("offers workspace producers without requiring project membership", () => {
    const html = renderToStaticMarkup(<CoordinatorProducerSelect slug="izango" value="" onChange={vi.fn()} />);
    expect(html).toContain("Productora disponible");
    expect(html).not.toContain("Comercial excluido");
  });
  it.each(["commercial", "producer"])("denies native assignment controls for %s", role => {
    state.role = role; state.failed = false;
    const html = renderToStaticMarkup(<ManagedProducerAssignment slug="izango" issueId="task">legacy</ManagedProducerAssignment>);
    expect(html).toContain("Pendiente de coordinación"); expect(html).not.toContain("<select");
  });
  it("lets coordination assign in the native detail", () => {
    state.role = "coordinator"; state.failed = false;
    const html = renderToStaticMarkup(<ManagedProducerAssignment slug="izango" issueId="task">legacy</ManagedProducerAssignment>);
    expect(html).toContain("Productora disponible"); expect(html).not.toContain("legacy");
  });
  it("shows a recoverable error instead of an empty selector", () => {
    state.failed = true;
    const html = renderToStaticMarkup(<ManagedProducerAssignment slug="izango" issueId="task">legacy</ManagedProducerAssignment>);
    expect(html).toContain("Reintentar"); expect(html).not.toContain("legacy");
  });
});
