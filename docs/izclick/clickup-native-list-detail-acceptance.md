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


## QA obligatorio después del rechazo visual del 14/10/2026

La versión `preview-clickup-736126f5` fue revertida de producción: encabezados
desalineados, columnas superpuestas, sin selector/resize y colores ausentes.
Los cambios posteriores permanecen únicamente en la rama de desarrollo.

### Prueba reproducible de la Lista (escritorio, 1366 y 1920 px)
- [ ] Las posiciones X del borde derecho de cada encabezado coinciden con las de todas las filas, incluso bajo grupos distintos; tolerancia visual máxima: 1 px.
- [ ] Contraer y expandir dos grupos no cambia el ancho ni desplaza las columnas.
- [ ] El texto largo de una carga y de un cliente usa truncamiento, sin tapar la columna siguiente.
- [ ] Mostrar/ocultar cada una de las siete columnas en **+ Columnas** actualiza encabezados y todas las filas; al recargar conserva las selecciones.
- [ ] Arrastrar cada divisor cambia el ancho de encabezado y celdas al mismo tiempo, respetando ancho mínimo; al recargar conserva el ancho.
- [ ] Abrir otro proyecto conserva una configuración independiente; regresar al primero restaura la anterior.
- [ ] Colores de estados corresponden a los del proyecto; etiquetas de cliente muestran su color real.
- [ ] Comprobar scroll horizontal y menú de columnas en ancho reducido, sin recortes ni superposición de botones.
- [ ] Iniciar sesión y abrir carga en el dominio HTTPS real, sin errores CSRF.
- [ ] En modo de lectura no se habilitan cambios; en modo edición funcionan estado, prioridad, asignación, vencimiento, cliente, fecha evento y vínculo SIG.
- [ ] Tras guardar y recargar, la información coincide con la persistida; las otras cargas no sufren cambios.
- [ ] Revisar filtros, selección múltiple, quick-add, paginación y navegación a detalle sin regresiones.

### Integridad y liberación
- [ ] Comparar ID, estado y recuento de las ocho cargas originales antes y después.
- [ ] Comprobar detalle nativo, descripción, comentarios, adjuntos y subtareas.
- [ ] Verificar respaldo recuperable de PostgreSQL y objetos MinIO; documentar reversión de imagen.
- [ ] Exigir compilación Web exitosa **del último commit**, y capturas de QA del mismo artefacto.
- [ ] Publicar solo con aprobación; actualizar únicamente Web con `--no-deps`.
- [ ] Validar `running / healthy`, HTTPS, autenticación y Lista; revertir inmediatamente ante regresión.

**No aprobado:** cualquier casilla crítica sin evidencia. GitHub Actions verde no
sustituye una prueba funcional en navegador.
