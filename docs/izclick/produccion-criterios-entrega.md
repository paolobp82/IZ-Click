# IZ-Click Producción — matriz de entrega y criterio de avance

**Estado: en desarrollo; NO desplegado.** El avance se computa por entregables demostrables, no por commits. Una funcionalidad solo cuenta como terminada cuando está implementada, compilada, probada y validada en IZ-Click por el equipo.

| ID | Entregable | Criterio mínimo de aceptación |
|---|---|---|
| 01 | Estados personalizados | Alta/edición, flujo y visualización por carga |
| 02 | Fecha del evento y prioridad | Edición/persistencia/filtro sin confundir fecha límite |
| 03 | Subtareas | Crear, asignar, finalizar desde la carga |
| 04 | Calendario consolidado | Todas las cargas visibles según permisos |
| 05 | Pie de cargas por productor | Cantidad + % por estado, total, filtros, sin doble conteo |
| 06 | Enlaces SIG | Link por carga al proyecto SIG |
| 07 | Distintas vistas | Lista/tablero/calendario y disponibilidad real de CE |
| 08 | Código SIG y columnas | Código visible, editable y filtrable |
| 09 | Cliente con color | Selección persistente y color coherente |
| 10 | Vista global cargas | Proyectos autorizados, filtros y estados |
| 11 | Ficha editable | Los datos requeridos se editan y guardan |

**Regla de progreso:** 11 requisitos, cada uno vale 1/11 (~9,1%) solo cuando está entregado de punta a punta. El código del pie y el panel por proyecto están en PR #1 como trabajo en curso, y no computan como completados hasta test/build/validación.

## Pruebas previas a publicación
- Tests unitarios y build Docker web, sin errores.
- Integración con API real en Plane Community v1.4.2 (incluye paginación).
- Validación con los dos responsables y datos reales, respetando permisos.
- Backup confirmado y rollback documentado.
- Solo después de todo lo anterior: publicar la nueva imagen y verificar aplicación.

## Fuera del alcance funcional (pendiente separado)
- Remitente/asunto/plantilla de correos de Plane a IZ-Click.
