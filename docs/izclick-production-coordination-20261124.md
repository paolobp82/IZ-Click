# Publicación de coordinación en la instalación existente

Esta adaptación parte del frontend instalado (`5aad31537`) y de una copia del código del backend realmente ejecutado. La etiqueta del contenedor no reflejaba todos sus cambios posteriores. Se conservaron esos cambios de seguridad, correo, almacenamiento, campos personalizados y estados. El desarrollo funcional original continúa disponible en el PR #14.

La rama compatible es `release/izclick-coordination-20261124`. La publicación solicitada por el propietario corresponde al sitio real `https://izclick.izango.com.pe`.

## Compatibilidad de datos y permisos

- Las migraciones nuevas son `0126_izclick_coordination` y `0127_izclick_role_change`, después de las tres migraciones propias que ya tenía producción. Son aditivas.
- El flujo se activa únicamente en el espacio `izango`, mediante `IZCLICK_COORDINATION_WORKSPACES`. Otros espacios conservan sus permisos.
- Las listas y tareas históricas conservan sus permisos, asignaciones, enlaces y campos. No se convierten en proyectos pendientes ni se envían avisos retrospectivos. La restricción por productor se aplica a proyectos incorporados al nuevo flujo.
- El superadministrador de negocio se verifica mediante UUID en `IZCLICK_COORDINATION_SUPERADMINS`, además de exigir membresía activa. No se concede acceso global de Django ni se cambia la contraseña de ninguna persona.
- El manifiesto se contrasta contra UUID y correo de las cuentas existentes: tres comerciales, dos coordinadoras y seis productores. Las cuentas automáticas quedan excluidas.

## Validación

- 58 pruebas de coordinación, permisos, concurrencia y correo aprobadas localmente en PostgreSQL aislado.
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
