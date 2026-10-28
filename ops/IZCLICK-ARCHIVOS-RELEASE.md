# IZCLICK — archivos en el clip del comentario

Esta entrega permite seleccionar varios documentos desde el clip del comentario y enviarlos como enlaces de descarga autenticados. Admite los tipos de la política de adjuntos existente, incluidos PDF, Office, TXT, CSV, ZIP e imágenes. Conserva el límite de tamaño configurado y los controles de acceso actuales. El clip espera al editor y no se permite enviar el comentario durante una subida. Los errores conservan el borrador.

## Aplicación certificada

- Fuente: 5aad31537ad28daee7b2519092883bf3a291e7aa.
- API/worker: ghcr.io/paolobp82/izclick-api@sha256:99ec744fc3c1a1d5a1c835495c46f5a95a1cf63c0dc94b94fd6f56cef9af3ff8.
- Web: ghcr.io/paolobp82/izclick-web@sha256:cb250218bdc575b3e9f85b35e28b7c1bba965b7c9bb344d7a055f215203ac93e.
- Pruebas de código, permisos y compilación: https://github.com/paolobp82/IZ-Click/actions/runs/40786363006.
- Subida real desde el clip, envío, asociación al comentario, recarga y descarga byte por byte de PDF, DOCX, XLSX, ZIP, CSV y TXT: https://github.com/paolobp82/IZ-Click/actions/runs/40786362968.

La API deriva de la entrega de estados aprobada (bba165ee), conservando la corrección de Completado, edición de estados nativos, segmentos, correo y seguridad existentes. La modificación del módulo de archivos está limitada a admitir documentos en COMMENT_DESCRIPTION y normalizar el ID vacío del borrador. Avatares y portadas mantienen su validación de imágenes. Los archivos enviados se asocian al ID del comentario guardado, no al ID de la tarea. No se añade ninguna migración.

## Instalación administrativa

Ejecutar el archivo ops/izclick-archivos-release.py de la revisión exacta proporcionada, desde la consola del VPS:

    sudo python3 /tmp/izclick-archivos-release.py --apply

Sin --apply realiza únicamente el preflight. Admite ocho combinaciones aprobadas, incluida la entrega de estados 52b8909 (API bba165ee / Web edc318f4), y conserva la comprobación de versiones. Si cambia la instalación, imprime solo las imágenes/revisión y se detiene antes de modificar servicios. El mismo candado impide ejecutar esta actualización mientras otro instalador esté activo.

Valida respaldo y revisión de candidatos, conserva configuración efectiva y recrea solo API/worker/Web. Verifica HTTP y worker; revierte las imágenes anteriores si falla, sin restaurar la base de datos ni borrar archivos de usuarios. Aplica como máximo la migración 0125 ya revisada si estuviera pendiente; rechaza otros planes antes de escribir. El override informado debe incluirse en operaciones Compose posteriores.

Los 14 ensayos de protección del instalador se ejecutan con:

    python3 -m unittest discover -s ops/tests -p test_archivos_release.py -v

Después de release_applied, recargar IZCLICK, abrir una tarea, pulsar el clip del comentario y seleccionar un documento. Enviar el comentario, recargar y descargar el archivo desde su enlace. No es necesario cargar nuevamente el catálogo de estados.

La prueba de navegador usa exclusivamente una instancia y almacenamiento ficticios. Su bucket admite GET/HEAD/POST y el proxy conserva el POST al bucket sin redirecciones por barra final; esto no modifica el almacenamiento del VPS. Los archivos se suben en orden, usando el servicio nativo con su identificador de cancelación compartido.
