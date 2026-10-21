# IZ-Click — evidencia de rendimiento del VPS, 21 de octubre de 2026

## Solicitud para Contabo

Solicito revisar el rendimiento efectivo del VPS vmi3662004, IP 209.145.60.238
(4 vCPU, aproximadamente 8 GB RAM), y la disponibilidad de CPU y latencias en
su nodo físico. La aplicación presenta demoras intermitentes y errores 502.
Todavía no hemos establecido que el origen sea el hipervisor.

Mediciones realizadas desde el propio VPS:

- `docker inspect` para consultar únicamente la dirección de un contenedor tardó
  16,4004 segundos.
- Una petición HTTP directa a la API en la red privada, sin proxy ni DNS público,
  tardó 4,794 s; otras dos tardaron 0,778 s y 0,333 s.
- La misma ruta pasando por el proxy HTTPS local tardó 3,056 s y 0,488 s; otra
  agotó su límite de 12 segundos. Las muestras fueron secuenciales y alternaron
  el orden; no permiten calcular por resta el coste del proxy.
- El tiempo de ejecución total de algunas órdenes excede el tiempo HTTP interno:
  una petición de 0,333 s ocupó 2,565 s de ejecución de la orden.
- PSI CPU `some`: avg10 entre 52,56 y 66,76%, avg60 entre 51,39 y 55,85%,
  avg300 entre 49,26 y 50,47% en esa serie. Es tiempo con tareas esperando CPU,
  no porcentaje de utilización de CPU.
- Una muestra anterior de vmstat mostró CPU mayormente desocupada, sin swap y
  steal=0. Esta diferencia requiere interpretación; no demuestra por sí sola
  sobreventa ni un fallo del hipervisor.
- Los procesos inspeccionados tienen afinidad 0-3, prioridad normal y ningún
  límite finito de cpu.max ni eventos de throttling en sus cgroups/ancestros.
- Aproximadamente 5,9 GB de RAM disponibles, disco al 11%, sin OOM ni reinicios
  del contenedor API. PostgreSQL no mostraba saturación de conexiones en la muestra.
- Se registraron al menos ocho WORKER TIMEOUT de Gunicorn durante la incidencia
  y errores 502/EOF en el proxy. Tres capturas de las pilas de ambos trabajadores
  mostraron espera normal del bucle asyncio, no una función de negocio atascada;
  no estaban sincronizadas con el fallo y no excluyen bloqueos intermitentes.

Por favor, revisen desde el hipervisor la planificación/disponibilidad efectiva de
vCPU y el rendimiento del nodo y del almacenamiento. Indiquen si detectan contención,
restricciones externas a los cgroups del huésped o pausas de la VM y qué acción
recomiendan. Coordinen cualquier reinicio o migración que implique interrupción.

## Estado de la aplicación

El DNS autoritativo fue corregido el 21 de octubre. La API personalizada está
desplegada y sus pruebas transaccionales de estados pasaron conservando los datos
existentes. La recuperación de rendimiento y la creación/persistencia de un
estado desde el navegador siguen pendientes. Este informe no da por resuelta la
incidencia ni atribuye una causa definitiva al proveedor o a la aplicación.
