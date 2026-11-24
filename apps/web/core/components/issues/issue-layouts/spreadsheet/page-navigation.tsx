export type SpreadsheetPagination = {
  page: number;
  pageSize: number;
  total: number;
  newestFirst?: boolean;
  loading: boolean;
  error?: string;
  onPageChange: (page: number) => void;
};

export function SpreadsheetPageNavigation(props: SpreadsheetPagination) {
  const pages = Math.max(1, Math.ceil(props.total / props.pageSize));
  const page = Math.min(props.page, pages);
  const numbers = Array.from(new Set([1, ...Array.from({ length: 5 }, (_, i) => page + i - 2), pages]))
    .filter((value) => value >= 1 && value <= pages)
    .sort((a, b) => a - b);
  return (
    <nav
      aria-label="Páginas de cargas"
      className="text-sm flex flex-wrap items-center justify-between gap-3 border-t border-subtle px-4 py-3"
    >
      <span>
        {props.total ? (page - 1) * props.pageSize + 1 : 0}–{Math.min(page * props.pageSize, props.total)} de{" "}
        {props.total} cargas{props.newestFirst !== false && " · Más recientes primero"}
      </span>
      {props.error && <span role="alert">{props.error}</span>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={props.loading || props.page <= 1}
          onClick={() => props.onPageChange(props.page - 1)}
        >
          Anterior
        </button>
        {numbers.map((value, index) => (
          <span key={value} className="flex items-center gap-2">
            {index > 0 && value > numbers[index - 1] + 1 && <span aria-hidden="true">…</span>}
            <button
              type="button"
              aria-label={`Página ${value}`}
              aria-current={props.page === value ? "page" : undefined}
              disabled={props.loading}
              className="rounded border border-subtle px-3 py-1 aria-[current=page]:bg-layer-2"
              onClick={() => props.onPageChange(value)}
            >
              {value}
            </button>
          </span>
        ))}
        <button
          type="button"
          disabled={props.loading || props.page >= pages}
          onClick={() => props.onPageChange(props.page + 1)}
        >
          Siguiente
        </button>
      </div>
    </nav>
  );
}
