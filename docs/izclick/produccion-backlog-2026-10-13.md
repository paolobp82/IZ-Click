# IZ-Click — Backlog de Producción (13/10/2026)

Fuente: presentación "cambios en plane.pptx" entregada por equipo Izango. Alcance pendiente de validación funcional en Plane Community v1.4.2.

## Principio arquitectónico
IZ-Click gestiona cargas y tareas de Producción; SIG Izango 360 mantiene cotizaciones, RQ, costos y facturación. Agregar enlace al proyecto SIG sin duplicar operaciones financieras.

## Solicitudes del piloto
1. Estados personalizados de cargas (por cotizar, aprobado, rechazado, en curso, finalizado, etc.); definir alcance y transiciones.
2. Campo fecha de realización del evento, independiente de vencimiento si corresponde; prioridad.
3. Subtareas dentro de cada carga.
4. Calendario consolidado de cargas/proyectos.
5. Dashboard pie por productor según estados.
6. Enlace a proyecto del SIG.
7. Distintas vistas (lista, tablero, calendario, otras disponibles).
8. Columnas configurables, especialmente código de proyecto SIG.
9. Identificación visual por cliente con color.
10. Vista global de todas las cargas con estados, filtros y conteos.
11. Ficha de carga editable.

## Dashboard — criterios de aceptación
- Selector de productor y opción Todos.
- Pie/donut distribuido por **estado**, con **cantidad y porcentaje simultáneamente**.
- Leyenda: `Estado — N cargas — X%`; tooltip muestra estado, cantidad, porcentaje y total.
- Porcentajes basados en **cargas del filtro**, no subtareas; evitar duplicación.
- Total de cargas visible; estado vacío manejado; cálculo de porcentaje seguro si total es cero.
- Filtros por productor, estado, cliente y fechas según factibilidad CE.
- Datos reales y permisos de usuario respetados.

## Orden de trabajo
**Fase 1 (auditar/configurar):** roles, estados, responsable, prioridad, etiquetas cliente, subtareas, links SIG.
**Fase 2 (experiencia):** columnas/código SIG, ficha editable, vistas y calendario general.
**Fase 3 (desarrollar):** dashboard global y por productor, pie con cantidades/porcentajes y filtros.
**Fase 4 (QA):** tests/build, piloto con dos responsables, respaldo, deploy reversible.

## Primer hallazgo de código
En `apps/api/plane/db/models/issue.py`, `get_default_properties()` incluye `assignee`, `start_date`, `due_date`, `labels`, `key`, `priority`, `state`, `sub_issue_count`, `link`. `get_default_display_filters()` usa `layout: list`. Esto indica soporte en modelos, **no certifica** disponibilidad en la UI Community ni vistas premium.

## Restricciones
- No modificar producción antes de verificar y probar.
- No introducir migraciones destructivas.
- Utilizar rama de desarrollo separada de `izclick/v1.4.2-custom`, pruebas y rollback.
- Branding de correos «Plane» a «IZ-Click» sigue pendiente separado.
