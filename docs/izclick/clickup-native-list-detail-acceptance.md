# IZ-Click — Adaptación nativa ClickUp: Lista y detalle

## Estado
Rama de trabajo `izclick/clickup-native-list-detail-20261014` creada desde producción `b0a1231f83dd5dc3d83675d702192d286fdd68f4`. **No desplegar hasta aprobar QA visual y funcional.**

## Hallazgo comprobado en código
- Ruta de proyectos `apps/web/app/(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/issues/(list)/page.tsx` renderiza `ProjectLayoutRoot`.
- `apps/web/core/components/issues/issue-layouts/roots/project-layout-root.tsx` deriva Lista de `ListLayout` (Plane) y Tabla de `ProjectSpreadsheetLayout`.
- `apps/web/core/components/issues/issue-layouts/list/base-list-root.tsx` ya dispone de agrupaciones, permisos, inline editing, quick add, drag/drop y paginación; conservar esas capacidades.
- `apps/web/core/components/issues/issue-layouts/spreadsheet/` contiene celdas de metadatos de Producción; integrarlas en Lista sin sustituir la ruta ni crear datos paralelos.
- `apps/web/core/components/issues/issue-detail/root.tsx` monta `IssueMainContent` y `IssueDetailsSidebar`; adaptar la composición nativa de esos componentes.

## Criterios de aceptación — Lista
1. Diseño tabular compacto y de ancho completo, con encabezados de columna fijos, filas alineadas y agrupación por estado con contraer/expandir y contador.
2. Columnas: nombre de carga, fecha límite, prioridad, asignados, estado, cliente, Código ERP, Fecha evento y Link ERP; columnas configurables, scroll horizontal.
3. Edición inline autorizada de estado, prioridad, responsable y fechas; metadatos IZ-Click conectados a persistencia real. No duplicar estados por proyecto.
4. Clic en nombre abre **detalle nativo**, no iframe, overlay heterogéneo ni panel separado.
5. Preservar filtros, selección múltiple, creación, permisos, paginación y reordenamiento que funcionen en Plane.

## Criterios de aceptación — Detalle
1. Cabecera integrada con identificador, nombre, estado, acciones; contenido principal amplio, con fechas, responsable, prioridad, descripción, adjuntos y subtareas.
2. Campos de Producción (Cliente, Código ERP, Fecha evento, Link ERP) visibles, ordenados, editables según permisos y sin formularios incrustados.
3. Panel lateral de actividad/comentarios persistente en escritorio, accesible en móvil.
4. Navegación coherente con la Lista y vuelta a la posición previa, sin alterar rutas ni relaciones de cargas.

## Seguridad y liberación
- Sin cambios en esquema, estados de otras áreas ni datos productivos.
- No reemplazar componentes por `ProductionLoadDirectory` como pantalla paralela; integrarse en la vista nativa.
- QA requerido: captura comparativa Lista/Detalle, editar y recargar campos, crear carga, mover estado, permisos de lectura, subtareas, adjuntos, calendario, integridad de 8 cargas originales.
- `npm/pnpm` lint/typecheck y build web antes de publicar una imagen; desplegar solo con aprobación tras QA.
