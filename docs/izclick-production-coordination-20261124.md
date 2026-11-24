# Publicación de coordinación en la instalación existente

Esta adaptación parte del frontend instalado (`5aad31537`) y de una copia del código del backend realmente ejecutado. La etiqueta del contenedor no reflejaba todos sus cambios posteriores. Se conservaron esos cambios de seguridad, correo, almacenamiento, campos personalizados y estados. El desarrollo funcional original continúa disponible en el PR #14.

La rama compatible es `release/izclick-coordination-20261124`. La publicación solicitada por el propietario corresponde al sitio real `https://izclick.izango.com.pe`.

## Compatibilidad de datos y permisos

- Las migraciones nuevas son `0126_izclick_coordination` y `0127_izclick_role_change`, después de las tres migraciones propias que ya tenía producción. Son aditivas.
- El flujo se activa únicamente en el espacio `izango`, mediante `IZCLICK_COORDINATION_WORKSPACES`. Otros espacios conservan sus permisos.
- Las listas y tareas históricas conservan sus permisos, asignaciones, enlaces y campos. No se convierten en proyectos pendientes ni se envían avisos retrospectivos. La restricción por productor se aplica a proyectos incorporados al nuevo flujo. La lectura de campos personalizados y su consulta por lotes se integra con los roles de agencia; los valores históricos sin autor registrado siguen siendo editables sin inventar un autor.
- El superadministrador de negocio se verifica mediante UUID en `IZCLICK_COORDINATION_SUPERADMINS`, además de exigir membresía activa. No se concede acceso global de Django ni se cambia la contraseña de ninguna persona.
- El manifiesto se contrasta contra UUID y correo de las cuentas existentes: tres comerciales, dos coordinadoras y seis productores. Las cuentas automáticas quedan excluidas.

## Validación

- 134 pruebas de coordinación, permisos, concurrencia, correo, estados y campos personalizados aprobadas localmente en PostgreSQL aislado.
- 6 pruebas de interfaz por rol aprobadas.
- Comprobación Django y coherencia entre modelos y migraciones aprobadas.
- Tipos y compilación completa del frontend aprobados. Lint: cero errores; 841 advertencias del conjunto existente.
- Se restaura un respaldo en una red interna separada del servidor y se comparan las huellas de todas las tablas anteriores. Los únicos cambios permitidos son metadatos de permisos y tipos de contenido de Django para los modelos nuevos.
- Se restaura todo el almacenamiento en un volumen separado y se compara SHA-256 por archivo, incluyendo nombres con corchetes.
- Antes de activar se exige la finalización de las pruebas del flujo en el servidor aislado.

Los archivos de diagnóstico y las configuraciones con credenciales se conservan únicamente en el directorio protegido del servidor `/root/izclick-release-20261124`; no forman parte del repositorio.

## Operación y recuperación

1. Crear y verificar respaldo actualizado de PostgreSQL y archivos.
2. Construir API y web a partir de las imágenes instaladas, conservando las dependencias. Fijar sus identificadores en la configuración de publicación.
3. Restaurar y validar en la red aislada. Los correos se simulan durante las pruebas.
4. Aplicar las migraciones en producción con el flujo apagado. Validar y aplicar el manifiesto de roles, sin avisos.
5. Actualizar solamente API, trabajador, planificador y web. Mantener todos los volúmenes y el resto de los servicios. Usar la cadena completa de configuraciones vigente, incluyendo las correcciones de archivos.
6. Comprobar acceso por rol, cola, cargas, estados y campos históricos, autenticación SMTP, respuesta pública y recursos del frontend. No crear proyectos ficticios en producción.
7. Retirar la clave administrativa temporal al terminar.

Para recuperación, usar la configuración anterior protegida y los identificadores de imágenes anteriores, con `IZCLICK_COORDINATION_ENABLED=0`. No revertir migraciones pobladas ni borrar las tablas nuevas. Los correos pendientes permanecen almacenados para su recuperación posterior. No ejecutar los despliegues antiguos del operador restringido: fijan versiones previas a las personalizaciones actuales.

## Resultado de la publicación

Publicación completada el 24 de noviembre de 2026 a las 11:59, hora de Lima (16:59 UTC). Código instalado: `8997ecd5d79ad9bfaf2bf3e4bde030b689b24c6d`.

