# Corrección del flujo sobre cargas nativas — 24 de noviembre de 2026

## Estado

Publicado y verificado en el IZ-Click real el 24 de noviembre de 2026. Revisión de aplicación: `9d2f163a17feaa4b0149b1ce9f4c57f66b2971bb`. API, trabajador, planificador e interfaz utilizan esa revisión. La clave administrativa temporal se retiró al terminar y se comprobó que ya no permite entrar.

La primera publicación implementó coordinación sobre proyectos de Plane. El flujo acordado corresponde a las tareas o cargas dentro de «COTIZACIONES IZANGO». Esta corrección conecta el formulario nativo con la cola compartida; conserva el panel anterior para los enlaces históricos de sus notificaciones.

## Recorrido

1. Comercial abre Nueva tarea y completa los datos habituales. El selector de productor se oculta para una carga nueva.
2. Revisar envío presenta carga, proyecto, cliente, fechas y ambas coordinadoras. Volver a editar conserva el formulario. Enviar a coordinación crea la carga sin productor y genera un aviso interno y una entrega de correo para cada coordinadora.
3. Ambas coordinadoras abren Coordinación y cargas desde el menú lateral real. Consultan la misma cola y las tareas activas de cada productor, incluidas las asignaciones históricas nativas.
4. Coordinación asigna o reasigna. La operación actualiza el responsable nativo, registra actor e historial, y avisa a comercial y a los productores implicados. La comprobación de versión impide sobrescribir una asignación concurrente.
5. El productor actual trabaja con los comentarios, estados y archivos nativos. El productor anterior pierde la edición de la carga gestionada. Comercial y coordinación quedan suscritos a su actividad nativa.

Las tareas históricas no se convierten en solicitudes pendientes ni se reasignan. La migración 0128 añade únicamente dos tablas. Las subtareas de una carga gestionada heredan sus restricciones de acceso. Los roles de agencia y la activación siguen limitados al espacio configurado.

## Validación local

- 148 pruebas del servidor aprobadas, incluyendo 14 del ingreso de cargas: envío por el endpoint nativo, cola visible para ambas coordinadoras, avisos y entregas de correo, responsable comercial, rechazo de asignación directa, permisos, reasignación, concurrencia, recuperación transaccional, carga histórica y bloqueo de operaciones masivas no autorizadas.
- 13 pruebas de interfaz aprobadas: seis del panel anterior y siete de revisión comercial, visibilidad por rol, carga de trabajo y errores.
- Tipos de TypeScript y compilación de producción aprobados.
- El paquete compilado conserva 17 etiquetas españolas comprobadas, incluido el cambio de idioma de ida y vuelta.
- Django no detecta migraciones faltantes ni problemas de configuración en el entorno aislado.
- Ruff sin errores; OxLint sin errores (una advertencia sobre la clave de una fila del historial).

Además de las pruebas de componentes, se validó el recorrido interactivo autenticado en la copia restaurada: Paolo abrió Nueva tarea, revisó el envío con ambas coordinadoras, volvió a editar conservando el título y confirmó. María Paula recibió y asignó la carga a scavero; Angelica vio la misma carga y la reasignó a froman. Se comprobó el responsable actualizado y la presencia del historial. La tarea de ensayo quedó únicamente en la copia aislada. Los correos se prueban con transporte de memoria: no se afirma recepción en buzones reales.

## Publicación ejecutada y recuperación

- Respaldo restaurado para el ensayo: `/home/izango/izclick-automated-20261124T193819Z`.
- Migración 0128 aplicada primero a la copia; 119 tablas anteriores comparadas. Solo cambiaron los metadatos esperados de permisos y tipos de Django; las tablas de negocio conservaron su contenido.
- 136 pruebas aprobadas en PostgreSQL 15 del servidor aislado. Las 12 comprobaciones adicionales de estados históricos se ejecutaron localmente, formando las 148 pruebas locales.
- Respaldo nuevo previo al cambio real: `/home/izango/izclick-automated-20261124T194749Z`.
- Imágenes publicadas: `izclick-api:task-intake-9d2f163a17fe` y `izclick-web:task-intake-9d2f163a17fe`.
- Las 11 cuentas configuradas obtuvieron respuestas correctas de acceso, cola, cargas de trabajo y roles con la configuración real activa.
- Se conservaron los identificadores de 3 proyectos, 39 estados y 170 tareas antes y después. Los totales incluyen registros históricos y eliminados lógicamente; no representan necesariamente el contador visible de la lista.
- La página pública corresponde al artefacto validado y cuatro recursos de traducción se compararon por SHA-256. El navegador público muestra Correo electrónico y Continuar en español.
- SMTP conectado y autenticado; trabajador de entrega y recuperación periódica activos. No se enviaron correos ficticios a personas.
- Servicios aislados de ensayo detenidos, sin borrar sus datos. Túnel cerrado y claves temporales de esta intervención retiradas; las demás claves se conservaron.

La configuración completa está en `/root/izclick-task-intake-20261124/compose-command.json`. Conserva todas las capas anteriores, incluida la corrección de español. El informe de resultados está en `final-report.json` del mismo directorio.

Para recuperar la versión anterior, un administrador puede ejecutar en el servidor el siguiente procedimiento. Cambia las imágenes de aplicación; conserva las tablas nuevas, los volúmenes y los datos:

```sh
python3 - <<'PY'
import json, subprocess
from pathlib import Path
command = json.loads(Path('/root/izclick-task-intake-20261124/rollback-command.json').read_text())
subprocess.run(command, check=True)
PY
```

Para publicaciones futuras: utilizar esta cadena actual de configuración, hacer un respaldo nuevo, ensayar la migración en copia y comprobar los recursos y los permisos después del cambio. No ejecutar las operaciones antiguas de despliegue fijadas a otras versiones ni fusionar el PR #14 contra preview sin reconciliar primero la adaptación productiva.

## Cómo empezar

1. Abrir `https://izclick.izango.com.pe` y recargar con Ctrl+F5 para obtener la interfaz nueva.
2. Comercial: Nueva tarea → completar datos → Revisar envío → Enviar a coordinación.
3. Coordinación: menú lateral Coordinación y cargas → Pendientes → seleccionar productor → Asignar productor.
4. Para reasignar: pestaña Asignadas, elegir otro productor y confirmar Reasignar productor.
5. La cola comienza sin pendientes porque las tareas anteriores no se convierten automáticamente. El panel de cargas sí incluye las asignaciones activas anteriores.

El PR #14 conserva el desarrollo original en borrador; la versión instalada está en la rama `release/izclick-coordination-20261124`. Este informe corrige las instrucciones anteriores que situaban el alta comercial en proyectos.

## Límites y mantenimiento previo pendiente

La recepción en un buzón real requiere comprobar un envío de trabajo real; las pruebas no afirman haberla verificado. La instalación conserva una clave de firma predeterminada detectada antes de este cambio, documentada en el informe anterior. Su rotación requiere recifrar las configuraciones almacenadas y coordinar las sesiones; no se modificó durante esta publicación.
