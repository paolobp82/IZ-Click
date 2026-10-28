# IZCLICK — entrega de sprints 2, 3 y 4

La implementación está en el PR #9. La publicación de imágenes no modifica producción. El despliegue se ejecuta desde la consola administrativa del VPS porque el enlace SSH de GitHub mantiene operaciones fijas de versiones anteriores.

## Evidencias aprobadas

- Aplicación: ddf139ee3ab4d162d14374504064f08655872a56.
- Pruebas de lógica, Django, componente y compilación: https://github.com/paolobp82/IZ-Click/actions/runs/40031500162.
- Compatibilidad de campos y migraciones: https://github.com/paolobp82/IZ-Click/actions/runs/40031500182.
- QA autenticado, cola real, integridad de diez tareas ficticias y publicación: https://github.com/paolobp82/IZ-Click/actions/runs/40031500200.
- API/worker: ghcr.io/paolobp82/izclick-api@sha256:670399dcf3f2b82e3e0fabff8751a41aa8b4b9eeac4514aef6125746a0895e6b.
- Web: ghcr.io/paolobp82/izclick-web@sha256:ff0295abd104f8aac005424bf188d8b1d43eddb1c0b0de52bb496ee40e1195cf.

## Imágenes y verificación

El script final fija digest y revisión de imágenes aprobadas en QA autenticado. Verifica como base las imágenes API/worker y Web del Sprint 1 que el administrador confirmó desplegado. No necesita volver a copiar el ID del worker: los tres digest de base ya están conocidos y se verifican.

Antes de instalarlo, revisar ops/izclick-sprints234-release.py. El script funciona con Python estándar en el VPS; no necesita instalar paquetes Python. Los ensayos de respaldo, conservación de configuración, detención ante migraciones inesperadas, actualización de tres servicios y rollback se ejecutan con:

    python3 -m unittest discover -s ops/tests -p test_sprints234_release.py -v

Estas doce pruebas simulan Docker. El QA de la aplicación usa Docker y PostgreSQL reales en un entorno aislado.

## Ejecución

Guardar el script de la revisión exacta proporcionada en /tmp/izclick-sprints234-release.py. El modo sin argumentos hace una comprobación sin recrear servicios:

    sudo python3 /tmp/izclick-sprints234-release.py

Para aplicar las imágenes aprobadas:

    sudo python3 /tmp/izclick-sprints234-release.py --apply

La operación:

1. Verifica API, worker y Web frente a los digest del Sprint 1. Si cambiaron, se detiene.
2. Descarga las dos imágenes fijadas y valida su revisión de origen.
3. Conserva entorno, comandos, recursos, montajes y redes actuales a partir del runtime. Guarda configuración privada y un pg_dump validado.
4. Usa la imagen candidata para aplicar exclusivamente db.0125_izclick_assignment_fields. Rechaza planes con migraciones adicionales o hacia atrás antes de escribir. El cambio añade la opción de campo member al estado de migraciones; no transforma ni borra valores existentes.
5. Informa las descargas, el inicio del respaldo y la migración. Recrea exclusivamente API, worker y Web. Muestra services_recreating y readiness durante el arranque.
6. Verifica imágenes, configuración, HTTP y respuesta del worker actualizado. Ante un fallo revierte las imágenes; no restaura la base de datos ni revierte trabajo de usuarios. La migración 0125 se conserva por ser compatible con las tablas y valores anteriores.

El override informado en active_override debe incluirse en futuras operaciones Compose. Usar únicamente los archivos antiguos puede volver a instalar versiones anteriores. El respaldo contiene rollback-command.json para revertir las tres imágenes exactas.

## Verificación de cierre

Después de release_applied, recargar IZCLICK y comprobar con una cuenta autorizada:

- Crear una tarea con cliente y miembros elegidos antes de guardar.
- Completar/reabrir tarea y subtarea; recargar y confirmar estado y tachado.
- Guardar comercial y una columna de asignación a miembro.
- Abrir Estados y Por productor. La eliminación de estados requiere un destino explícito y permisos administrativos; el despliegue no elimina estados automáticamente.
- Revisar comentarios y actividad con scroll independiente, y volver a comprobar fecha de evento/adjuntos del Sprint 1.

Los sprints se consideran aplicados solo después de la salida release_applied. La verificación autenticada en producción continúa siendo necesaria; los ensayos de CI usan datos ficticios.
