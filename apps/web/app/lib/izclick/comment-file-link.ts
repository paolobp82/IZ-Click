const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]!);

/** Keep filenames as text and use the authenticated asset download endpoint. */
export function commentFileLink(name: string, downloadUrl: string): string {
  const url = new URL(downloadUrl, "https://izclick.invalid");
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Invalid download URL");
  return `<p><a href="${escapeHtml(downloadUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(name)}</a></p>`;
}
