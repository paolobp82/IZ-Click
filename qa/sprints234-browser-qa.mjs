// Authenticated QA against the disposable synthetic instance only.
import fs from "node:fs";
import assert from "node:assert/strict";
import { chromium } from "playwright";
const f = JSON.parse(fs.readFileSync("qa/.qa-fixture.json", "utf8"));
assert.equal(f.workspace, "izclick-qa");
const base = "http://127.0.0.1:38080";
const api = `/api/workspaces/${f.workspace}/projects/${f.project_id}`;
const route = `${base}/${f.workspace}/projects/${f.project_id}/issues`;
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
await context.addCookies([{ name: "session-id", value: f.admin_session, url: base, httpOnly: true, sameSite: "Lax" }]);
const page = await context.newPage();
const results = [];
const errors = [];
let detail = "setup";
const runtime = [];
page.on("pageerror", error => runtime.push(String(error)));
const request = async (method, url, data) => {
  const res = await context.request[method](base + url, { data });
  assert.ok(res.ok(), `${method} ${url}: ${res.status()} ${await res.text()}`);
  return res.status() === 204 ? null : res.json();
};
const clickAndSave = async (locator, endpoint) => {
  const [response] = await Promise.all([
    page.waitForResponse(response => response.request().method() === "PATCH" && response.url().includes(endpoint)),
    locator.click(),
  ]);
  assert.ok(response.ok(), `Save failed: ${response.status()}`);
};
const step = async (name, action) => { detail = name; await action(); results.push({ name, passed: true }); };
let createdIssue;
let initial;
let childBefore;
try {
  initial = await request("get", `${api}/issues/${f.issue_id}/`);
  const states = await request("get", `${api}/states/`);
  const done = states.find(state => state.group === "completed");
  assert.ok(done);
  const clients = await request("get", `${api}/issue-labels/`);
  let client = clients.find(label => label.name === "Cliente: Empresa QA");
  if (!client) client = await request("post", `${api}/issue-labels/`, { name: "Cliente: Empresa QA", color: "#112233" });
  const members = await request("get", `${api}/members/`);
  const editor = members.find(member => member.role === 20);
  const memberId = editor.member?.id ?? editor.member_id ?? editor.member;
  assert.equal(typeof memberId, "string");
  await page.goto(route);
  const row = () => page.locator(`[data-izclick-issue-id="${f.issue_id}"]`).first();
  await row().waitFor({ timeout: 45000 });
  await step("Complete and reopen through the checkbox; strikethrough survives reload", async () => {
    await clickAndSave(row().getByRole("checkbox", { name: /^Completar / }), `/issues/${f.issue_id}/`);
    await row().getByRole("checkbox", { name: /^Reabrir / }).waitFor();
    assert.equal((await request("get", `${api}/issues/${f.issue_id}/`)).state_id, done.id);
    await page.reload();
    await row().getByRole("checkbox", { name: /^Reabrir / }).waitFor();
    assert.ok(await row().locator("p.line-through").count());
    await clickAndSave(row().getByRole("checkbox", { name: /^Reabrir / }), `/issues/${f.issue_id}/`);
    await row().getByRole("checkbox", { name: /^Completar / }).waitFor();
    await request("patch", `${api}/issues/${f.issue_id}/`, { state_id: initial.state_id });
  });
  await step("Complete and reopen a nested subtask independently", async () => {
    await page.reload(); await row().waitFor();
    await row().getByRole("button", { name: /^Ver subtareas de/ }).click();
    const title = page.getByText("Subtarea Sprint 1 QA", { exact: true });
    await title.waitFor();
    const child = title.locator('xpath=ancestor::*[@data-izclick-issue-id][1]');
    const id = await child.getAttribute("data-izclick-issue-id");
    childBefore = await request("get", `${api}/issues/${id}/`);
    await clickAndSave(child.getByRole("checkbox", { name: /^Completar / }), `/issues/${id}/`);
    await child.getByRole("checkbox", { name: /^Reabrir / }).waitFor();
    assert.equal((await request("get", `${api}/issues/${id}/`)).state_id, done.id);
    assert.ok(await child.locator("p.line-through").count());
    await clickAndSave(child.getByRole("checkbox", { name: /^Reabrir / }), `/issues/${id}/`);
    await child.getByRole("checkbox", { name: /^Completar / }).waitFor();
    await request("patch", `${api}/issues/${id}/`, { state_id: childBefore.state_id });
    childBefore = null;
  });
  await step("Create a task with client and members selected before save", async () => {
    await page.locator("[data-izclick-create-task]").click();
    const form = page.locator("[data-izclick-task-form]");
    await form.getByLabel("Título de la tarea", { exact: true }).fill("Tarea Sprint 2 QA");
    await form.getByRole("button", { name: /Asignar miembros/ }).first().click();
    await page.getByRole("option").filter({ hasText: /Tú|You|QA Editor|qa-admin/i }).first().click();
    await form.getByLabel("Título de la tarea", { exact: true }).click();
    const select = form.getByLabel("Cliente de la nueva tarea");
    await select.selectOption(client.id);
    await form.locator('button[type="submit"]').click();
    await form.waitFor({ state: "hidden" });
    const listing = await request("get", `${api}/issues/?per_page=100`);
    const rows = Array.isArray(listing) ? listing : listing.results;
    createdIssue = rows.find(issue => issue.name === "Tarea Sprint 2 QA");
    assert.ok(createdIssue);
    const saved = await request("get", `${api}/issues/${createdIssue.id}/`);
    assert.ok(saved.label_ids.includes(client.id));
    assert.ok(saved.assignee_ids.includes(memberId));
    await request("delete", `${api}/issues/${createdIssue.id}/`);
    createdIssue = null;
  });
  await step("Assign a commercial member from its column and persist it", async () => {
    await page.goto(route);
    const commercial = row().locator("[data-izclick-commercial]");
    await commercial.getByRole("button").first().click();
    await clickAndSave(page.getByRole("option").filter({ hasText: /Tú|You|QA Editor|qa-admin/i }).first(), "/production-commercial/");
    await page.reload();
    await row().waitFor();
    const map = await request("get", `${api}/production-commercial/`);
    assert.equal(map[f.issue_id], memberId);
    await request("patch", `${api}/issues/${f.issue_id}/production-commercial/`, { member_id: null });
    await page.screenshot({ path: "qa/artifacts/sprint2-commercial.png" });
  });
  await step("Create an assignment column and save a project member", async () => {
    await page.goto(route); await row().waitFor();
    await page.getByRole("button", { name: "Agregar o quitar columnas", exact: true }).first().click();
    const menu = page.locator("[data-izclick-popover]").filter({ hasText: "Crear columna personalizada" }).first();
    await menu.getByLabel("Nombre de columna", { exact: true }).fill("Supervisor Sprint 2 QA");
    await menu.getByLabel("Tipo de columna", { exact: true }).selectOption("member");
    const [created] = await Promise.all([
      page.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith("/izclick-custom-fields/")),
      menu.getByRole("button", { name: "+ Crear campo", exact: true }).click(),
    ]);
    assert.ok(created.ok());
    const field = await created.json();
    assert.ok(field);
    await page.locator('[data-izclick-header="state"]').first().click();
    const cell = row().locator(`[data-izclick-custom-cell="${field.id}"]`);
    await cell.getByRole("button").click();
    const popup = page.getByRole("dialog", { name: "Editar Supervisor Sprint 2 QA", exact: true });
    await popup.getByRole("button", { name: /Seleccionar miembro/ }).first().click();
    await page.getByRole("option").filter({ hasText: /Tú|You|QA Editor|qa-admin/i }).first().click();
    await clickAndSave(popup.getByRole("button", { name: "Guardar", exact: true }), "/izclick-custom-field-values/");
    const saved = await request("get", `${api}/issues/${f.issue_id}/izclick-custom-field-values/`);
    assert.equal(saved[field.id], memberId);
    await page.reload(); await row().waitFor();
    assert.notEqual(await row().locator(`[data-izclick-custom-cell="${field.id}"] button`).innerText(), "—");
  });
  await step("Create and retire a project state through the UI", async () => {
    await page.goto(route); await row().waitFor();
    await page.getByRole("button", { name: "Administrar estados del proyecto", exact: true }).first().click();
    const dialog = page.getByRole("dialog", { name: "Administrar estados del proyecto", exact: true });
    await dialog.getByRole("button", { name: "+ Crear estado", exact: true }).click();
    await dialog.getByLabel("Nombre", { exact: true }).fill("Temporal Sprint 3 QA");
    await dialog.getByRole("button", { name: "Guardar", exact: true }).click();
    const removeState = () => dialog.getByRole("button", { name: "Eliminar estado Temporal Sprint 3 QA", exact: true });
    await removeState().click();
    const confirmRemoval = () => dialog.getByRole("button", { name: "Eliminar estado y mover tareas", exact: true });
    assert.equal(await confirmRemoval().isDisabled(), true, "A destination is required before deletion");
    await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
    assert.equal((await request("get", `${api}/states/`)).some(s => s.name === "Temporal Sprint 3 QA"), true, "Cancel preserves the state");
    await removeState().click();
    await dialog.getByLabel("Estado de destino", { exact: true }).selectOption(initial.state_id);
    await Promise.all([page.waitForEvent("load"), dialog.getByRole("button", { name: "Eliminar estado y mover tareas", exact: true }).click()]);
    await row().waitFor();
    assert.equal((await request("get", `${api}/states/`)).some(s => s.name === "Temporal Sprint 3 QA"), false);
    await page.getByRole("button", { name: "Administrar estados del proyecto", exact: true }).first().click();
    assert.equal(await dialog.getByRole("button", { name: "Eliminar estado Temporal Sprint 3 QA", exact: true }).count(), 0);
    await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();
  });
  await step("A single States button opens the management catalogue without navigating", async () => {
    const before = page.url();
    assert.equal(await page.getByRole("link", { name: "Estados", exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "Administrar estados", exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "Estados", exact: true }).count(), 1);
    await page.getByRole("button", { name: "Estados", exact: true }).click();
    const catalogue = page.getByRole("dialog", { name: "Estados generales de Producción", exact: true });
    await catalogue.waitFor();
    await catalogue.getByRole("heading", { name: "Agregar estado", exact: true }).waitFor();
    assert.equal(page.url(), before, "Managing states stays on the task page");
    await catalogue.getByRole("button", { name: "Cerrar", exact: true }).click();
  });
  await step("Producer loads remain accessible from the production dashboard", async () => {
    await page.goto(`${base}/${f.workspace}/produccion#cargas`);
    await page.getByRole("button", { name: "Por productor", exact: true }).click();
    await page.getByLabel("Cargas agrupadas por productor").waitFor();
    await page.screenshot({ path: "qa/artifacts/sprint3-producers.png" });
  });
  await step("Spanish task UI has numeric rows and no module/cycle navigation", async () => {
    await page.goto(route);
    await row().waitFor();
    assert.equal(await page.getByRole("link", { name: /^(Modules|Módulos|Cycles|Ciclos)$/ }).count(), 0);
    assert.ok(await page.getByText("N.º · Tarea", { exact: true }).count());
    assert.ok(await page.getByText("Todas las tareas", { exact: true }).count());
    assert.match(await row().locator('[data-izclick-cell="priority"]').innerText(), /Urgente/);
    await page.screenshot({ path: "qa/artifacts/sprint4-list-es.png" });
  });
  await step("Comments composer and activity have independent scroll containers", async () => {
    await page.goto(`${route}/${f.issue_id}`);
    await page.locator("[data-izclick-chat-composer]").waitFor({ timeout: 45000 });
    for (const selector of ["[data-izclick-chat-feed]", "[data-izclick-activity-feed]"]) {
      assert.equal(await page.locator(selector).evaluate(el => getComputedStyle(el).overflowY), "auto");
    }
    const composer = page.locator("[data-izclick-chat-composer]");
    const editor = composer.locator('[contenteditable="true"]').first();
    await editor.fill("Mensaje de chat Sprint 4 QA");
    const send = composer.getByRole("button", { name: "Enviar comentario", exact: true });
    const sendBox = await send.boundingBox();
    const composerBox = await composer.boundingBox();
    assert.ok(sendBox && composerBox && sendBox.x >= composerBox.x && sendBox.x + sendBox.width <= composerBox.x + composerBox.width, "Send button fits inside composer");
    detail = "Send comment by visible button";
    const [posted] = await Promise.all([
      page.waitForResponse(response => response.request().method() === "POST" && response.url().includes("comment")),
      send.click(),
    ]);
    assert.ok(posted.ok());
    await page.locator("[data-izclick-chat-feed]").getByText("Mensaje de chat Sprint 4 QA", { exact: true }).waitFor();
    await page.reload();
    await page.locator("[data-izclick-chat-feed]").getByText("Mensaje de chat Sprint 4 QA", { exact: true }).waitFor();
    await editor.fill("Mensaje con Enter Sprint 4 QA");
    detail = "Send comment with Enter exactly once";
    const [entered] = await Promise.all([
      page.waitForResponse(response => response.request().method() === "POST" && response.url().includes("comment")),
      editor.press("Enter"),
    ]);
    assert.ok(entered.ok());
    await page.locator("[data-izclick-chat-feed]").getByText("Mensaje con Enter Sprint 4 QA", { exact: true }).waitFor();
    await page.reload();
    await page.locator("[data-izclick-chat-feed]").getByText("Mensaje con Enter Sprint 4 QA", { exact: true }).waitFor();
    assert.equal(await page.locator("[data-izclick-chat-feed]").getByText("Mensaje con Enter Sprint 4 QA", { exact: true }).count(), 1);
    const before = await composer.boundingBox();
    await page.locator("[data-izclick-activity-feed]").evaluate(el => { el.scrollTop = el.scrollHeight; });
    assert.deepEqual(await composer.boundingBox(), before);
    await page.screenshot({ path: "qa/artifacts/sprint4-chat.png" });
  });
  await step("Twenty catalogue states keep five segments and independent editable colors", async () => {
    await page.goto(route); await row().waitFor();
    await page.getByRole("button", { name: "Estados", exact: true }).click();
    const catalogue = page.getByRole("dialog", { name: "Estados generales de Producción", exact: true });
    const endpoint = `/api/workspaces/${f.workspace}/izclick-production-statuses/`;
    const load = async () => {
      const [response] = await Promise.all([
        page.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith(endpoint)),
        catalogue.getByRole("button", { name: "Cargar los 20 estados de Izango", exact: true }).click(),
      ]);
      assert.ok(response.ok(), await response.text());
      return response.json();
    };
    await load();
    await catalogue.getByText(/Se agregaron/).waitFor();
    const list = await request("get", endpoint);
    const expected = JSON.parse(fs.readFileSync("apps/web/app/lib/izclick/production-workflow-presets.json", "utf8"));
    for (const preset of expected) {
      assert.equal(list.filter(state => state.name === preset.name && state.group === preset.group).length, 1);
    }
    for (const label of ["Pendiente", "Por hacer", "En progreso", "Completado", "Cancelado"]) {
      assert.equal(await catalogue.getByRole("region", { name: `Segmento ${label}`, exact: true }).count(), 1);
    }
    const received = list.find(state => state.name === "Recibida");
    const other = list.find(state => state.name === "Pendiente de información");
    await catalogue.getByRole("button", { name: "Editar estado general Recibida", exact: true }).click();
    await catalogue.getByLabel("Nombre", { exact: true }).fill("Recibida QA editable");
    await catalogue.getByLabel("Código hexadecimal del color", { exact: true }).fill("#123456");
    await clickAndSave(catalogue.getByRole("button", { name: "Guardar cambios", exact: true }), `/${received.id}/`);
    await page.reload(); await row().waitFor();
    await page.getByRole("button", { name: "Estados", exact: true }).click();
    await catalogue.getByRole("button", { name: "Editar estado general Recibida QA editable", exact: true }).click();
    assert.equal(await catalogue.getByLabel("Color", { exact: true }).inputValue(), "#123456");
    await catalogue.getByLabel("Nombre", { exact: true }).fill("Recibida");
    await clickAndSave(catalogue.getByRole("button", { name: "Guardar cambios", exact: true }), `/${received.id}/`);
    const beforeRepeat = await request("get", endpoint);
    assert.equal(beforeRepeat.find(state => state.id === other.id).color, other.color);
    assert.equal((await load()).created, 0);
    const afterRepeat = await request("get", endpoint);
    assert.equal(afterRepeat.find(state => state.id === received.id).color, "#123456");
    assert.equal(afterRepeat.length, beforeRepeat.length);
    assert.deepEqual(afterRepeat.map(state => state.id).sort(), beforeRepeat.map(state => state.id).sort());
    await catalogue.getByText(/Se agregaron 0 estados/).waitFor();
    await page.screenshot({ path: "qa/artifacts/izclick-workflow-segments.png" });
    await catalogue.getByRole("button", { name: "Cerrar", exact: true }).click();
    await row().locator('[data-izclick-cell="state"]').getByRole("button").first().click();
    await page.getByRole("group", { name: "Segmento En progreso", exact: true }).waitFor();
    await page.screenshot({ path: "qa/artifacts/izclick-workflow-picker.png" });
    await page.keyboard.press("Escape");
  });
  assert.deepEqual(runtime, [], "No browser runtime errors");
} catch (error) {
  errors.push(`${detail}: ${String(error)}`);
  await page.screenshot({ path: "qa/artifacts/sprints234-failure.png", fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  if (childBefore) await request("patch", `${api}/issues/${childBefore.id}/`, { state_id: childBefore.state_id }).catch(() => {});
  if (initial) await request("patch", `${api}/issues/${f.issue_id}/`, { state_id: initial.state_id }).catch(() => {});
  if (createdIssue) await request("delete", `${api}/issues/${createdIssue.id}/`).catch(() => {});
  fs.writeFileSync("qa/artifacts/sprints234-results.json", JSON.stringify({ syntheticOnly: true, results, errors, runtime }, null, 2));
  await browser.close();
}
