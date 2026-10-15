// Isolated, synthetic browser QA only. Never connects to izclick.izango.com.pe.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = "http://127.0.0.1:38080";
const fixture = JSON.parse(fs.readFileSync("qa/.qa-fixture.json", "utf8"));
const output = "qa/artifacts";
fs.mkdirSync(output, { recursive: true });
const projectUrl = `${base}/${fixture.workspace}/projects/${fixture.project_id}/issues`;
const browser = await chromium.launch({ headless: true });
const results = [];
const runtimeErrors = [];
const failedApiResponses = [];
let lastBrowserUrl = null;
let lastBrowserTitle = null;

function addSession(context, session) {
  return context.addCookies([{
    name: "session-id", value: session, url: base, httpOnly: true,
    secure: false, sameSite: "Lax",
  }]);
}
async function recordScreenshot(page, filename) {
  try { await page.screenshot({ path: path.join(output, filename), fullPage: true, animations: "disabled" }); }
  catch (error) { results.push({ step: "screenshot", error: String(error) }); }
}
async function visibleGrid(page) {
  await page.locator('[aria-label="Columnas de cargas"]').first().waitFor({ state: "visible", timeout: 45000 });
  const issue = page.locator(`[data-izclick-issue-id="${fixture.issue_id}"]`).first();
  await issue.waitFor({ state: "visible", timeout: 30000 });
  return issue;
}
async function measureColumns(page, issue) {
  const columns = ["state", "priority", "assignee", "due"];
  for (const id of columns) {
    const header = page.locator(`[aria-label="Columnas de cargas"] [data-izclick-header="${id}"]`).first();
    const cell = issue.locator(`[data-izclick-cell="${id}"]`).first();
    const h = await header.boundingBox();
    const c = await cell.boundingBox();
    assert.ok(h && c, `${id}: encabezado o celda no visible`);
    assert.ok(Math.abs(h.x - c.x) <= 1.5, `${id}: X desalineado, encabezado ${h.x}, celda ${c.x}`);
    assert.ok(Math.abs(h.width - c.width) <= 1.5, `${id}: ancho desalineado, encabezado ${h.width}, celda ${c.width}`);
  }
  const customHeader = page.locator(`[data-izclick-custom-header="${fixture.field_id}"]`).first();
  const customCell = issue.locator(`[data-izclick-custom-cell="${fixture.field_id}"]`).first();
  const h = await customHeader.boundingBox();
  const c = await customCell.boundingBox();
  assert.ok(h && c, "columna personalizada no visible");
  assert.ok(Math.abs(h.x - c.x) <= 1.5, "columna personalizada: X desalineado");
  assert.ok(Math.abs(h.width - c.width) <= 1.5, "columna personalizada: ancho desalineado");
}
async function perform(name, action) {
  try {
    await action();
    results.push({ step: name, status: "passed" });
  } catch (error) {
    results.push({ step: name, status: "failed", message: String(error) });
    throw error;
  }
}

