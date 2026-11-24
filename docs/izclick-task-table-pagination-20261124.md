# Orden y páginas de la tabla de cargas

Implementación preparada; pendiente de validación en navegador con la copia del servidor y publicación. La clave administrativa temporal se retiró al terminar la publicación anterior y se solicitó habilitarla de nuevo. Este documento no confirma un cambio en producción.

La tabla de cargas de cada proyecto abre por defecto con las más recientes primero. El servidor recibe el orden descendente de creación y el cursor de la página solicitada; no se limita a reordenar una colección parcial descargada. Se muestran como máximo 50 cargas principales por página. Las subtareas siguen accesibles bajo su carga y no se repiten como filas principales.

El pie muestra el rango, el total, números de página y Anterior/Siguiente. La numeración de filas continúa entre páginas. Los filtros se conservan al navegar y un cambio de filtros vuelve a la primera página. La tabla conserva la ordenación manual por columnas durante la sesión. Las operaciones de selección se limitan a las filas de la página visible. Se desactiva la carga automática al desplazarse en esta tabla; las otras vistas conservan su comportamiento.

Validación local:

- 18 pruebas de interfaz aprobadas, incluidas cinco del contrato de paginación y los controles numerados.
- Dos pruebas con PostgreSQL y el endpoint nativo aprobadas: 55 cargas repartidas en páginas de 50 y 5, orden global descendente, ausencia de solapamiento, subtareas excluidas, filtros por estado y regreso a la primera página.
- Tipos de TypeScript y compilación web aprobados; comprobación de 17 etiquetas españolas sobre el paquete compilado aprobada.
- El cambio no requiere migraciones ni modificación del backend productivo.

Publicación prevista: ensayar el artefacto en navegador contra la API de la copia aislada; publicar únicamente la imagen web conservando la cadena completa de configuración de la publicación de tareas nativas; comprobar por SHA-256 los recursos publicados y que API, trabajador y planificador mantienen sus imágenes. Conservar la imagen web anterior y la orden de recuperación. No crear tareas ficticias en producción.
