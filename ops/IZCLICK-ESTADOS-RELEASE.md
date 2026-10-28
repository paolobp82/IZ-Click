# IZCLICK — catálogo de 20 estados por segmentos

Esta revisión corrige el instalador inicial, que no incluía las actualizaciones aplicadas después del botón único Estados. Conserva las correcciones cf52fc5: edición y eliminación de todos los estados de Plane, modales inmediatos y check que usa Completado, nunca Aprobada.

La aplicación añade los estados de la imagen del 28 de octubre de 2026 bajo cinco segmentos. Cada estado mantiene su nombre y color editables. La acción administrativa «Cargar los 20 estados de Izango» agrega los faltantes en una transacción y no elimina ni reasigna tareas. Si un estado coincidente ya existe, conserva su identidad, nombre y color, y ajusta el segmento solicitado. Los estados personalizados previos siguen disponibles.

## Versión probada

- Fuente de aplicación: 52b8909d2e6e0559dd12bcca5f2251418ca08a9f.
- Compilación, TypeScript, 73 pruebas Node, 7 contratos, 59 pruebas Django y adjuntos: https://github.com/paolobp82/IZ-Click/actions/runs/40731491645.
- Compatibilidad de migraciones: https://github.com/paolobp82/IZ-Click/actions/runs/40731491256.
- QA autenticado y publicación de las imágenes exactas: https://github.com/paolobp82/IZ-Click/actions/runs/40731491149.
- API y worker: ghcr.io/paolobp82/izclick-api@sha256:bba165ee2439f6cf0659ff82da9cb335702fbbbdb002b2cf3de442d30aba95e5.
- Web: ghcr.io/paolobp82/izclick-web@sha256:edc318f43e01b4aed858a1192d8e8736c48ee54955d2b144b651b0985dab71ca.

El commit de herramientas de despliegue puede ser posterior a la fuente de aplicación. El instalador siempre verifica el digest y la revisión de origen de las imágenes probadas.

## Aplicación en el VPS

El enlace automatizado disponible admite operaciones fijas anteriores. Ejecutar el archivo ops/izclick-estados-release.py desde una revisión exacta en la consola administrativa del VPS. Python estándar, Docker Compose y curl son los mismos requisitos que en los despliegues previos.

    sudo python3 /tmp/izclick-estados-release.py

El modo sin argumentos hace preflight sin descargar imágenes, migrar ni recrear servicios. Para instalar:

    sudo python3 /tmp/izclick-estados-release.py --apply

Se admiten solamente siete pares de imágenes certificados: Sprint 1, sprints 2–4 originales, la corrección de eliminación de estados, el botón único Estados y las tres actualizaciones posteriores aplicadas el 27 de octubre sobre la API 7ee89ac. Se incluye la Web cf52fc5 (fc24a5b) del último despliegue registrado. La base del botón único tiene evidencia en https://github.com/paolobp82/IZ-Click/actions/runs/40573891738. Los tres servicios deben corresponder a un mismo par aprobado, incluidas las combinaciones legítimas de API conservada y actualización solo de Web; mezclas o versiones desconocidas detienen la operación antes de escribir.

El script descarga los candidatos fijados, valida su revisión, conserva entorno/comandos/montajes/redes/recursos, guarda un respaldo privado y verifica el archivo pg_dump. Aplica como máximo la migración 0125 ya revisada, si estuviera pendiente; no se añade ninguna migración de esquema para el catálogo. Rechaza planes adicionales o inversos antes de escribir. Recrea solo API, worker y Web, verifica configuración, HTTP y respuesta del worker. Ante un fallo posterior revierte sus imágenes anteriores sin restaurar ni borrar trabajo de usuarios. Informa descargas, respaldo, migración y arranque. El override indicado en active_override debe acompañar futuras operaciones Compose.

Después de release_applied, recargar IZCLICK y entrar a **Estados → Cargar los 20 estados de Izango** con una cuenta administradora del espacio. La instalación de imágenes no carga datos automáticamente en ningún espacio de trabajo. Luego comprobar los cinco segmentos y editar un nombre y un color en el modal; recargar y confirmar que se conservan y que otro estado no cambia.

Los 14 ensayos de herramientas se ejecutan con:

    python3 -m unittest discover -s ops/tests -p test_estados_release.py -v

Simulan Docker; las pruebas de la aplicación usan PostgreSQL y navegador reales sobre datos ficticios. Las imágenes están preparadas para producción únicamente después del QA aprobado; el cierre de producción requiere la salida release_applied y la comprobación autenticada posterior.

Si se encuentra otra versión, baseline_unrecognized informa exclusivamente imágenes y revisión de los tres servicios, sin variables de entorno ni credenciales, y se detiene antes de cualquier modificación.
