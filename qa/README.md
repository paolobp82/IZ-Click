# IZ-Click — QA de navegador aislado

Este banco de pruebas ejecuta **la API y la Web de una misma imagen candidata** en contenedores desechables de GitHub Actions. Nunca se conecta a la base de datos, MinIO, credenciales, IP o dominio de producción.

## Activación controlada

1. Esperar a que **React Doctor**, **migration-preflight** y **IZ-Click Produccion build and metrics tests** estén en verde **para el HEAD del PR #4**. Este último debe haber publicado las imágenes `izclick-api:preview-clickup-<SHA>` y `izclick-web:preview-clickup-<SHA>`.
2. Añadir manualmente la etiqueta **`run-isolated-qa`** al PR #4. Ese evento ejecutará `.github/workflows/izclick-isolated-browser-qa.yml`. No se activa en cada push, para controlar el consumo de minutos de GitHub Actions.
3. Revisar los pasos y descargar el artefacto `izclick-isolated-visual-qa`. Incluye capturas y `qa-results.json`, jamás claves de sesión o datos de PostgreSQL.
4. Para repetir la prueba, quitar y volver a añadir la etiqueta. Si falla, corregir antes de avanzar; la publicación de imágenes no equivale a QA aprobado.

## Qué valida automáticamente

- Inicio de sesión con un usuario administrador ficticio y ocho cargas de ejemplo, sin datos reales.
- Posición X y ancho de Estado, Prioridad, Responsable, Vencimiento y columna personalizada a 1366 y 1920 px; tolerancia de 1.5 px.
- Menú de administración de estados disponible en encabezado y ausente dentro de cada fila.
- Editar un valor de texto, guardar, recargar y comprobar persistencia.
- Ocultar Prioridad, recargar y verificar que permanece oculta.
- El rol invitado puede consultar la Lista, pero no modificar valores personalizados.
- Capturas de la Lista de escritorio y del modo lectura.

## Gate de errores en navegador (15/10/2026)

El navegador ahora adjunta en `qa-results.json` un resumen de errores de hidratación React (incluidos #418 y #423), fallos de `intake-state` y respuestas de API 5xx. Si se detecta cualquiera de estos eventos, el job falla aunque las seis verificaciones visuales sigan pasando. Este cambio **no corrige los errores de aplicación**; evita que el QA los oculte y obliga a resolverlos antes de aprobar el PR.

Un commit nuevo exige primero publicar ambas imágenes candidatas correspondientes al **mismo SHA** y volver a ejecutar el QA; los seis PASS anteriores no certifican el nuevo HEAD.

## Restricciones y seguridad

- Servicios `qa-*` aislados dentro de la red efímera de Docker; sin volúmenes de producción.
- El proxy solo publica `127.0.0.1:38080` en la máquina temporal de GitHub.
- Las credenciales y sesiones creadas duran únicamente durante el job; el `down --volumes` final elimina los contenedores y datos.
- No hay conexión SSH a Contabo ni despliegue automático.
- El workflow consume minutos de GitHub Actions, que **pueden ser facturables** dependiendo de la cuota del repositorio; comprobar disponibilidad antes de añadir la etiqueta.
- El dataset de ocho cargas **es ficticio**. No demuestra integridad de las ocho cargas reales. Esa verificación requiere un procedimiento adicional con respaldo/snapshot verificado y acceso autorizado al entorno correspondiente.

## Criterios que siguen requiriendo QA visual humano

Superposiciones con todos los menús (Estado, Prioridad, Responsable, Cliente, SIG), contraste, redimensionamiento manual, scrolling horizontal, comportamiento en pantalla reducida, detalle con adjuntos/comentarios, paginación, selección múltiple, conservación de las **ocho cargas reales** y plan probado de recuperación.

**No aprobar PR ni desplegar producción basándose únicamente en este workflow.**
