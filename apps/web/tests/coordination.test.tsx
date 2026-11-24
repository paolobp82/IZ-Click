/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import CoordinationPage from "../core/components/izclick/project-coordination-panel";

const state = vi.hoisted(() => ({ role: "producer", user: "producer", selected: "project", failed: false }));
vi.mock("react-router", () => ({
  useParams: () => ({ workspaceSlug: "agency" }),
  useSearchParams: () => [new URLSearchParams({ project: state.selected }), vi.fn()],
}));
vi.mock("@/services/izclick-coordination.service", () => ({ coordinationService: {} }));
vi.mock("swr", () => ({
  default: (key: string[]) => {
    const project = {
      project_id: "project",
      project_name: "Campaña",
      project_identifier: "CAMP",
      producer_id: "producer",
      commercial_id: "commercial",
      status: "assigned",
      workflow_status: "active",
      version: 1,
      client: "Acme",
      quotation_url: "https://example.test/quote",
      due_date: "2026-11-30",
    };
    let data: unknown;
    if (key[0] === "izclick-board") data = { role: state.role, current_user_id: state.user, projects: [project] };
    if (key[0] === "izclick-workload")
      data = [
        {
          producer_id: "producer",
          producer_name: "Productora",
          active_count: 1,
          overdue_count: 0,
          due_soon_count: 1,
          projects: [project],
        },
      ];
    if (key[0] === "izclick-roles")
      data = [{ user_id: "producer", name: "Productora", role: "producer", email: "p@example.test" }];
    if (key[0] === "izclick-conversation") data = { comments: [], assignments: [] };
    return { data, error: state.failed ? new Error("denied") : undefined, mutate: vi.fn() };
  },
}));

describe("Coordination visibility", () => {
  it("lets coordinators create, assign and inspect workloads", () => {
    state.role = "coordinator";
    state.user = "coordinator";
    state.failed = false;
    const html = renderToStaticMarkup(<CoordinationPage />);
    expect(html).toContain("Crear proyecto");
    expect(html).toContain("Reasignar");
    expect(html).toContain("Productora");
    expect(html).toContain("Acme");
  });
  it("lets commercial users create but keeps assignment and edits hidden", () => {
    state.role = "commercial";
    state.user = "commercial";
    const html = renderToStaticMarkup(<CoordinationPage />);
    expect(html).toContain("Crear proyecto");
    expect(html).not.toContain("Reasignar");
    expect(html).not.toContain("Guardar cambios");
  });
  it("lets assigned producers manage work without assignment or role controls", () => {
    state.role = "producer";
    state.user = "producer";
    const html = renderToStaticMarkup(<CoordinationPage />);
    expect(html).toContain("Guardar cambios");
    expect(html).toContain("Comentar");
    expect(html).not.toContain("Crear proyecto");
    expect(html).not.toContain("Reasignar");
    expect(html).not.toContain("Roles comerciales");
  });
  it("shows other producers the project and workload as read only", () => {
    state.role = "producer";
    state.user = "another-producer";
    const html = renderToStaticMarkup(<CoordinationPage />);
    expect(html).toContain("Campaña");
    expect(html).toContain("Carga de productores");
    expect(html).not.toContain("Guardar cambios");
    expect(html).not.toContain("Comentar</button>");
  });
  it("reserves business role administration for superadmins", () => {
    state.role = "superadmin";
    state.user = "admin";
    expect(renderToStaticMarkup(<CoordinationPage />)).toContain("Roles comerciales");
  });
  it("shows a useful error when unavailable", () => {
    state.failed = true;
    expect(renderToStaticMarkup(<CoordinationPage />)).toContain("La coordinación no está disponible");
    state.failed = false;
  });
});
