// Real app + authenticated API + S3 emulator. Only the disposable izclick-qa fixture.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = "http://127.0.0.1:38080";
const fixture = JSON.parse(fs.readFileSync("qa/.qa-fixture.json", "utf8"));
assert.equal(fixture.workspace, "izclick-qa");
const output = "qa/artifacts";
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
const errors = [];
let page;
const route = `${base}/${fixture.workspace}/projects/${fixture.project_id}/issues`;
async function contextFor(session) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 950 }, acceptDownloads: true });
  await context.addCookies([{ name: "session-id", value: session, url: base, httpOnly: true, secure: false, sameSite: "Lax" }]);
  return context;
}
async function step(name, action) {
  try { await action(); results.push({ name, passed: true }); }
  catch (error) { results.push({ name, passed: false, error: String(error) }); throw error; }
}
async function row() {
  const item = page.locator(`[data-izclick-issue-id="${fixture.issue_id}"]`).first();
  await item.waitFor({ state: "visible", timeout: 45000 });
  return item;
}
async function saveDate(value) {
  const item = await row();
  await item.locator('button[title="Editar fecha del evento en esta celda"]').click();
  const editor = item.locator('[data-izclick-popover]').filter({ has: page.getByLabel("Fecha del evento", { exact: true }) });
  await editor.getByLabel("Fecha del evento", { exact: true }).fill(value);
  await editor.getByRole("button", { name: "Guardar", exact: true }).click();
  await editor.waitFor({ state: "hidden", timeout: 15000 });
  await page.reload({ waitUntil: "domcontentloaded" });
  const reloaded = await row();
  await reloaded.locator('button[title="Editar fecha del evento en esta celda"]').filter({ hasText: value || "—" }).waitFor();
}
try {
  const adminContext = await contextFor(fixture.admin_session);
  page = await adminContext.newPage();
  page.on("pageerror", error => errors.push(String(error)));
  await page.goto(route, { waitUntil: "domcontentloaded", timeout: 45000 });
  await row();
  for (const width of [1366, 1920]) {
    await page.setViewportSize({ width, height: 950 });
    await step(`List and attachment column at ${width}px`, async () => {
      const item = await row();
      const cell = item.locator('[data-izclick-cell="attachments"]');
      await cell.scrollIntoViewIfNeeded();
      const header = page.locator('[data-izclick-header="attachments"]').first();
      const a = await cell.boundingBox(); const b = await header.boundingBox();
      assert.ok(a && b);
      assert.ok(Math.abs(a.x - b.x) <= 1.5 && Math.abs(a.width - b.width) <= 1.5, "Attachment header/cell misaligned");
      await page.screenshot({ path: path.join(output, `sprint1-list-${width}.png`), fullPage: true });
    });
  }
  await step("Create, edit, remove and persist event date through the real UI", async () => {
    await saveDate("2026-11-01");
    await saveDate("2026-11-02");
    await saveDate("");
    await saveDate("2026-11-03");
  });
  await step("Subtasks appear once and only under expanded parents", async () => {
    assert.equal(await page.getByText("Subtarea Sprint 1 QA", { exact: true }).count(), 0);
    const item = await row();
    await item.getByRole("button", { name: /^Ver subtareas de/ }).click();
    await page.getByText("Subtarea Sprint 1 QA", { exact: true }).waitFor();
    assert.equal(await page.getByText("Subtarea Sprint 1 QA", { exact: true }).count(), 1);
    await page.getByRole("button", { name: "Ver subtareas de Subtarea Sprint 1 QA", exact: true }).click();
    await page.getByText("Subtarea anidada Sprint 1 QA", { exact: true }).waitFor();
    assert.equal(await page.getByText("Subtarea anidada Sprint 1 QA", { exact: true }).count(), 1);
    await page.screenshot({ path: path.join(output, "sprint1-nested-subtasks.png"), fullPage: true });
  });
  await step("Real image preview and real authenticated file download", async () => {
    const item = await row();
    await item.getByRole("button", { name: /^Ver adjuntos de/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByText("Montaje-QA.png", { exact: true }).waitFor();
    const imageItem = dialog.getByRole("listitem").filter({ hasText: "Montaje-QA.png" });
    await imageItem.getByRole("button", { name: "Vista previa", exact: true }).click();
    const image = dialog.getByRole("img", { name: "Montaje-QA.png", exact: true });
    await image.waitFor();
    await page.waitForFunction(() => { const image = document.querySelector('img[alt="Montaje-QA.png"]'); return image?.complete && image.naturalWidth > 0; });
    const textItem = dialog.getByRole("listitem").filter({ hasText: "Reporte-QA.txt" });
    const [download] = await Promise.all([
      page.waitForEvent("download"), textItem.getByRole("link", { name: "Descargar", exact: true }).click(),
    ]);
    assert.equal(download.suggestedFilename(), "Reporte-QA.txt");
    const filename = await download.path();
    assert.equal(fs.readFileSync(filename, "utf8"), "IZCLICK Sprint 1: descarga verificada.\n");
    await page.screenshot({ path: path.join(output, "sprint1-attachment-preview.png"), fullPage: true });
    await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();
  });
  await adminContext.close();
  await step("Reader can consult attachments and cannot edit event date", async () => {
    const context = await contextFor(fixture.guest_session);
    page = await context.newPage();
    await page.goto(route, { waitUntil: "domcontentloaded" });
    const item = await row();
    assert.equal(await item.locator('button[title="Sin permiso de edición"]').first().isDisabled(), true);
    await item.getByRole("button", { name: /^Ver adjuntos de/ }).click();
    await page.getByRole("dialog").getByText("Reporte-QA.txt", { exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, "sprint1-reader-attachments.png"), fullPage: true });
    await context.close();
  });
  await step("Anonymous client cannot list or download private attachments", async () => {
    const context = await browser.newContext();
    const assets = `${base}/api/assets/v2/workspaces/${fixture.workspace}/projects/${fixture.project_id}/issues/${fixture.issue_id}/attachments/`;
    const response = await context.request.get(assets);
    assert.ok([401, 403].includes(response.status()));
    await context.close();
  });
  assert.deepEqual(errors, []);
} catch (error) {
  console.error(String(error)); process.exitCode = 1;
  if (page && !page.isClosed()) await page.screenshot({ path: path.join(output, "sprint1-failure.png"), fullPage: true }).catch(() => {});
} finally {
  fs.writeFileSync(path.join(output, "sprint1-results.json"), JSON.stringify({ syntheticOnly: true, results, errors }, null, 2));
  await browser.close();
}
