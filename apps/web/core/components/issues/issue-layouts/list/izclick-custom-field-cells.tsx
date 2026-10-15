import { useEffect, useRef, useState } from "react";
import { customFieldsEvent, getCustomFields, getCustomValues, updateCustomValue } from "./izclick-custom-field-api";
import type { IzclickCustomField } from "./izclick-custom-field-api";

export function IzclickCustomFieldCells({ workspaceSlug, projectId, issueId, canEdit }: {
  workspaceSlug: string; projectId: string; issueId: string; canEdit: boolean;
}) {
  const [fields, setFields] = useState<IzclickCustomField[]>([]);
  const [fieldsAvailable, setFieldsAvailable] = useState(false);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [active, setActive] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const popupRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let mounted = true;
    const refresh = () => {
      getCustomFields(workspaceSlug, projectId).then(f => { if (mounted) { setFields(f); setFieldsAvailable(true); } }).catch(() => { if (mounted) { setFields([]); setFieldsAvailable(false); } });
      getCustomValues(workspaceSlug, projectId, issueId).then(v => { if (mounted && v && typeof v === "object" && !Array.isArray(v)) setValues(v); }).catch(() => {});
    };
    refresh();
    const onChange = (e: Event) => { if ((e as CustomEvent<string>).detail === projectId) refresh(); };
    window.addEventListener(customFieldsEvent, onChange);
    return () => { mounted = false; window.removeEventListener(customFieldsEvent, onChange); };
  }, [workspaceSlug, projectId, issueId]);
  useEffect(() => {
    if (!active) return;
    const outside = (e: PointerEvent) => {
      if (!popupRef.current?.contains(e.target as Node) && !busy) setActive(null);
    };
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) setActive(null); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [active, busy]);
  const save = async (field: IzclickCustomField) => {
    let value: unknown = draft || null;
    if (draft && field.type === "number") {
      value = Number(draft);
      if (!Number.isFinite(value)) { setError("Número inválido"); return; }
    }
    setBusy(true); setError("");
    try {
      await updateCustomValue(workspaceSlug, projectId, issueId, field.id, value);
      setValues(prev => ({ ...prev, [field.id]: value }));
      setActive(null);
    } catch { setError("No se pudo guardar el valor."); }
    finally { setBusy(false); }
  };
  return <>
    {fieldsAvailable && fields.map(field => {
      const current = values[field.id];
      const option = field.options?.find(item => item.id === current);
      const label = field.type === "select" ? (option?.name || "—") : current == null || current === "" ? "—" : String(current);
      return <div key={field.id} className="relative flex h-11 w-44 shrink-0 items-center border-l border-subtle px-2 text-xs" style={{ minWidth: 176, maxWidth: 176 }} onClick={e => e.stopPropagation()}>
        <button disabled={!canEdit} type="button" title={label} className="w-full truncate rounded px-1 py-1 text-left hover:bg-layer-1-hover disabled:cursor-default" onClick={() => { setActive(field.id); setDraft(current == null ? "" : String(current)); setError(""); }}>{label}</button>
        {active === field.id && <div data-izclick-popover ref={popupRef} className="absolute left-0 top-full z-[90] w-64 rounded-lg border border-subtle bg-surface-1 p-3 shadow-xl">
          <span className="mb-2 block font-medium">{field.name}</span>
          {field.type === "select" ? <select aria-label={field.name} className="w-full rounded border border-subtle bg-surface-1 p-2" value={draft} onChange={e => setDraft(e.target.value)}>
            <option value="">Sin valor</option>{(field.options || []).map(opt => <option value={opt.id} key={opt.id}>{opt.name}</option>)}
          </select> : <input aria-label={field.name} className="w-full rounded border border-subtle bg-surface-1 p-2" type={field.type === "date" ? "date" : field.type === "number" ? "number" : "text"} value={draft} onChange={e => setDraft(e.target.value)} />}
          {error && <div role="alert" className="mt-2 text-red-500">{error}</div>}
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" disabled={busy} onClick={() => setActive(null)}>Cancelar</button>
            <button type="button" disabled={busy} className="rounded bg-accent-primary px-2 py-1 text-white" onClick={() => void save(field)}>Guardar</button>
          </div>
        </div>}
      </div>;
    })}
  </>;
}