Acceso: [Coordinación y cargas](https://izclick.izango.com.pe/izango/coordination/). Se utiliza la cuenta habitual de IZ-Click. Si la pestaña estaba abierta antes de la actualización, recargarla para mostrar el nuevo menú.

| Validación final | Resultado |
| --- | --- |
| Backend local, incluyendo estados y campos históricos | 134 pruebas aprobadas |
| Backend aislado en PostgreSQL 15 del servidor | 122 pruebas aprobadas |
| Interfaz por rol | 6 pruebas aprobadas |
| Migraciones en producción | 0126 y 0127 aplicadas; ninguna pendiente |
| Tipos y compilación de la interfaz | Aprobados |
| Lint de la interfaz completa | 0 errores; 841 advertencias |
| Restauración del respaldo de ensayo | 113 tablas anteriores comparadas; 189 archivos idénticos por SHA-256 |
| Acceso con las 11 identidades verificadas | Aprobado en ensayo y producción |
| Configuración realmente activa, sin sustituciones de pruebas | Flujo encendido en izango; superadministración de Paolo verificada |
| Páginas públicas y recursos | 3 páginas y 43 recursos correctos |
| Acceso público a la API de roles sin sesión | HTTP 401 |
| Trabajador y recuperación periódica de correos | Activos |
| SMTP de API y trabajador | Conexión y autenticación correctas |
| Clave administrativa temporal | Retirada; acceso con esa clave rechazado |

Los 3 proyectos, 39 estados y 167 tareas conservan sus identificadores antes y después del cambio. Esos totales incluyen registros históricos y eliminados lógicamente; la interfaz muestra los registros activos según sus filtros. No se crearon proyectos ficticios en producción. Los servicios aislados de ensayo quedaron detenidos y sus archivos conservados.

Respaldo adicional inmediatamente anterior al corte: `/home/izango/izclick-automated-20261124T165704Z`. Los respaldos son locales al servidor. El ensayo de restauración se realizó sobre el respaldo anterior de preparación; el respaldo de corte se generó y comprobó mediante el mismo procedimiento.

Imágenes instaladas: `izclick-api:coordination-8997ecd5d79a` y `izclick-web:coordination-8997ecd5d79a`. API, trabajador y planificador utilizan la misma versión. La configuración completa de publicación y la orden de recuperación están protegidas en `/root/izclick-release-20261124/compose-command.json` y `rollback-command.json`. La recuperación conserva las tablas nuevas y los datos; cambia los servicios a sus imágenes previas con el flujo apagado.

El PR #14 mantiene el desarrollo original contra preview en borrador. Su descripción enlaza esta adaptación instalada. Los resultados de CI del PR original corresponden a `025301390`; las pruebas anteriores corresponden a la adaptación publicada. Los cambios posteriores de documentación no requieren otra publicación.

## Uso inicial y límites verificados

1. Entrar al enlace con la cuenta habitual y abrir **Coordinación y cargas**.
2. Comercial o coordinación crea un nuevo proyecto con cliente y fechas. Ambas coordinadoras ven la misma cola.
3. Coordinación consulta las cargas y asigna al productor. Las reasignaciones conservan el historial y bloquean la edición del productor anterior en ese flujo.
4. El productor trabaja en su proyecto; los participantes reciben las notificaciones correspondientes a asignación, comentarios, estado y cotización.

Las listas y tareas anteriores siguen en sus pantallas habituales. Su incorporación al nuevo flujo requiere una acción explícita; esta publicación no interpreta responsables antiguos ni genera avisos retrospectivos. El panel nuevo puede comenzar sin proyectos hasta que se registre la primera alta.

La conexión SMTP real fue autenticada sin enviar mensajes de prueba a personas. Las pruebas de entrega usaron transporte simulado: no se verificó recepción en un buzón real. SMTP también conserva su limitación habitual: una caída después de aceptar un mensaje y antes de registrar el éxito puede provocar un reintento; se utiliza un identificador estable del mensaje.

## Corrección posterior de las traducciones

La interfaz publicada dejó referencias dinámicas a los JSON de idiomas fuera del paquete compilado. Esto hacía que se vieran claves como `sidebar.work_items`. La corrección `2464413a15cbf647fdd4313941c0c31eb149adee` genera importaciones literales de los diccionarios antes de compilar, para incluirlos en los recursos publicados. El buscador y los controles Más/Ocultar también utilizan traducciones.

La compilación web ahora ejecuta una comprobación obligatoria del paquete compilado: renderiza 17 etiquetas en español, cambia a inglés y vuelve a español. Se verificaron las 6 pruebas de coordinación, los tipos y la compilación. Se publicó únicamente `izclick-web:i18n-2464413a15cb`, conservando las imágenes de API, trabajador y planificador. Cuatro recursos públicos de traducción se compararon por SHA-256 contra el artefacto validado. El navegador muestra los campos de acceso en español. Las pestañas abiertas antes del cambio requieren una recarga completa.

La configuración y recuperación de esta corrección están en `/root/izclick-i18n-fix-20261124/compose-command.json` y `rollback-command.json`.

## Mantenimiento de seguridad pendiente

El arranque detecta una clave de firma predeterminada que ya existía en la instalación. También se utiliza para cifrar configuraciones almacenadas, incluido el correo. No se cambió durante esta publicación para conservar esas credenciales y las sesiones existentes. Su renovación requiere una intervención específica: respaldo, ensayo de descifrado y recifrado, actualización coordinada de los servicios y validación SMTP. Puede exigir que el equipo vuelva a iniciar sesión. No se incluyeron claves ni contraseñas en el repositorio o este informe.
