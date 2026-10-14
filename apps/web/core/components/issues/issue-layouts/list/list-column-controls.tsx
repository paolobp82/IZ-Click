import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

export const LIST_COLUMNS = [
  { id: "state", name: "Estado", width: 144 },
  { id: "priority", name: "Prioridad", width: 112 },
  { id: "assignee", name: "Responsable", width: 144 },
  { id: "due", name: "Vencimiento", width: 144 },
  { id: "client", name: "Cliente", width: 160 },
  { id: "event", name: "Fecha del evento", width: 160 },
  { id: "sig", name: "Código SIG", width: 160 },
] as const;

type ColumnId = (typeof LIST_COLUMNS)[number]["id"];
type Preferences = Record<ColumnId, { width: number; visible: boolean }>;
const storageKey = (projectId: string) => `izclick-project-list-columns-v2:${projectId}`;
const updateEvent = "izclick-list-columns-updated";
const defaults = (): Preferences =>
  Object.fromEntries(LIST_COLUMNS.map((col) => [col.id, { width: col.width, visible: true }])) as Preferences;

function apply(prefs: Preferences) {
  const root = document.documentElement;
  let propertiesWidth = 0;
  let metadataWidth = 0;
  for (const col of LIST_COLUMNS) {
    const item = prefs[col.id];
    const width = item.visible ? item.width : 0;
    root.style.setProperty(`--izclick-col-${col.id}`, `${width}px`);
    root.style.setProperty(`--izclick-show-${col.id}`, item.visible ? "flex" : "none");
    if (["client", "event", "sig"].includes(col.id)) metadataWidth += width;
    else propertiesWidth += width;
  }
  root.style.setProperty("--izclick-properties-width", `${propertiesWidth}px`);
  root.style.setProperty("--izclick-metadata-width", `${metadataWidth}px`);
  root.style.setProperty("--izclick-row-width", `${420 + propertiesWidth + metadataWidth}px`);
  root.style.setProperty("--izclick-link-width", `${420 + propertiesWidth}px`);
}

export function ListColumnControls() {
  const { projectId } = useParams();
  const scope = String(projectId ?? "default");
  const [prefs, setPrefs] = useState<Preferences>(defaults);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const load = () => {
      try {
      const saved = JSON.parse(localStorage.getItem(storageKey(scope)) || "{}") as Partial<Preferences>;
      const next = defaults();
      for (const col of LIST_COLUMNS) {
        const setting = saved[col.id];
        if (!setting) continue;
        next[col.id] = {
          visible: setting.visible !== false,
          width: Math.max(96, Math.min(500, Number(setting.width) || col.width)),
        };
      }
      setPrefs(next);
      apply(next);
      } catch {
        apply(defaults());
      }
    };
    load();
    const sync = (event: Event) => {
      if ((event as CustomEvent<string>).detail === scope) load();
    };
    window.addEventListener(updateEvent, sync);
    return () => window.removeEventListener(updateEvent, sync);
  }, [scope]);

  const commit = (next: Preferences) => {
    setPrefs(next);
    apply(next);
    localStorage.setItem(storageKey(scope), JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(updateEvent, { detail: scope }));
  };

  const toggle = (id: ColumnId) => {
    const next = { ...prefs, [id]: { ...prefs[id], visible: !prefs[id].visible } };
    commit(next);
  };

  const resize = (id: ColumnId, startX: number) => {
    const initial = prefs[id].width;
    let updated = prefs;
    const move = (event: PointerEvent) => {
      updated = { ...updated, [id]: { ...updated[id], width: Math.max(96, Math.min(500, initial + event.clientX - startX)) } };
      apply(updated);
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      document.body.style.cursor = "";
      commit(updated);
    };
    document.body.style.cursor = "col-resize";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
  };

  return (
    <>
      <span className="relative flex w-[420px] shrink-0 items-center px-3">Carga
      <div className="absolute right-2 top-1 z-20">
        <button type="button" aria-label="Agregar o quitar columnas" className="rounded border border-subtle px-2 py-1 hover:bg-layer-1-hover"
          onClick={() => setOpen((value) => !value)}>+ Columnas</button>
        {open && (
          <div className="absolute right-0 top-full z-30 w-52 rounded border border-subtle bg-surface-1 p-2 shadow-lg">
            {LIST_COLUMNS.map((col) => (
              <label key={col.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-layer-1-hover">
                <input type="checkbox" checked={prefs[col.id].visible} onChange={() => toggle(col.id)} />
                <span>{col.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>


      {LIST_COLUMNS.map((col) => (
        <span
          key={col.id}
          className="relative min-w-0 shrink-0 items-center border-l border-subtle px-2"
          style={{
            display: `var(--izclick-show-${col.id}, flex)`,
            width: `var(--izclick-col-${col.id}, ${col.width}px)`,
          }}
        >
          <span className="truncate">{col.name}</span>
          <button
            type="button"
            aria-label={`Cambiar ancho de ${col.name}`}
            title={`Arrastrar para cambiar ancho de ${col.name}`}
            className="absolute right-0 top-0 z-10 h-full w-2 cursor-col-resize hover:bg-accent-primary/30"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              resize(col.id, event.clientX);
            }}
          />
        </span>
      ))}
      </span>    </>
  );
}
