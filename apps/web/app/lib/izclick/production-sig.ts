/** Native Plane issue links are the storage for IZ-Click ↔ SIG associations. */
export type PlaneExternalLink = { id: string; title: string; url: string };
export type SigAssociation = PlaneExternalLink & { code: string };
export const SIG_LINK_PREFIX = "SIG Izango 360 | ";

const PROJECT_PATH = /^\/proyectos\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i;
const CODE_PATTERN = /^[A-Z0-9][A-Z0-9 -]{1,59}$/;

export function validSigProjectUrl(input: string): string | null {
  try {
    const url = new URL(input.trim());
    if (url.protocol !== "https:" || url.hostname !== "izango-erp.vercel.app" || url.port ||
        url.username || url.password || url.search || url.hash || !PROJECT_PATH.test(url.pathname)) return null;
    return url.origin + url.pathname.replace(/\/$/, "");
  } catch { return null; }
}

export function sigProjectAssociation(link: PlaneExternalLink): SigAssociation | null {
  if (!link.title.startsWith(SIG_LINK_PREFIX)) return null;
  const code = link.title.slice(SIG_LINK_PREFIX.length);
  if (!CODE_PATTERN.test(code) || !validSigProjectUrl(link.url)) return null;
  return { ...link, code };
}

export function sigLinkPayload(code: string, url: string): { title: string; url: string } {
  const normalizedCode = code.trim().toUpperCase().replace(/\s+/g, " ");
  const normalizedUrl = validSigProjectUrl(url);
  if (!CODE_PATTERN.test(normalizedCode)) throw new Error("Código SIG inválido. Ejemplo: IZ-26968");
  if (!normalizedUrl) throw new Error("Utiliza el enlace HTTPS del proyecto en izango-erp.vercel.app/proyectos/");
  return { title: SIG_LINK_PREFIX + normalizedCode, url: normalizedUrl };
}
