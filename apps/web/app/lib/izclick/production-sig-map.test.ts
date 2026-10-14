import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeSigLinkMap } from "./production-sig-map.ts";

const issue = "664584ac-7152-4799-9b9e-72e980213a67";
const url = "https://izango-erp.vercel.app/proyectos/664584ac-7152-4799-9b9e-72e980213a67";
test("acepta asociación SIG válida y mantiene código", () => {
  assert.deepEqual(normalizeSigLinkMap({ [issue]: { code: "IZ-26968", url } }), {
    [issue]: { code: "IZ-26968", url },
  });
});
test("descarta enlaces no autorizados por host y rechaza cargas inválidas", () => {
  assert.deepEqual(normalizeSigLinkMap({ [issue]: { code: "IZ-26968", url: "javascript:alert(1)" } }), {});
  assert.throws(() => normalizeSigLinkMap({ wrong: { code: "IZ-26968", url } }));
});
