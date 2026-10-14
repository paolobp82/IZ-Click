# IZ-Click — Sprint 15 | Validación operativa y liberación controlada

Estado: **PENDIENTE DE EJECUCIÓN**. Este documento registra el protocolo; no constituye evidencia de pruebas realizadas ni autorización para desplegar.

## Versión de referencia
- Rama de desarrollo: `izclick/flujo-nativo-sin-duplicados-20261014`
- CI verificado: [GitHub Actions #38621101553](https://github.com/paolobp82/IZ-Click/actions/runs/38621101553) — 3 jobs aprobados para el commit `a0f904ffeb1e40e467616a6d6d0eeca028ed4b33`.
- Cualquier nuevo commit requiere repetir CI sobre **el nuevo HEAD** antes de aprobar el despliegue.

## Matriz de aceptación (completar con evidencia)

| ID | Prueba con sesión real | Resultado | Evidencia / responsable |
| --- | --- | --- | --- |
| A01 | Abrir proyecto y alternar Lista, Tabla, Tablero, Calendario y Gantt solo donde estén habilitadas en CE | PENDIENTE | |
| A02 | Desde la vista clásica crear una carga, abrirla y editarla sin formularios incrustados ni navegación contradictoria | PENDIENTE | |
| A03 | Editar estado usando el catálogo de Producción y comprobar que se refleja en la vista general | PENDIENTE | |
| A04 | Dos proyectos muestran las etiquetas de estado esperadas sin duplicar estados ni reasignar cargas existentes | PENDIENTE | |
| A05 | Cambiar productor, prioridad y fecha prevista; recargar y comprobar persistencia | PENDIENTE | |
| A06 | Cambiar Fecha del evento y Código/URL SIG en Tabla; recargar y comprobar persistencia | PENDIENTE | |
| A07 | Cambiar Cliente en Tabla: color correcto, sin pérdida de otras etiquetas y con persistencia | PENDIENTE | |
| A08 | Crear, asignar, cerrar y reabrir subtareas; verificar que el total global no cuenta subtareas como cargas | PENDIENTE | |
| A09 | Calendario consolidado, filtros por productor/cliente/proyecto y resumen circular: contrastar resultados con cargas conocidas | PENDIENTE | |
| A10 | Usuarios con permiso de lectura no pueden editar; productores con permiso sí pueden; sin filtración entre proyectos | PENDIENTE | |
| A11 | Dos usuarios editan el mismo campo: no se sobrescribe información silenciosamente | PENDIENTE | |
| A12 | Tabla con múltiples páginas y filtros: sin errores runtime ni consultas excesivas | PENDIENTE | |
| A13 | Verificar carga y edición en móvil y escritorio; navegación y acciones accesibles | PENDIENTE | |
| A14 | Verificar errores de API, sesiones vencidas y mensajes recuperables sin pérdida de información | PENDIENTE | |

**Bloqueante:** cualquier falla en A02–A11 impide la liberación; A01, A12–A14 requieren corrección o aprobación documentada de desviaciones antes del despliegue.

## Gate de liberación

1. **CI verde del HEAD exacto**: métricas, contratos de backend y compilación Docker web, con sus enlaces.
2. **Pruebas de aceptación**: ejecutar A01–A14 sobre entorno de prueba aislado o instancia controlada, con registros, dos perfiles de usuario y datos conocidos. No ejecutar operaciones destructivas sobre producción para validar.
3. **Backup verificado**: registrar snapshot/restauración comprobada de base de datos y recursos persistentes relevantes, su ubicación segura, identificador y responsable. No exponer credenciales en repositorio.
4. **Inventario de despliegue**: registrar imagen inmutable/sha previa y nueva, variables de entorno y migraciones necesarias. Verificar compatibilidad y paso atrás.
5. **Aprobación explícita**: responsable de Izango autoriza con evidencia de CI, QA y backup. No habilitar publicación automática por un push de desarrollo.
6. **Despliegue controlado**: ventana autorizada, smoke test de login, lista, edición, estados, SIG, panel y permisos, más comprobación de logs.
7. **Rollback**: si falla un flujo bloqueante, revertir a la imagen anterior y restaurar datos únicamente si una migración lo exige y existe un plan probado; verificar integridad tras reversión.

## Limitaciones verificadas al 14/10/2026

- Los checks automáticos prueban compilación, métricas y contratos, **no** sustituyen las pruebas A01–A14 en navegador.
- No hay evidencia de sesión autenticada de prueba para la aplicación ni evidencia registrada de restauración de respaldo.
- No corresponde aprobar ni activar el pipeline de publicación hasta disponer de esas dos verificaciones.
- La prueba funcional debe hacerse en entorno aislado, con al menos un productor y un perfil sin permisos de edición; guardar screenshots o trazas sin datos sensibles.

## Registro de salida

- Fecha/hora: PENDIENTE
- Entorno evaluado: PENDIENTE
- Commit exacto aprobado: PENDIENTE
- CI: APROBADO para `a0f904ff`; debe repetirse para el commit exacto finalmente liberado
- Evidencia QA A01–A14: PENDIENTE
- Backup y prueba de restauración: PENDIENTE
- Aprobación responsable: PENDIENTE
- Resultado del despliegue: NO EJECUTADO
