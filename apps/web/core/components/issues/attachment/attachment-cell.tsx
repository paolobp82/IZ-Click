import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { Dialog } from "@headlessui/react";
import { useParams } from "next/navigation";
import type { TIssue, TIssueAttachment, TIssueServiceType } from "@plane/types";
import { EIssueServiceType } from "@plane/types";
import { getEditorAssetDownloadSrc, getEditorAssetSrc, convertBytesToSize } from "@plane/utils";
import { IssueAttachmentService } from "@/services/issue";
import { attachmentPreviewKind } from "@/app/lib/izclick/production-attachments";

/** Read-only attachment list; access continues through Plane's authenticated asset routes. */
export const IssueAttachmentCell = observer(function IssueAttachmentCell({
  issue,
  serviceType = EIssueServiceType.ISSUES,
}: {
  issue: TIssue;
  serviceType?: TIssueServiceType;
}) {
  const { workspaceSlug } = useParams();
  const service = useMemo(() => new IssueAttachmentService(serviceType), [serviceType]);
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<TIssueAttachment[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!open || !workspaceSlug || !issue.project_id) return;
    let active = true;
    setLoading(true);
    setError("");
    setFiles([]);
    setSelectedId(null);
    service
      .getIssueAttachments(String(workspaceSlug), issue.project_id, issue.id)
      .then((items) => {
        if (!Array.isArray(items)) throw new Error("Formato inválido");
        if (active) setFiles(items);
        return items;
      })
      .catch(() => {
        if (active) setError("No se pudieron cargar los adjuntos. Revisa tu conexión o tus permisos.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, workspaceSlug, issue.project_id, issue.id, service, attempt]);

  const selected = files.find((file) => file.id === selectedId);
  const source = (file: TIssueAttachment, download = false) => {
    const args = { workspaceSlug: String(workspaceSlug), projectId: issue.project_id ?? undefined, assetId: file.id };
    return download ? getEditorAssetDownloadSrc(args) : getEditorAssetSrc(args);
  };
  const kind = selected ? attachmentPreviewKind(selected.attributes.name) : null;

  return (
    <>
      <button
        type="button"
        disabled={!workspaceSlug || !issue.project_id}
        aria-label={`Ver adjuntos de ${issue.name}`}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
        className="text-xs w-full truncate px-2 py-1 text-left hover:underline disabled:opacity-50"
      >
        {issue.attachment_count ?? 0} {(issue.attachment_count ?? 0) === 1 ? "adjunto" : "adjuntos"}
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} className="relative z-[1200]">
        <div className="fixed inset-0 bg-black/40" aria-hidden="true" />
        <div className="fixed inset-0 overflow-y-auto p-4 sm:p-8">
          <Dialog.Panel
            onClick={(event) => event.stopPropagation()}
            className="shadow-xl mx-auto flex max-h-[90vh] w-full max-w-4xl flex-col rounded-lg border border-subtle bg-surface-1 p-4"
          >
            <div className="mb-3 flex items-center justify-between gap-4">
              <Dialog.Title className="min-w-0 truncate font-semibold">Adjuntos · {issue.name}</Dialog.Title>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="shrink-0 rounded border border-subtle px-3 py-1"
              >
                Cerrar
              </button>
            </div>
            <div className="overflow-y-auto">
              {loading && <p role="status">Consultando adjuntos…</p>}
              {error && (
                <div role="alert">
                  <p>{error}</p>
                  <button type="button" onClick={() => setAttempt((value) => value + 1)} className="underline">
                    Reintentar
                  </button>
                </div>
              )}
              {!loading && !error && files.length === 0 && <p>Esta tarea no tiene archivos adjuntos.</p>}
              <ul className="divide-y divide-subtle">
                {files.map((file) => (
                  <li key={file.id} className="flex flex-wrap items-center gap-3 py-3">
                    <span className="text-sm min-w-0 flex-1 break-words">{file.attributes.name}</span>
                    <span className="text-xs text-tertiary">{convertBytesToSize(file.attributes.size)}</span>
                    <button type="button" className="text-xs underline" onClick={() => setSelectedId(file.id)}>
                      Vista previa
                    </button>
                    <a className="text-xs underline" href={source(file, true)} download={file.attributes.name}>
                      Descargar
                    </a>
                  </li>
                ))}
              </ul>
              {selected && (
                <section
                  aria-label={`Vista previa de ${selected.attributes.name}`}
                  className="mt-3 border-t border-subtle pt-3"
                >
                  <p className="text-sm mb-2 font-medium break-words">{selected.attributes.name}</p>
                  {kind === "image" && (
                    <img
                      src={source(selected)}
                      alt={selected.attributes.name}
                      className="mx-auto max-h-[50vh] max-w-full object-contain"
                    />
                  )}
                  {kind === "pdf" && (
                    <div>
                      <a
                        href={source(selected)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs mb-2 block underline"
                      >
                        Abrir PDF en nueva pestaña
                      </a>
                      <iframe
                        title={`Vista previa de ${selected.attributes.name}`}
                        src={source(selected)}
                        className="h-[50vh] w-full"
                        sandbox=""
                      />
                    </div>
                  )}
                  {kind === null && (
                    <p className="text-sm">
                      Este formato no tiene vista previa. Puedes descargar el archivo para abrirlo.
                    </p>
                  )}
                </section>
              )}
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>
    </>
  );
});
