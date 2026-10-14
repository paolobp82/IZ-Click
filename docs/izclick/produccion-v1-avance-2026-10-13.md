# IZ-Click Producción V1 — avance técnico al 13/10/2026

**Avance global estimado: 65% · Pendiente: 35%.**

Este valor es una estimación de entregables y esfuerzo del alcance inicial, NO certificación de funcionamiento en producción. La aplicación operativa en el VPS sigue usando las imágenes anteriores.

| Entregable solicitado | Implementación en rama | Pendiente de aceptación |
|---|---|---|
| Estados personalizados Producción | Motor y UI de estados nativos de Plane existentes; gráfico consolida por nombre | Definir/configurar estados exactos en los proyectos piloto |
| Fecha del evento + prioridad | Fecha del evento independiente persistida con metadatos de IssueLink y endpoint por proyecto; prioridad nativa | Validar persistencia de metadatos con productor y lectura del endpoint autenticado |
| Subtareas | Soporte nativo de Plane y exclusión de subtareas del dashboard | Prueba de alta, edición y visualización con productores |
| Calendario consolidado | Vista de agenda mensual con links y fecha de evento prioritaria | Validación con casos reales y calendario de múltiples proyectos |
| Gráfico pie y porcentajes | Cálculo, redondeo a 100%, subtareas excluidas, productores y estados homónimos unificados | Contrastar totales reales con Plane |
| Enlace a SIG | Editor y vínculo usando IssueLink nativo, código preservado en metadata y lectura consolidada por proyecto | Prueba de guardado y enlace real con permisos de productores |
| Vistas múltiples | Lista y calendario custom; Plane tiene tablero y vistas existentes | Comprobar rutas/alcance de vistas en CE |
| Columnas personalizadas/código SIG | Directorio custom con columnas y editor SIG | Columnas dinámicas y validación del código mostrado en lista con datos reales |
| Clientes por color | Etiquetas `Cliente: Nombre`, filtros, color, agregación entre proyectos | Preparar etiquetas y validar con clientes reales |
| Vista global de cargas | Dashboard workspace, proyecto/productor/cliente, paginación | Verificar permisos de cada usuario y tiempos de respuesta |
| Ficha editable | Edición de fecha del evento y vínculo SIG en directorio; ficha nativa Plane | Flujo end-to-end de edición y estados |

## Evidencia
- PR borrador: https://github.com/paolobp82/IZ-Click/pull/1
- Workflow: `izclick-production-check.yml`
- Las pruebas automáticas comprueban cálculos, clientes, fechas, URLs SIG y paginación. Se agregó verificación de sintaxis Python para el endpoint de fechas.
- La compilación Vite/Docker NO sustituye las pruebas autenticadas reales de Plane ni la comprobación de tipos completa.

## Método de estimación
65% es la estimación integral para este corte; el código y las vistas están considerablemente adelantados, pero estados específicos, pruebas reales de API, control de permisos, aceptación de usuarios y despliegue controlado siguen pendientes. No modificar la cifra automáticamente por commits.

## Siguiente ruta crítica
1. CI verde en el commit final (tests + Docker web).
2. Probar la vista global y el editor de fecha contra Plane con cuentas piloto.
3. Confirmar los estados operativos exactos y los permisos de Producción.
4. Completar columnas y vistas configurables y corregir incidencias.
5. Publicar con respaldo, rollback y validación posterior.

## Decisión técnica adicional (13/10/2026)
El editor original basado en etiquetas nuevas presentaba un bloqueo real: Plane CE requiere rol administrador para crear etiquetas. Se sustituyó por metadatos `izclick_kind=event-date` y `izclick_event_date=AAAA-MM-DD` en un IssueLink propio de la carga, manejable mediante el servicio nativo de enlaces. La lectura consolidada utiliza `GET /api/workspaces/:slug/projects/:projectId/production-event-dates/`, con permisos de proyecto y filtrado de tareas para invitados restringidos.

**Implicación de despliegue:** la versión candidata requiere una imagen de la API personalizada y una de la web (actualmente solo están modificadas las imágenes web/admin de producción). No activar el nuevo panel contra la API original, porque su endpoint de fechas no existirá. Mantener copia de seguridad y procedimiento de rollback de ambas imágenes. No hay migraciones ni cambios de tablas previstos por esta solución.

El porcentaje registrado es una estimación de desarrollo y no significa que la integración web/API con usuarios reales se haya validado.

## Segundo corte técnico — enlaces SIG visibles y persistentes
Se agregó `GET /api/workspaces/:slug/projects/:projectId/production-sig-links/`, con comprobación de permisos de proyecto y restricciones de invitados. La vista global e individual reciben el código y URL de SIG por proyecto, y el directorio muestra el código enlazado sin consultas por cada tarea. El código se guarda también como `IssueLink.metadata.izclick_sig_code` porque el rastreador de Plane puede reemplazar el título del enlace. La URL se valida en frontend antes de mostrarla.

**Validación pendiente:** Docker web con TypeScript estricto y validación Python del último commit, prueba de escritura autorizada en la instancia piloto, y construcción/publicación controlada de la imagen API.
