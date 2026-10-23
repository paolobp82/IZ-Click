import { useState } from "react";
import { observer } from "mobx-react";
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
  const { getProjectStates, getStateById } = useProjectState();
  const [busy, setBusy] = useState(false);
  const completed = getStateById(issue.state_id)?.group === "completed";
  const target = completionTarget(getProjectStates(issue.project_id) ?? [], !completed);
  return <input type="checkbox" checked={completed} disabled={disabled || busy || !target}
    aria-label={`${completed ? "Reabrir" : "Completar"} ${issue.name}`}
    title={target ? (completed ? "Reabrir tarea" : "Marcar tarea culminada") : "El proyecto necesita un estado completado y uno pendiente"}
    className="size-4 shrink-0 cursor-pointer accent-green-600 disabled:cursor-default"
    onClick={event => event.stopPropagation()}
    onChange={async event => {
      event.stopPropagation();
      if (!target || disabled || busy) return;
      setBusy(true);
      try { await update({ state_id: target }); }
      catch { setToast({ type: TOAST_TYPE.ERROR, title: "No se pudo cambiar el estado", message: "Actualiza la tarea y vuelve a intentarlo." }); }
      finally { setBusy(false); }
    }} />;
});
