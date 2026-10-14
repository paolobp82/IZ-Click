import { useEffect, useMemo, useState } from "react";
import { IssueService } from "@/services/issue";
import { validCalendarDate } from "@/app/lib/izclick/production-schedule";
import { sigProjectAssociation } from "@/app/lib/izclick/production-sig";
import type { PlaneExternalLink } from "@/app/lib/izclick/production-sig";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  openDetails: () => void;
};

/** One native IssueLink read per row; no independent production data store. */
export function ProductionMetadataCells({ workspaceSlug, projectId, issueId, openDetails }: Props) {
  const service = useMemo(() => new IssueService(), []);
  const [date, setDate] = useState("");
  const [sig, setSig] = useState<{ code: string; url: string } | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setDate("");
    setSig(null);
    setError(false);
    service.fetchIssueLinks(workspaceSlug, projectId, issueId)
      .then((response) => {
        if (!active) return;
        if (!Array.isArray(response)) throw new Error("Invalid issue links");
        const links = response as PlaneExternalLink[];
        const raw = links.find((link) => link.metadata?.izclick_kind === "event-date")?.metadata?.izclick_event_date;
        setDate(validCalendarDate(raw) ? raw : "");
        const match = links.map(sigProjectAssociation).find(Boolean);
        setSig(match ? { code: match.code, url: match.url } : null);
      })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [service, workspaceSlug, projectId, issueId]);

  return (
    <>
      <td className="h-11 min-w-40 border-r border-subtle px-3 text-13">
        <button type="button" className="w-full text-left hover:underline" onClick={openDetails}
          title="Editar fecha del evento en la ficha de carga">
          {error ? "No disponible" : date || "—"}
        </button>
      </td>
      <td className="h-11 min-w-40 border-r border-subtle px-3 text-13">
        {sig ? (
          <a href={sig.url} target="_blank" rel="noopener noreferrer" className="underline"
            title="Abrir proyecto asociado en SIG">{sig.code} ↗</a>
        ) : (
          <button type="button" className="w-full text-left hover:underline" onClick={openDetails}
            title="Vincular SIG en la ficha de carga">{error ? "No disponible" : "—"}</button>
        )}
      </td>
    </>
  );
}
