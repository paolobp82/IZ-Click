# Sprint 1 — despliegue preparado, pendiente de ejecución en el VPS

Las imágenes de aplicación aprobadas son las del commit 1d014c2fb2f5a198c90e4d800c80cd9409a3db4f. Las pruebas autenticadas, el worker real y la publicación están aprobados en https://github.com/paolobp82/IZ-Click/actions/runs/40013749312.

El script de esta carpeta fija los digest de API/worker y Web; no admite sustituirlos por tags. Se construyó la API sobre el digest reparado de producción, cambiando solamente el crawler y su vista de enlaces.

## Límite del acceso existente

La clave SSH usada por GitHub está restringida a un dispatcher del VPS. Los comandos de despliegue instalados apuntan a versiones anteriores. Cambiar un workflow de GitHub no instala una nueva operación de root en el VPS.

No retirar la restricción de SSH ni ampliar sudoers. Un administrador debe revisar y ejecutar el script desde la consola del VPS. No ejecutar código remoto mediante una tubería a sudo.

## Revisión previa

Revisar ops/izclick-sprint1-release.py y ejecutar sus diez pruebas de simulación:

    python3 -m unittest discover -s ops/tests -p test_sprint1_release.py -v

Estas pruebas comprueban configuración, credenciales literales, baseline, respaldo fallido, secuencia de despliegue y rollback. No sustituyen una ejecución con Docker Compose real en el VPS.

Guardar el script revisado en /tmp/izclick-sprint1-release.py y ejecutar:

    sudo python3 /tmp/izclick-sprint1-release.py

El modo predeterminado no recrea contenedores ni escribe datos de aplicación. Comprueba las imágenes API/Web conocidas, identifica el worker realmente ejecutado y valida montajes/redes del Compose. La salida preflight contiene worker_image, sin credenciales. Compartir esa salida para revisar el worker antes de aplicar.

Si las imágenes o la configuración difieren de la base revisada, el script se detiene. No corregir el error cambiando constantes para saltarse la comprobación.

## Aplicación después de revisar el worker

    sudo python3 /tmp/izclick-sprint1-release.py --apply --expected-worker-image sha256:ID_REVISADO

El script:
- Descarga los dos digest aprobados y comprueba su revisión de origen.
- Conserva las variables, comandos y recursos del runtime. Usa los archivos Compose referenciados por el API real y comprueba que montajes/redes y entorno coincidan.
- Guarda configuración privada, variables y un pg_dump validado. No respalda los objetos de adjuntos en esta operación porque no los modifica; no borra ni recrea sus volúmenes.
- Recrea exclusivamente api, worker y web, sin dependencias ni migraciones.
- Verifica imágenes, entorno, comandos, recursos, configuración de seguridad, HTTP estable y respuesta del worker actualizado.
- Ante un error posterior al cambio, restaura las tres imágenes previas y comprueba recuperación HTTP. No restaura la base de datos ni revierte trabajo de usuarios.
- Deja el nuevo override como active_override. Las futuras operaciones Compose deben incluirlo; usar solamente los archivos viejos revertiría las imágenes. El rollback-command.json privado guarda el comando exacto de reversión.

El ping del worker asume el nombre predeterminado celery@hostname. Un worker con nombre personalizado requiere adaptar y revisar esa comprobación antes de aplicar.

## Cierre después de aplicar

La salida release_applied confirma verificaciones de infraestructura; aún se debe comprobar con una cuenta autorizada en producción:
1. Guardar/recargar una fecha de evento de una tarea de ensayo autorizada.
2. Expandir una tarea con subtareas sin duplicados.
3. Abrir vista previa y descargar un adjunto existente con permisos adecuados.

No crear usuarios ficticios, borrar tareas reales ni reconstruir fechas perdidas. No declarar el sprint desplegado hasta obtener release_applied y verificar los flujos.

