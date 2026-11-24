/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */
type Props = {
  name: string;
  project: string;
  client: string;
  startDate?: string | null;
  dueDate?: string | null;
  coordinators: string[];
  sending: boolean;
  error?: string;
  onBack: () => void;
  onSend: () => void;
};

export function CommercialIntakeReview(props: Props) {
  return (
    <section className="rounded-lg bg-surface-1 p-6" aria-label="Revisar envío a coordinación">
      <h2 className="text-lg font-semibold">Revisar envío a coordinación</h2>
      <p className="text-sm mt-2 text-secondary">
        La carga entrará en una cola compartida. Coordinación revisará las cargas de trabajo y asignará al productor.
      </p>
      <dl className="text-sm my-5 grid gap-3">
        <div>
          <dt className="text-secondary">Carga</dt>
          <dd>{props.name}</dd>
        </div>
        <div>
          <dt className="text-secondary">Proyecto</dt>
          <dd>{props.project}</dd>
        </div>
        <div>
          <dt className="text-secondary">Cliente</dt>
          <dd>{props.client || "Sin cliente"}</dd>
        </div>
        <div>
          <dt className="text-secondary">Inicio / vencimiento</dt>
          <dd>
            {props.startDate || "Sin fecha"} / {props.dueDate || "Sin fecha"}
          </dd>
        </div>
        <div>
          <dt className="text-secondary">Recibe coordinación</dt>
          <dd>{props.coordinators.join(" y ") || "Coordinadoras del equipo"}</dd>
        </div>
      </dl>
      <p className="text-sm">
        No necesitas elegir coordinadora ni productor. Ambas coordinadoras verán la misma solicitud.
      </p>
      {props.error && (
        <p role="alert" className="text-red-600 mt-3">
          {props.error}
        </p>
      )}
      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          className="rounded border border-subtle px-4 py-2"
          disabled={props.sending}
          onClick={props.onBack}
        >
          Volver a editar
        </button>
        <button
          type="button"
          className="rounded bg-accent-primary px-4 py-2 text-white"
          disabled={props.sending}
          onClick={props.onSend}
        >
          {props.sending ? "Enviando…" : "Enviar a coordinación"}
        </button>
      </div>
    </section>
  );
}
