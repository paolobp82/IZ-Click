# IZ-Click: coordinación, roles y notificaciones

Fecha: 16 de noviembre de 2026. Rama: `feature/izclick-role-assignment-notifications`. PR: [#14](https://github.com/paolobp82/IZ-Click/pull/14), contra `preview`.

## Alcance implementado

- Roles de comercial, coordinación y producción independientes de los permisos administrativos de Plane. El superadministrador conserva sus funciones. Cambiar un rol registra el rol anterior y el nuevo, sin borrar identidades, membresías ni asignaciones.
- Alta desde la interfaz existente y desde el nuevo panel. Conserva los identificadores de proyectos y agrega cliente, descripción, fechas y comercial de origen. Los nuevos proyectos entran en una cola compartida; no se escoge coordinador.
- Asignación y reasignación transaccionales. Bloqueo del proyecto y comprobación de productor anterior y versión impiden sobrescrituras silenciosas, incluida una reasignación que termine otra vez en el productor original. Se registra actor, fecha y responsables anterior/nuevo.
- Panel `/{workspaceSlug}/coordination/`: proyectos pendientes/asignados, cargas por productor, clientes, fechas, vencidos y entregas en siete días, edición de estado y cotización, comentarios e historial. La lista normal también expone el productor responsable.
- Lectura de proyectos de la agencia para los roles verificados. Escritura para coordinación, superadministración y productor actualmente asignado. Un productor anterior pierde la escritura aunque su membresía histórica se conserve. Solo superadministración cambia roles comerciales. Los roles comerciales no conceden administración del espacio.
- Eventos de proyecto creado, asignación, reasignación, estado, comentario y cotización creada/actualizada. Se reutilizan las notificaciones internas de Plane, incluyendo lectura y contador, y su configuración SMTP y plantilla de correo.
- Bandeja persistente de correos: un registro por notificación, envío después de confirmar la transacción, reintentos con espera creciente, recuperación periódica y `Message-ID` estable. Fallar el correo no revierte el cambio de negocio. Los enlaces apuntan al proyecto concreto; los eventos de cotización incluyen su enlace directo.
- Migraciones aditivas `0123` y `0124`. No se convierten proyectos históricos en pendientes ni se generan avisos históricos. No se modificó producción.

El estado, los comentarios y la cotización de este panel pertenecen al **proyecto**. Los estados y comentarios de tareas conservan el circuito existente de Plane, para evitar duplicar sus avisos con otro circuito de eventos.

## Validación reproducible

Resultados locales de esta entrega:

| Comprobación                                       | Resultado                                                 |
| -------------------------------------------------- | --------------------------------------------------------- |
| Pruebas de backend, integración y correo existente | 55 aprobadas                                              |
| Pruebas de interfaz por rol                        | 6 aprobadas                                               |
| Comprobación de Django                             | Sin incidencias                                           |
| Migraciones de esquema en PostgreSQL 17 aislado    | Aplicadas correctamente                                   |
| Modelos frente a migraciones                       | Sin cambios pendientes                                    |
| Ruff sobre `plane`                                 | Aprobado                                                  |
| Tipos del frontend completo                        | Aprobado                                                  |
| Compilación de la aplicación web                   | Aprobada                                                  |
| Lint del frontend                                  | 0 errores; 538 advertencias del conjunto de la aplicación |

Pytest emitió avisos por el directorio de archivos estáticos no recopilados en el entorno de pruebas. La compilación y los tipos muestran avisos de configuración ya existentes de Vite y del paquete Tailwind. Estos avisos no impidieron las comprobaciones.

Las pruebas de negocio se ejecutan con PostgreSQL 17 en una instancia local vacía y separada de cualquier servicio existente. Las pruebas de correo usan un transporte en memoria o simulan la respuesta SMTP; no envían correos a personas reales.

Comandos del backend, desde `apps/api`, con variables que apunten exclusivamente al entorno de pruebas:

```bash
uv sync --locked
uv run python manage.py check --settings=plane.settings.test
uv run python manage.py migrate --noinput --settings=plane.settings.test
uv run python manage.py makemigrations --check --dry-run --settings=plane.settings.test
uv run ruff check plane
uv run pytest plane/tests/test_izclick*.py plane/tests/unit/bgtasks/test_izclick_email_pipeline.py -q
```

Comandos del frontend, desde la raíz:

```bash
pnpm install --frozen-lockfile
pnpm --filter web test:coordination
pnpm turbo run build --filter=web
pnpm --filter web check:types
pnpm --filter web check:lint
```

La comprobación automática `IZ-Click coordination checks` ejecuta pruebas y migraciones sobre servicios desechables de GitHub Actions. No contiene ningún paso de publicación ni usa credenciales de producción.

Cobertura de aceptación: cola compartida entre dos coordinadores; carrera concurrente real; asignación obsoleta; versiones; permisos; acceso entre espacios; productor anterior; lectura de proyectos privados; alta real; ausencia de duplicados y de avisos por cambios idénticos; comentarios; cotizaciones inseguras; fechas; carga y vencimientos; historial de roles; manifiesto verificado; transacciones revertidas; fallo y reintento SMTP; enlaces y `Message-ID`; visualización por rol.

## Pasos para publicar

1. Revisar el PR y sus comprobaciones. Mantener la publicación como una acción independiente: no fusionar ni desplegar automáticamente por esta entrega.
2. Preparar un entorno de ensayo con base y almacenamiento separados y destinatarios de correo de prueba. Obtener respaldo y comprobar su restauración antes de cualquier intervención futura en producción.
3. Publicar backend, worker y planificador del mismo commit con `IZCLICK_COORDINATION_ENABLED=0`; aplicar las migraciones con el procedimiento habitual. La variable debe permanecer apagada hasta terminar las migraciones y la configuración de roles.
4. Obtener los UUID y correos verificados de Paolo Bastianelli, Luciana Vergoncini, José Manuel Sosa, María Paula Salas y Angélica Estupiñán. No se han adivinado identidades ni asignado privilegios por coincidencias de nombres.
5. Preparar un manifiesto JSON con entradas `{"user_id":"UUID verificado","email":"correo verificado","role":"commercial|coordinator|producer"}`. Paolo debe tener el rol comercial además de sus privilegios administrativos existentes; Luciana y José Manuel, comercial; María Paula y Angélica, coordinación. Incorporar los otros usuarios humanos activos verificados como productores; excluir cuentas de servicio y administradores pendientes de verificar.
6. Validar y aplicar el manifiesto en ensayo:

   ```bash
   uv run python manage.py configure_izclick_roles WORKSPACE_SLUG roles-verificados.json
   uv run python manage.py configure_izclick_roles WORKSPACE_SLUG roles-verificados.json --apply
   ```

   Sin `--apply`, no hay escrituras. El comando comprueba UUID, correo, membresía activa, cuenta humana y rol válido antes de aplicar la primera fila. Es transaccional, repetible y no genera notificaciones.

7. Configurar `WEB_URL` con el origen correcto y comprobar SMTP mediante la configuración existente de Plane. No copiar secretos al repositorio. Encender `IZCLICK_COORDINATION_ENABLED=1` en backend, worker y planificador. Verificar que Celery Beat registre `izclick-coordination-outbox` y que solo una instancia del planificador esté activa.
8. Publicar el frontend del mismo commit. Probar con cuentas de ensayo de los cuatro niveles: alta comercial, visibilidad para ambas coordinadoras, asignación simultánea, reasignación, bloqueo del productor anterior, cambio de estado, comentario y cotización. Confirmar alertas internas y recepción real en buzones de prueba.
9. Revisar `izclick_email_deliveries`: los éxitos tienen `sent_at`; los fallos conservan `attempts`, `last_error` y `next_attempt_at`. Un fallo de conexión debe quedar pendiente y enviarse al restablecer el transporte.
10. Con esas evidencias y el respaldo verificado, solicitar autorización explícita para publicar en producción. Repetir allí el procedimiento aprobado; esta tarea no lo ejecuta.

## Límites y recuperación

- La validación local no certifica la recepción en el proveedor de correo real ni sustituye la aceptación funcional del entorno de ensayo.
- La idempotencia de la aplicación está cubierta por transacciones y registros persistentes. SMTP no ofrece una transacción conjunta con PostgreSQL: una caída exactamente después de la aceptación SMTP y antes de guardar `sent_at` puede causar un reenvío. El `Message-ID` estable ayuda al proveedor a reconocerlo; no se promete entrega exactamente una vez en esa ventana.
- No se interpretan asignaciones históricas a partir de `project_lead`: ese campo sigue significando lo mismo. Los proyectos antiguos conservan su contenido; su incorporación al nuevo flujo debe realizarse de forma explícita por coordinación.
- Para detener el nuevo flujo, apagar la variable en backend y trabajadores y conservar las tablas. No revertir migraciones pobladas ni eliminar registros como mecanismo de recuperación. Los correos pendientes se conservan para reanudarlos.
