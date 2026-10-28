# Archivos en los comentarios de IZCLICK

El clip del comentario compacto estaba conectado al comando de insertar imagen. Ahora abre un selector general de archivos (selección múltiple), sube cada archivo por la API de comentarios e inserta un enlace de descarga autenticado en el borrador. El usuario puede enviar un comentario compuesto solamente por archivos. El envío y nuevas selecciones se bloquean mientras sube un archivo, y los errores conservan el borrador. Se respeta el límite de tamaño publicado por la instancia.

La API de archivos de comentario admite los mismos tipos que la política de adjuntos existente (PDF, documentos Office, CSV, TXT, ZIP, imágenes, etc.). Avatares y portadas conservan su validación de imagen. Los tipos no admitidos siguen rechazándose. El contenido se descarga por el endpoint autenticado con disposición attachment. La subida general de la tarea sigue disponible.

Los archivos de texto no tienen una firma binaria: se usa el MIME del navegador o application/octet-stream si no existe, sujeto a la política del servidor. Los contenedores antiguos de Office mantienen su MIME específico cuando se reconoce el contenedor CFB y el navegador identifica Word/Excel/PowerPoint.

Las subidas anteriores a guardar el comentario usan identificador nulo. Después de guardar, el lote se vincula al ID del comentario creado, no al ID de la tarea. Los nombres de archivo se escapan al insertar el enlace. Los enlaces permanecen después de recargar.

QA: MIME/permisos/portadas con Django, nombres y enlaces con Node, y seis archivos reales (PDF, DOCX, XLSX, ZIP, CSV y TXT) seleccionados desde el clip, enviados, recargados y descargados con comparación de bytes. No se considera desplegado hasta aplicar las imágenes aprobadas en el VPS.
