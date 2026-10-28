# Estados y segmentos de Izango — 28 de octubre de 2026

El catálogo aprobado contiene 20 estados: Pendiente (5), Por hacer (2), En progreso (9), Completado (1) y Cancelado (3). La fuente canónica es apps/web/app/lib/izclick/production-workflow-presets.json; se copia al API durante la compilación.

El botón Estados muestra los cinco segmentos y conserva controles de edición y eliminación en cada fila. Cada estado tiene su propio color editable. El selector nativo de estados y el administrador del proyecto muestran los mismos segmentos.

Cargar los 20 estados de Izango es una acción administrativa del espacio. Una sola transacción agrega los faltantes y enlaza estados nativos de los proyectos activos. Un nombre coincidente (ignorando mayúsculas, espacios y tildes) se reutiliza. Las identidades, nombres existentes, colores elegidos y referencias de tareas se conservan; el grupo se ajusta al segmento solicitado. Los campos de culminación se concilian si hay un cambio de segmento completado. No se borra ningún estado previo ni se reasignan tareas. Los conflictos o nombres ambiguos revierten toda la carga.

Repetir la carga no crea duplicados de nombres coincidentes ni restablece colores. Una edición que cambie completamente un nombre hace que se considere un estado personalizado; cargar de nuevo el catálogo puede añadir el nombre original de la plantilla. No hay carga automática al abrir el panel.

Se incorporan las reparaciones posteriores instaladas el 27 de octubre (Web cf52fc5): administración de estados nativos y de catálogo en un único botón, modales inmediatos para editar/eliminar y check que usa Completado, nunca Aprobada.

La edición normal mantiene Nombre y Color. Para crear en un segmento, usar «Agregar en…» dentro de ese segmento; no hay que elegir categorías internas en el formulario. La eliminación conserva el traslado explícito de tareas y los permisos administrativos de los sprints anteriores.

Pruebas: catálogo y agrupación (Node), permisos, repetición, adopción, culminación y rollback (PostgreSQL), edición de nombre/color y recarga real en el navegador. La incorporación en producción requiere desplegar las imágenes aprobadas y ejecutar la carga administrativa; no se ha aplicado al VPS desde este cambio de código.
