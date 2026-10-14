import assert from "node:assert/strict";
import { test } from "node:test";
import { sigLinkPayload, sigProjectAssociation, validSigProjectUrl } from "./production-sig.ts";

const project = "https://izango-erp.vercel.app/proyectos/664584ac-7152-4799-9b9e-72e980213a67";

test("guarda código SIG y URL como un enlace nativo de Plane", () => {
  const link = sigLinkPayload("iz-26968", project);
  assert.equal(link.title, "SIG Izango 360 | IZ-26968");
  assert.equal(link.url, project);
  const saved = sigProjectAssociation({ id: "link1", ...link });
  assert.equal(saved?.code, "IZ-26968");
});

test("rechaza URL ajena, javascript y enlaces que no son el proyecto", () => {
  assert.equal(validSigProjectUrl("javascript:alert(1)"), null);
  assert.equal(validSigProjectUrl("https://izango-erp.vercel.app.evil.test/proyectos/664584ac-7152-4799-9b9e-72e980213a67"), null);
  assert.equal(validSigProjectUrl(project + "/cotizaciones"), null);
  assert.throws(() => sigLinkPayload("IZ-26968", "https://example.com"));
});

test("no reconoce ni modifica enlaces Plane ajenos a SIG", () => {
  assert.equal(sigProjectAssociation({ id: "link2", title: "Brochure", url: project }), null);
});


test("recupera código SIG desde metadata aunque el crawler cambie el título", () => {
  const payload = sigLinkPayload("IZ-26968", project);
  const saved = sigProjectAssociation({ id: "link1", ...payload, title: "IZ-Click - Página de inicio" });
  assert.equal(saved?.code, "IZ-26968");
  assert.equal(saved?.url, project);
});
