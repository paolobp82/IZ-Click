/** Only passive image formats and PDFs are embedded; HTML/SVG are download-only. */
export function attachmentPreviewKind(name: string): "image" | "pdf" | null {
  const extension = name.split(".").pop()?.toLowerCase();
  if (extension && ["png", "jpg", "jpeg", "gif", "webp", "avif"].includes(extension)) return "image";
  return extension === "pdf" ? "pdf" : null;
}
