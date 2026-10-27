import { useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import type { TIssue } from "@plane/types";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { useProjectState } from "@/hooks/store/use-project-state";
import { completionTarget } from "@/app/lib/izclick/production-completion";

type Props = {
  issue: TIssue;
  disabled: boolean;
  update: (data: Partial<TIssue>) => Promise<unknown>;
};
export const CompletionCheckbox = observer(function CompletionCheckbox({ issue, disabled, update }: Props) {
  const { workspaceSlug } = useParams();
  const { getProjectStates, fetchProjectStates } = useProjectState();
  const [busy, setBusy] = useState(false);
  const states = getProjectStates(issue.project_id) ?? [];
  const completedState = completionTarget(states, true);
  const completed = Boolean(completedState && issue.state_id === completedState);
  return <input type="checkbox" checked={completed} disabled={disabled || busy || !workspaceSlug || !issue.project_id}
    aria-busy={busy}
    aria-label={`${completed ? "Reabrir" : "Completar"} ${issue.name}`}
    title={disabled ? "No tienes permiso para editar esta tarea o está archivada" : completed ? "Reabrir tarea" : "Marcar como Completado"}
    className="size-4 shrink-0 cursor-pointer accent-green-600 disabled:cursor-default"
    onClick={event => event.stopPropagation()}
    onChange={async event => {
      event.stopPropagation();
      if (disabled || busy || !workspaceSlug || !issue.project_id) return;
      setBusy(true);
      try {
        // Catalogue edits can happen after this row was mounted. Resolve from
        // fresh native project states before deciding where the checkbox moves it.
        const currentStates = await fetchProjectStates(String(workspaceSlug), issue.project_id);
        const currentCompleted = completionTarget(currentStates, true);
        const isCompleted = Boolean(currentCompleted && issue.state_id === currentCompleted);
        const target = completionTarget(currentStates, !isCompleted);
        if (!target) {
          const namedCompleted = currentStates.some(state => state.name.trim().toLocaleLowerCase("es") === "completado");
          setToast({ type: TOAST_TYPE.ERROR, title: "Revisa los estados del proyecto", message: isCompleted
            ? "Este proyecto necesita un estado Pendiente o Por iniciar para reabrir la tarea."
            : namedCompleted ? "El estado Completado debe pertenecer al grupo Finalizado. Puedes corregirlo desde Estados → Editar."
            : "Completado todavía no está disponible en este proyecto. Revisa su vinculación desde Estados." });
          return;
        }
        await update({ state_id: target });
      }
      catch { setToast({ type: TOAST_TYPE.ERROR, title: "No se pudo cambiar el estado", message: "Actualiza la tarea y vuelve a intentarlo." }); }
      finally { setBusy(false); }
    }} />;
});
