import { useEffect, useRef, useState } from "react";
import { EFileAssetType } from "@plane/types";
import { FileService } from "@/services/file.service";

const fileService = new FileService();
type Entry = {
  key: number;
  scope: string;
  file: File;
  status: "uploading" | "ready" | "error";
  assetId?: string;
};

// Upload before creating the issue: failed uploads never create partial tasks.
export function useCreationAttachments(slug: string, projectId: string) {
  const scope = `${slug}:${projectId}`;
  const [allEntries, setEntries] = useState<Entry[]>([]);
  const sequence = useRef(0);
  const generation = useRef(0);
  useEffect(() => {
    generation.current += 1;
    setEntries([]);
    return () => { generation.current += 1; };
  }, [scope]);
  const entries = allEntries.filter(entry => entry.scope === scope);

  async function upload(entry: Entry) {
    const attempt = generation.current;
    setEntries(previous => previous.map(item => item.key === entry.key ? { ...item, status: "uploading" } : item));
    try {
      const result = await fileService.uploadProjectAsset(slug, projectId, {
        entity_type: EFileAssetType.ISSUE_ATTACHMENT, entity_identifier: "",
      }, entry.file);
      if (attempt === generation.current) setEntries(previous => previous.map(item =>
        item.key === entry.key ? { ...item, status: "ready", assetId: result.asset_id } : item));
    } catch {
      if (attempt === generation.current) setEntries(previous => previous.map(item =>
        item.key === entry.key ? { ...item, status: "error" } : item));
    }
  }

  function add(files: File[]) {
    const additions: Entry[] = files.map(file => ({ key: ++sequence.current, scope, file, status: "uploading" }));
    setEntries(previous => [...previous, ...additions]);
    additions.forEach(entry => { void upload(entry); });
  }
  function clear() { generation.current += 1; setEntries([]); }
  return {
    entries, add, clear,
    retry: (entry: Entry) => { void upload(entry); },
    remove: (key: number) => setEntries(previous => previous.filter(entry => entry.key !== key)),
    blocked: entries.some(entry => entry.status !== "ready"),
    assetIds: entries.flatMap(entry => entry.status === "ready" && entry.assetId ? [entry.assetId] : []),
  };
}

export function CreationAttachments({ attachments, disabled }: {
  attachments: ReturnType<typeof useCreationAttachments>;
  disabled: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <section className="px-5 pb-4 text-sm" aria-label="Archivos adjuntos">
      <input ref={input} className="hidden" type="file" multiple aria-label="Seleccionar archivos"
        disabled={disabled} onChange={event => {
          attachments.add(Array.from(event.target.files ?? []));
          event.target.value = "";
        }} />
      <button type="button" className="rounded border border-subtle px-3 py-2" disabled={disabled}
        onClick={() => input.current?.click()}>Adjuntar archivos</button>
      <p className="mt-2 text-xs text-secondary">Documentos, hojas de cálculo, PDF, imágenes y otros archivos admitidos.</p>
      <ul className="mt-2 space-y-2 max-h-40 overflow-y-auto" aria-live="polite">
        {attachments.entries.map(entry => (
          <li key={entry.key} className="flex flex-wrap items-center gap-2">
            <span className="break-all">{entry.file.name}</span>
            <span className="text-xs text-secondary">({Math.ceil(entry.file.size / 1024)} KB)</span>
            {entry.status === "uploading" && <span>Subiendo…</span>}
            {entry.status === "ready" && <span>Listo</span>}
            {entry.status === "error" && <>
              <span role="alert">No se pudo subir. Revisa el tipo y tamaño del archivo o reintenta.</span>
              <button type="button" disabled={disabled} onClick={() => attachments.retry(entry)}>Reintentar</button>
            </>}
            <button type="button" disabled={disabled} aria-label={`Quitar ${entry.file.name}`}
              onClick={() => attachments.remove(entry.key)}>Quitar</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