try {
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await addSession(context, fixture.admin_session);
  const page = await context.newPage();
  page.on("pageerror", error => runtimeErrors.push(error.message));
  page.on("response", response => {
    if (response.url().startsWith(`${base}/api/`) && response.status() >= 400) {
      failedApiResponses.push({ status: response.status(), path: new URL(response.url()).pathname });
    }
  });
  page.on("console", message => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });
  await page.goto(projectUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
  lastBrowserUrl = page.url();
  lastBrowserTitle = await page.title();
  await recordScreenshot(page, "initial-navigation.png");
  let issue;
  try {
    await perform("session authenticated and synthetic issue visible", async () => {
      issue = await visibleGrid(page);
      await issue.getByText("Carga QA montaje con nombre excepcionalmente largo", { exact: false }).waitFor();
      assert.equal(await issue.locator('[aria-label="Administrar estados del proyecto"]').count(), 0,
        "state manager still repeated inside issue rows");
      assert.ok(await page.getByRole("button", { name: "Administrar estados del proyecto" }).count() > 0,
        "project state manager missing from List header");
    });
    for (const width of [1366, 1920]) {
      await page.setViewportSize({ width, height: 950 });
      await perform(`List cell/header alignment at ${width}px`, () => measureColumns(page, issue));
      await recordScreenshot(page, `list-${width}.png`);
    }

    await perform("custom text value saved and persisted across reload", async () => {
      const cell = issue.locator(`[data-izclick-custom-cell="${fixture.field_id}"]`);
      await cell.getByRole("button").click();
      const editor = page.getByRole("dialog", { name: "Editar Material QA" });
      await editor.waitFor({ state: "visible" });
      await editor.getByRole("textbox", { name: "Material QA" }).fill("Madera QA guardada");
      await editor.getByRole("button", { name: "Guardar" }).click();
      await editor.waitFor({ state: "hidden" });
      await page.reload({ waitUntil: "domcontentloaded" });
      issue = await visibleGrid(page);
      await issue.getByText("Madera QA guardada").waitFor({ state: "visible" });
    });

    await perform("column visibility synchronized after reload", async () => {
      await page.getByRole("button", { name: "Agregar o quitar columnas" }).first().click();
      const menu = page.locator('[data-izclick-popover]').filter({ hasText: "Columnas existentes" }).first();
      await menu.getByRole("checkbox", { name: "Prioridad" }).uncheck();
      assert.equal(await issue.locator('[data-izclick-cell="priority"]').isVisible(), false);
      await page.reload({ waitUntil: "domcontentloaded" });
      issue = await visibleGrid(page);
      assert.equal(await issue.locator('[data-izclick-cell="priority"]').isVisible(), false);
    });
    await recordScreenshot(page, "list-hidden-column.png");
  } finally {
    await recordScreenshot(page, "editor-qa-final.png");
  }
  await context.close();

  const guestContext = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await addSession(guestContext, fixture.guest_session);
  const guest = await guestContext.newPage();
  await guest.goto(projectUrl, { waitUntil: "domcontentloaded" });
  try {
    await perform("guest role is read-only", async () => {
      const guestIssue = await visibleGrid(guest);
      const edit = guestIssue.locator(`[data-izclick-custom-cell="${fixture.field_id}"] button`).first();
      assert.equal(await edit.isDisabled(), true, "guest can edit custom values");
    });
  } finally {
    await recordScreenshot(guest, "guest-read-only.png");
    await guestContext.close();
  }
} catch (error) {
  console.error("IZ-Click isolated visual QA failed:", String(error));
  process.exitCode = 1;
} finally {
  fs.writeFileSync(path.join(output, "qa-results.json"), JSON.stringify({
    syntheticOnly: true,
    candidateProjectId: fixture.project_id,
    steps: results,
    runtimeErrors: [...new Set(runtimeErrors)].slice(0, 15),
    failedApiResponses: failedApiResponses.slice(0, 30),
    diagnostics: {
      hydrationErrors: [...new Set(runtimeErrors)].filter(message => /(?:418|423|hydration|hydrat(?:e|ion)|minified react error)/i.test(message)),
      intakeStateFailures: failedApiResponses.filter(response => /intake.state/i.test(response.path)),
      unexpectedApiFailures: failedApiResponses.filter(response => response.status >= 500),
    },
    lastBrowserUrl,
    lastBrowserTitle,
  }, null, 2));
  await browser.close();
  // A visually passing run is not release-ready while React hydration or core API calls fail.
  const hydrationErrors = runtimeErrors.filter(message => /(?:418|423|hydration|hydrat(?:e|ion)|minified react error)/i.test(message));
  const intakeStateFailures = failedApiResponses.filter(response => /intake.state/i.test(response.path));
  const serverFailures = failedApiResponses.filter(response => response.status >= 500);
  if (hydrationErrors.length || intakeStateFailures.length || serverFailures.length) {
    console.error("IZ-Click release gate blocked:", JSON.stringify({
      hydrationErrors: [...new Set(hydrationErrors)].slice(0, 5),
      intakeStateFailures: intakeStateFailures.slice(0, 5),
      serverFailures: serverFailures.slice(0, 5),
    }));
    process.exitCode = 1;
  }
}
