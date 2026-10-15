# IZ-Click: columnas personalizadas persistentes (diseño de implementación)

## Contrato funcional
- `+ Columna` al extremo derecho permite **Crear campo** y **Mostrar/ocultar campos existentes** como acciones separadas.
- Crear campo: nombre único dentro del proyecto, tipo (texto, número, fecha, selección simple), color opcional para opciones de selección; el campo se añade a la vista inmediatamente.
- Cada celda es editable sin navegar fuera de la Lista; cerrar con Escape o clic exterior, guardar explícitamente (o seleccionar opción); el editor aparece sobre las filas y no altera la altura de la fila.
- Los valores, nombres y tipos son compartidos entre usuarios autorizados, no se almacenan en localStorage. Visibilidad y anchos sí pueden ser preferencias de visualización locales.
- Eliminar un campo que ya contiene valores requiere confirmación; nunca borrar datos silenciosamente.

## Persistencia propuesta: API y base de datos Plane
- Tabla `izclick_project_custom_fields`: id UUID, workspace_id, project_id, name, type, options JSONB, sort_order, created_at, updated_at, created_by. Unicidad por proyecto y nombre normalizado.
- Tabla `izclick_issue_custom_field_values`: issue_id, field_id, value JSONB, updated_at, updated_by; clave única (issue_id, field_id), integridad referencial.
- Autorización: lectura según acceso al proyecto; escritura de campos según administración del proyecto; escritura de valores según permisos de edición de carga; scopes de workspace/proyecto en cada consulta.
- Endpoints de proyecto: GET/POST `custom-fields/`; PATCH/DELETE `custom-fields/{id}/`.
- Endpoints de carga: GET/PATCH `issues/{issue_id}/custom-field-values/` con validación de tipo y pertenencia al proyecto.
- Migración versionada antes de activar el botón de crear campos; no realizar migración en producción durante la etapa visual.

## Orden de ejecución
1. Crear modelos, migración y pruebas de permisos en API.
2. Agregar endpoints de campos y valores con validaciones y pruebas.
3. Integrar capa de servicio/store Web, refresco e invalidación.
4. Extender encabezados/celdas desde un único esquema de columnas para evitar desalineación.
5. Implementar crear/editar/ocultar/reordenar y QA multiusuario.

## Criterios de aceptación
- Crear campo Texto 'Orden de montaje' en Proyecto A: visible y editable en dos sesiones diferentes; no aparece en Proyecto B.
- Crear Selección 'Zona' y opciones coloreadas; editar una celda; recargar; persiste.
- Nombre duplicado, tipo incorrecto y permisos insuficientes muestran errores legibles sin cambiar datos.
- Redimensionar las columnas Estado y Prioridad sin invadir celdas; los popovers se ven por encima de filas y grupos.
- Rollback de Web no deja API ni base de datos inconsistentes.

**Estado:** especificación de diseño; no implica que el backend o la función de crear columnas estén implementados.
