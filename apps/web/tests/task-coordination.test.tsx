import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import TaskCoordinationPanel from "../core/components/izclick/task-coordination-panel";
import { CommercialIntakeReview } from "../core/components/issues/issue-modal/commercial-intake-review";

const state = vi.hoisted(() => ({ role: "commercial", failed: false }));
vi.mock("react-router", () => ({
  useParams: () => ({ workspaceSlug: "izango" }),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}));
vi.mock("@/services/izclick-coordination.service", () => ({ coordinationService: {} }));
vi.mock("swr", () => ({
  default: (key: string[]) => ({
    data:
      key[0] === "izclick-task-board"
        ? {
            role: state.role,
            tasks: [
              {
                id: "task",
                name: "Activación",
                identifier: "COT-1",
                project_name: "Cotizaciones",
                clients: ["Acme"],
                due_date: "2026-12-01",
                commercial_id: "commercial",
                producer_id: null,
                status: "pending",
                state: "Recibida",
                closed: false,
                history: [],
                url: "/izango/browse/COT-1",
              },
            ],
          }
        : key[0] === "izclick-task-members"
          ? [
              { user_id: "commercial", name: "Comercial", role: "commercial" },
              { user_id: "producer", name: "Productora", role: "producer" },
            ]
          : [
              {
                producer_id: "producer",
                producer_name: "Productora",
                active_count: 3,
                overdue_count: 1,
                due_soon_count: 2,
                tasks: [],
              },
            ],
    error: state.failed ? new Error("denied") : undefined,
    mutate: vi.fn(),
  }),
}));

describe("Native task coordination", () => {
  it("shows the commercial review with both coordinators and a send action", () => {
    const html = renderToStaticMarkup(
      <CommercialIntakeReview
        name="Activación"
        project="Cotizaciones"
        client="Acme"
        coordinators={["María Paula", "Angelica"]}
        sending={false}
        onBack={vi.fn()}
        onSend={vi.fn()}
      />
    );
    expect(html).toContain("María Paula y Angelica");
    expect(html).toContain("Enviar a coordinación");
    expect(html).toContain("Volver a editar");
    expect(html).not.toContain("<select");
  });
  it("disables review actions while sending and exposes delivery errors", () => {
    const html = renderToStaticMarkup(
      <CommercialIntakeReview
        name="Activación"
        project="Cotizaciones"
        client=""
        coordinators={[]}
        sending
        error="No se pudo enviar"
        onBack={vi.fn()}
        onSend={vi.fn()}
      />
    );
    expect(html.match(/disabled=""/g)).toHaveLength(2);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Sin cliente");
  });
  it.each(["commercial", "producer"])("keeps assignment controls hidden for %s", (role) => {
    state.role = role;
    state.failed = false;
    const html = renderToStaticMarkup(<TaskCoordinationPanel />);
    expect(html).toContain("Activación");
    expect(html).toContain("3 activas");
    expect(html).not.toContain("Seleccionar productor");
  });
  it.each(["coordinator", "superadmin"])("enables assignment for %s", (role) => {
    state.role = role;
    state.failed = false;
    const html = renderToStaticMarkup(<TaskCoordinationPanel />);
    expect(html).toContain("Seleccionar productor");
    expect(html).toContain("Asignar productor");
    expect(html).toContain("Acme");
  });
  it("shows a retry instead of a misleading empty queue when access fails", () => {
    state.failed = true;
    const html = renderToStaticMarkup(<TaskCoordinationPanel />);
    expect(html).toContain("Reintentar");
    expect(html).not.toContain("No hay cargas en esta vista");
  });
});
