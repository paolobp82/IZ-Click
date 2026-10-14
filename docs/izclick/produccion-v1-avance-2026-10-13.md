# IZ-Click Producción V1 — avance técnico al 13/10/2026

**Avance global estimado: 55% · Pendiente: 45%.**

Este valor es una estimación de entregables y esfuerzo del alcance inicial, NO certificación de funcionamiento en producción. La aplicación operativa en el VPS sigue usando las imágenes anteriores.

| Entregable solicitado | Implementación en rama | Pendiente de aceptación |
|---|---|---|
| Estados personalizados Producción | Motor y UI de estados nativos de Plane existentes; gráfico consolida por nombre | Definir/configurar estados exactos en los proyectos piloto |
| Fecha del evento + prioridad | Fecha del evento independiente persistida con etiqueta reservada `Evento: AAAA-MM-DD`; prioridad nativa | Validar permisos de creación y edición de etiquetas, UX y persistencia |
| Subtareas | Soporte nativo de Plane y exclusión de subtareas del dashboard | Prueba de alta, edición y visualización con productores |
| Calendario consolidado | Vista de agenda mensual con links y fecha de evento prioritaria | Validación con casos reales y calendario de múltiples proyectos |
| Gráfico pie y porcentajes | Cálculo, redondeo a 100%, subtareas excluidas, productores y estados homónimos unificados | Contrastar totales reales con Plane |
| Enlace a SIG | Editor de código SIG y vínculo usando IssueLink nativo, validación HTTPS | Prueba de guardado y enlace real con permisos de productores |
| Vistas múltiples | Lista y calendario custom; Plane tiene tablero y vistas existentes | Comprobar rutas/alcance de vistas en CE |
| Columnas personalizadas/código SIG | Directorio custom con columnas y editor SIG | Columnas dinámicas y visualización persistida de código en lista |
| Clientes por color | Etiquetas `Cliente: Nombre`, filtros, color, agregación entre proyectos | Preparar etiquetas y validar con clientes reales |
| Vista global de cargas | Dashboard workspace, proyecto/productor/cliente, paginación | Verificar permisos de cada usuario y tiempos de respuesta |
| Ficha editable | Edición de fecha del evento y vínculo SIG en directorio; ficha nativa Plane | Flujo end-to-end de edición y estados |

## Evidencia
- PR borrador: https://github.com/paolobp82/IZ-Click/pull/1
- Workflow: `izclick-production-check.yml`
- Las pruebas automáticas comprueban cálculos, clientes, fechas, etiquetas, URLs SIG y paginación.
- La compilación Vite/Docker NO sustituye las pruebas autenticadas reales de Plane ni la comprobación de tipos completa.

## Método de estimación
55% es la estimación integral para este corte; el código y las vistas están considerablemente adelantados, pero estados específicos, pruebas reales de API, control de permisos, aceptación de usuarios y despliegue controlado siguen pendientes. No modificar la cifra automáticamente por commits.

## Siguiente ruta crítica
1. CI verde en el commit final (tests + Docker web).
2. Probar la vista global y el editor de fecha contra Plane con cuentas piloto.
3. Confirmar los estados operativos exactos y los permisos de Producción.
4. Completar columnas y vistas configurables y corregir incidencias.
5. Publicar con respaldo, rollback y validación posterior.
