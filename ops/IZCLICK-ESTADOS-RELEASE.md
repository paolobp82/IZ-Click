# IZCLICK — catálogo de 20 estados por segmentos

La aplicación añade los estados de la imagen del 28 de octubre de 2026 bajo cinco segmentos. Cada estado mantiene su nombre y color editables. La acción administrativa «Cargar los 20 estados de Izango» agrega los faltantes en una transacción y no elimina ni reasigna tareas. Si un estado coincidente ya existe, conserva su identidad, nombre y color, y ajusta el segmento solicitado. Los estados personalizados previos siguen disponibles.

## Versión probada

- Fuente de aplicación: 9fe8324a9c2e3d927b54056513be52ba5c0684d4.
- Compilación, TypeScript, 72 pruebas Node, 7 contratos, 49 pruebas Django y adjuntos: https://github.com/paolobp82/IZ-Click/actions/runs/40723279792.
- Compatibilidad de migraciones: https://github.com/paolobp82/IZ-Click/actions/runs/40723279808.
- QA autenticado y publicación de las imágenes exactas: https://github.com/paolobp82/IZ-Click/actions/runs/40723279790.
- API y worker: ghcr.io/paolobp82/izclick-api@sha256:f1a1e1cfb94d4b524dd63d2d279357812c58dd59b327c8470cc319a7173fcb54.
- Web: ghcr.io/paolobp82/izclick-web@sha256:a3ebde7c919876d31cb92f6902ee0f13c4433d304bf596cdf22cbff5ae7f5d77.

El commit de herramientas de despliegue puede ser posterior a la fuente de aplicación. El instalador siempre verifica el digest y la revisión de origen de las imágenes probadas.

## Aplicación en el VPS

El enlace automatizado disponible admite operaciones fijas anteriores. Ejecutar el archivo ops/izclick-estados-release.py desde una revisión exacta en la consola administrativa del VPS. Python estándar, Docker Compose y curl son los mismos requisitos que en los despliegues previos.

    sudo python3 /tmp/izclick-estados-release.py

El modo sin argumentos hace preflight sin descargar imágenes, migrar ni recrear servicios. Para instalar:

    sudo python3 /tmp/izclick-estados-release.py --apply

Se admiten solamente cuatro pares de imágenes certificados: Sprint 1, sprints 2–4 originales, la corrección de eliminación de estados y el botón único Estados. La última base tiene evidencia en https://github.com/paolobp82/IZ-Click/actions/runs/40573891738. Los tres servicios deben corresponder a un mismo par; mezclas o versiones desconocidas detienen la operación antes de escribir.

El script descarga los candidatos fijados, valida su revisión, conserva entorno/comandos/montajes/redes/recursos, guarda un respaldo privado y verifica el archivo pg_dump. Aplica como máximo la migración 0125 ya revisada, si estuviera pendiente; no se añade ninguna migración de esquema para el catálogo. Rechaza planes adicionales o inversos antes de escribir. Recrea solo API, worker y Web, verifica configuración, HTTP y respuesta del worker. Ante un fallo posterior revierte sus imágenes anteriores sin restaurar ni borrar trabajo de usuarios. Informa descargas, respaldo, migración y arranque. El override indicado en active_override debe acompañar futuras operaciones Compose.

Después de release_applied, recargar IZCLICK y entrar a **Estados → Cargar los 20 estados de Izango** con una cuenta administradora del espacio. La instalación de imágenes no carga datos automáticamente en ningún espacio de trabajo. Luego comprobar los cinco segmentos y editar un nombre y un color; recargar y confirmar que se conservan y que otro estado no cambia.

Los 14 ensayos de herramientas se ejecutan con:

    python3 -m unittest discover -s ops/tests -p test_estados_release.py -v

Simulan Docker; las pruebas de la aplicación usan PostgreSQL y navegador reales sobre datos ficticios. Las imágenes están preparadas para producción únicamente después del QA aprobado; el cierre de producción requiere la salida release_applied y la comprobación autenticada posterior.
