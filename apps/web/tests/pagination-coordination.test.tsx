import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SpreadsheetPageNavigation } from "../core/components/issues/issue-layouts/spreadsheet/page-navigation";
import { IssueFilterHelperStore } from "../core/store/issue/helpers/issue-filter-helper.store";

describe("Project table numbered pages", () => {
  it("requests the newest root tasks from the server at 50 per page, preserving filters", () => {
    const store = new IssueFilterHelperStore();
    const result = store.getPaginationParams(
      { state: "state-id", order_by: "sequence_id", group_by: "state" },
      { canGroup: false, perPageCount: 50, page: 3 },
      undefined
    );
    expect(result).toMatchObject({
      state: "state-id",
      order_by: "-created_at",
      cursor: "50:2:0",
      per_page: "50",
      sub_issue: "false",
    });
    expect(result.group_by).toBeUndefined();
  });
  it("preserves existing cursor behavior for other layouts", () => {
    const result = new IssueFilterHelperStore().getPaginationParams(
      { order_by: "priority" },
      { canGroup: false, perPageCount: 100 },
      "100:4:0"
    );
    expect(result.cursor).toBe("100:4:0");
    expect(result.order_by).toBe("priority");
  });
  it("shows numbered pages and the 50-item range", () => {
    const html = renderToStaticMarkup(
      <SpreadsheetPageNavigation page={2} pageSize={50} total={150} loading={false} onPageChange={() => {}} />
    );
    expect(html).toContain("51");
    expect(html).toContain("100");
    expect(html).toContain('aria-label="Página 3"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("Más recientes primero");
  });
  it("disables advancing past the last partial page", () => {
    const html = renderToStaticMarkup(
      <SpreadsheetPageNavigation page={4} pageSize={50} total={151} loading={false} onPageChange={() => {}} />
    );
    expect(html).toMatch(/disabled=""[^>]*>Siguiente/);
    expect(html).toContain("151");
  });
  it("keeps navigation bounded for large lists", () => {
    const html = renderToStaticMarkup(
      <SpreadsheetPageNavigation page={500} pageSize={50} total={100000} loading={false} onPageChange={() => {}} />
    );
    expect(html.match(/aria-label="Página /g)).toHaveLength(7);
  });
});
