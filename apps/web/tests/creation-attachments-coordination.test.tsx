// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CreationAttachments, useCreationAttachments } from "../core/components/issues/issue-modal/creation-attachments";
import { CommercialIntakeReview } from "../core/components/issues/issue-modal/commercial-intake-review";
const state = vi.hoisted(() => ({ upload: vi.fn() }));
vi.mock("@plane/types", () => ({ EFileAssetType: { ISSUE_ATTACHMENT: "ISSUE_ATTACHMENT" } }));
vi.mock("@/services/file.service", () => ({ FileService: class { uploadProjectAsset = state.upload; } }));
let attachments: ReturnType<typeof useCreationAttachments>;
let node: HTMLDivElement;
let root: Root;
function Harness({ project = "project" }: { project?: string }) {
  attachments = useCreationAttachments("izango", project);
  return <CreationAttachments attachments={attachments} disabled={false} />;
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); state.upload.mockReset();
  node = document.createElement("div"); document.body.appendChild(node); root = createRoot(node);
});
afterEach(async () => { await act(async () => root.unmount()); node.remove(); });
async function render(project = "project") { await act(async () => root.render(<Harness project={project} />)); }
const pdf = () => new File(["brief"], "brief.pdf", { type: "application/pdf" });
describe("Attachments during issue creation", () => {
  it("supports multiple files and exposes only completed native attachment assets", async () => {
    state.upload.mockResolvedValueOnce({ asset_id: "pdf" }).mockResolvedValueOnce({ asset_id: "xlsx" });
    await render(); await act(async () => attachments.add([pdf(), new File(["sheet"], "costos.xlsx")]));
    expect(node.querySelector('input[type="file"]')?.hasAttribute("multiple")).toBe(true);
    expect(state.upload).toHaveBeenCalledWith("izango", "project", {
      entity_type: "ISSUE_ATTACHMENT", entity_identifier: "",
    }, expect.any(File));
    expect(attachments.assetIds).toEqual(["pdf", "xlsx"]); expect(attachments.blocked).toBe(false);
    expect(node.textContent).toContain("brief.pdf"); expect(node.textContent).toContain("costos.xlsx");
  });
  it("blocks uploading and ignores completion of a removed file", async () => {
    let finish!: (value: unknown) => void;
    state.upload.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    await render(); await act(async () => attachments.add([pdf()]));
    expect(attachments.blocked).toBe(true); expect(attachments.assetIds).toEqual([]);
    await act(async () => node.querySelector<HTMLButtonElement>('[aria-label="Quitar brief.pdf"]')!.click());
    await act(async () => finish({ asset_id: "removed" }));
    expect(attachments.assetIds).toEqual([]); expect(node.textContent).not.toContain("brief.pdf");
  });
  it("retains failures for retry without exposing a partial payload", async () => {
    state.upload.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ asset_id: "retry" });
    await render(); await act(async () => attachments.add([pdf()]));
    expect(attachments.blocked).toBe(true); expect(node.querySelector('[role="alert"]')).not.toBeNull();
    await act(async () => Array.from(node.querySelectorAll("button")).find(button => button.textContent === "Reintentar")!.click());
    expect(attachments.assetIds).toEqual(["retry"]); expect(attachments.blocked).toBe(false);
  });
  it("isolates project changes and ignores late results after clearing", async () => {
    let finish!: (value: unknown) => void;
    state.upload.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    await render(); await act(async () => attachments.add([pdf()])); await render("another");
    await act(async () => finish({ asset_id: "old" })); expect(attachments.assetIds).toEqual([]);
    await act(async () => attachments.add([pdf()])); await act(async () => attachments.clear());
    await act(async () => finish({ asset_id: "late" })); expect(attachments.entries).toEqual([]);
  });
  it("shows files in review and allows returning to edit", async () => {
    const back = vi.fn();
    await act(async () => root.render(<CommercialIntakeReview name="Evento" project="Cotizaciones"
      client="Cliente" coordinators={["Angélica"]} attachments={["brief.pdf", "costos.xlsx"]}
      sending={false} onBack={back} onSend={vi.fn()} />));
    expect(node.textContent).toContain("brief.pdf"); expect(node.textContent).toContain("costos.xlsx");
    await act(async () => Array.from(node.querySelectorAll("button")).find(button => button.textContent === "Volver a editar")!.click());
    expect(back).toHaveBeenCalledOnce();
  });
});
