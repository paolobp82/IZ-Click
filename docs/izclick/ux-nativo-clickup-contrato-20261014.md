# IZ-Click Producción — Contrato UX nativo (referencia ClickUp)

## Fuente de requisitos
Presentación del usuario `cambios en plane(1).pptx` (9 láminas, 14/10/2026), y capturas de aceptación del piloto del mismo día. **No** interpretar cada "proyecto" de negocio como un proyecto técnico independiente de Plane.

## Errores del piloto anterior
1. La ruta Cargas tenía un botón `Control de cargas / Abrir vista clásica` que renderizaba dos interfaces con comportamientos diferentes. **No aprobado.**
2. Estados se configuraban como presets de seis estados dentro de cada proyecto Plane. **No aprobado:** deben poder crearse, renombrarse, colorearse y ordenarse desde un catálogo único de Producción, sin repetir configuración de manera manual por proyecto.
3. Las propiedades adicionales se editaban fuera de la ficha y de la tabla nativas. **No aprobado.**

## Arquitectura de producto obligatoria

### 1. Una sola ruta y modelo de carga
- `/WORKSPACE/projects/PROJECT/issues/` se apoya **exclusivamente** en `ProjectLayoutRoot`, `useIssues` y los permisos/operaciones nativos de Plane.
- Cinco modos: Lista, Tabla, Tablero, Calendario, Gantt. Usar `EIssueLayoutTypes` y `issuesFilter`; mismo issue y cambios visibles al alternar vistas.
- Las subtareas siguen siendo nativas y el identificador mostrado es `sequence_id`; UUID y código nativo permanecen intactos en base de datos y enlaces.
- No duplicar issues, ni renderizar `ProductionProjectPanel` en esta ruta.

### 2. Estados compartidos, **no** estados configurados por proyecto
- Un catálogo **del espacio de Producción** con lista ilimitada de estados, colores, grupo, orden y estados activos. Referencia: lámina 2 con lista desplegable y botón para crear estados.
- No usar `PRODUCTION_STATES` ni `ProductionStatesSetup` como fuente definitiva.
- Implementación pendiente (requiere backend + migración): catálogo central persistente por workspace y correspondencia con `State` de Plane, que internamente exige un `project_id`. El usuario no tendrá que sincronizar manualmente proyecto por proyecto. Nuevas cargas y nuevos proyectos deben recibir el mismo catálogo. Toda escritura debe validar rol admin de workspace; productores eligen estados sin gestionar el catálogo.
- Regla de migración: no renombrar/eliminar estados existentes ni reasignar cargas sin mapeo confirmado y respaldo probado. En versiones de transición, los estados actuales permanecen utilizables y pueden mapearse gradualmente.
- Estados mostrados en referencia como ejemplos, **no** lista rígida: Por cotizar, Armando PPTO en ERP, Enviado a comercial, Enviado a cliente, Aprobado por cliente, En seguimiento, Por iniciar, Completado. Deben permitir nuevos nombres sin publicar código.

### 3. Columnas y ficha editables
- Campos que deben vivir en vistas nativas y/o sidebar estándar: cliente (opciones con colores compartidas), productor/asignados, prioridad, estado, fecha prevista, fecha del evento, código SIG, enlace SIG.
- `Fecha del evento` y `Código/Enlace SIG` están guardados en metadatos de `IssueLink` ya existentes, NO crear una segunda tabla para esos mismos valores.
- Todo campo que aparece en una tabla debe poder editarse usando el servicio nativo o un editor de propiedad nativo. El selector de columnas define visibilidad, no crea columnas de base de datos.
- El detalle de carga usa `IssueDetailRoot` y su sidebar para subtareas, descripción, archivos, responsables, prioridades y los campos IZ-Click.

### 4. Resumen transversal
- Un punto de navegación separado de **Control de Producción** presenta agregados por productor, cliente, estado y proyecto. No duplicar la vista principal ni las cargas.
- KPIs y gráficos excluyen subtareas del total y cumplen permisos de Plane.

## Entregas y QA
- **Fase A en rama**: retirar interfaz dual; activar pestañas de layouts nativos; número visible sin prefijo; añadir fecha del evento y SIG al sidebar de la carga; ejecutar CI. Sin despliegue.
- **Fase B**: estados del espacio de Producción con persistencia, roles y propagación transaccional; migración y pruebas en instancia aislada. Sin tocar los estados operativos existentes.
- **Fase C**: cliente como selector común de colores; columnas nativas de tabla; agregado global; traducciones restantes; pruebas por rol.
- **Aceptación**: productores pueden cambiar estados/campos en lista, tabla, tablero y ficha. Cambios visibles en otras vistas sin recargar; datos y links persisten; global coherente; se comprueba rollback.
- Prohibido despliegue directo desde este documento; primero CI, migraciones/backups y prueba funcional real.
