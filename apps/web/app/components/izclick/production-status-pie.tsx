import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { ProductionMetrics } from "@/lib/izclick/production-metrics";

type Props = { metrics: ProductionMetrics; title?: string };

/** Dashboard chart. The caller must filter issues using normal Plane permissions. */
export function ProductionStatusPie({ metrics, title = "Distribución de cargas por estado" }: Props) {
  return (
    <section aria-label={title} className="rounded-lg border border-subtle bg-surface-1 p-5">
      <h2 className="mb-2 text-base font-semibold">{title}</h2>
      <p className="mb-4 text-sm text-custom-text-300">
        Total: <strong>{metrics.total} cargas</strong>
      </p>
      {metrics.total === 0 ? (
        <p className="py-8 text-center text-sm text-custom-text-300">No hay cargas para estos filtros.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <div role="img" aria-label={metrics.slices.map((s) => `${s.name}: ${s.count} cargas, ${s.percent}%`).join("; ")}>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={metrics.slices}
                  dataKey="count"
                  nameKey="name"
                  innerRadius={62}
                  outerRadius={100}
                  label={({ index }) => { const slice = metrics.slices[index]; return slice ? `${slice.count} (${slice.percent}%)` : ""; }}
                  labelLine={false}
                >
                  {metrics.slices.map((slice) => (
                    <Cell key={slice.id} fill={slice.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(_value, _name, props) => {
                    const slice = props.payload as ProductionMetrics["slices"][number];
                    return [`${slice.count} cargas (${slice.percent}% de ${metrics.total})`, slice.name];
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="flex flex-col justify-center gap-2" aria-label="Detalle de cargas por estado">
            {metrics.slices.map((slice) => (
              <li key={slice.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2">
                  <span aria-hidden="true" className="h-3 w-3 rounded-sm" style={{ backgroundColor: slice.color }} />
                  {slice.name}
                </span>
                <strong className="whitespace-nowrap">{slice.count} — {slice.percent}%</strong>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
