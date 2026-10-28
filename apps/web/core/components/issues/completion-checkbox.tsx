import { useRef, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import type { TIssue } from "@plane/types";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { useProjectState } from "@/hooks/store/use-project-state";
import { completionTarget, isCompletionState } from "@/app/lib/izclick/production-completion";

type Props = {
  issue: TIssue;
  disabled: boolean;
  update: (data: Partial<TIssue>) => Promise<unknown>;
};
export const CompletionCheckbox = observer(function CompletionCheckbox({ issue, disabled, update }: Props) {
  const { workspaceSlug } = useParams();
  const { getProjectStates, fetchProjectStates, updateState } = useProjectState();
  const previousStateId = useRef<string | null>(null);
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
      const completing = event.currentTarget.checked;
      setBusy(true);
      try {
        // Catalogue edits can happen after this row was mounted. Resolve from
        // fresh native project states before deciding where the checkbox moves it.
        const currentStates = await fetchProjectStates(String(workspaceSlug), issue.project_id);
        const currentCompleted = completionTarget(currentStates, true);
        const previous = currentStates.find(state => state.id === previousStateId.current && !isCompletionState(state));
        const target = completing ? currentCompleted : previous?.id ?? completionTarget(currentStates, false);
        if (!target) {
          setToast({ type: TOAST_TYPE.ERROR, title: "Revisa los estados del proyecto", message: completing
            ? "Completado todavía no está disponible en este proyecto. Revisa su vinculación desde Estados."
            : "Este proyecto necesita otro estado para reabrir la tarea." });
          return;
        }
        // Repair old native configuration automatically through Plane's normal
        // authenticated state API. Users never have to manage workflow groups.
        const completionState = currentStates.find(state => state.id === currentCompleted);
        if (completing && completionState && completionState.group !== "completed") {
          await updateState(String(workspaceSlug), issue.project_id, completionState.id, { group: "completed" });
        }
        if (completing) previousStateId.current = isCompletionState(currentStates.find(state => state.id === issue.state_id)) ? null : issue.state_id ?? null;
        await update({ state_id: target });
        if (!completing) previousStateId.current = null;
      }
      catch { setToast({ type: TOAST_TYPE.ERROR, title: "No se pudo cambiar el estado", message: "Actualiza la tarea y vuelve a intentarlo." }); }
      finally { setBusy(false); }
    }} />;
});
