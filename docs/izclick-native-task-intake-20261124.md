# Corrección del flujo sobre cargas nativas — 24 de noviembre de 2026

## Estado

Implementado y validado localmente. Pendiente el ensayo en copia del servidor y la publicación: la clave administrativa temporal fue retirada después de corregir las traducciones. No se ha instalado esta corrección en producción.

La primera publicación implementó coordinación sobre proyectos de Plane. El flujo acordado corresponde a las tareas o cargas dentro de «COTIZACIONES IZANGO». Esta corrección conecta el formulario nativo con la cola compartida; conserva el panel anterior para los enlaces históricos de sus notificaciones.

## Recorrido

1. Comercial abre Nueva tarea y completa los datos habituales. El selector de productor se oculta para una carga nueva.
2. Revisar envío presenta carga, proyecto, cliente, fechas y ambas coordinadoras. Volver a editar conserva el formulario. Enviar a coordinación crea la carga sin productor y genera un aviso interno y una entrega de correo para cada coordinadora.
3. Ambas coordinadoras abren Coordinación y cargas desde el menú lateral real. Consultan la misma cola y las tareas activas de cada productor, incluidas las asignaciones históricas nativas.
4. Coordinación asigna o reasigna. La operación actualiza el responsable nativo, registra actor e historial, y avisa a comercial y a los productores implicados. La comprobación de versión impide sobrescribir una asignación concurrente.
5. El productor actual trabaja con los comentarios, estados y archivos nativos. El productor anterior pierde la edición de la carga gestionada. Comercial y coordinación quedan suscritos a su actividad nativa.

Las tareas históricas no se convierten en solicitudes pendientes ni se reasignan. La migración 0128 añade únicamente dos tablas. Las subtareas de una carga gestionada heredan sus restricciones de acceso. Los roles de agencia y la activación siguen limitados al espacio configurado.

## Validación local

- 148 pruebas del servidor aprobadas, incluyendo 14 del ingreso de cargas: envío por el endpoint nativo, cola visible para ambas coordinadoras, avisos y entregas de correo, responsable comercial, rechazo de asignación directa, permisos, reasignación, concurrencia, recuperación transaccional, carga histórica y bloqueo de operaciones masivas no autorizadas.
- 13 pruebas de interfaz aprobadas: seis del panel anterior y siete de revisión comercial, visibilidad por rol, carga de trabajo y errores.
- Tipos de TypeScript y compilación de producción aprobados.
- El paquete compilado conserva 17 etiquetas españolas comprobadas, incluido el cambio de idioma de ida y vuelta.
- Django no detecta migraciones faltantes ni problemas de configuración en el entorno aislado.
- Ruff sin errores; OxLint sin errores (una advertencia sobre la clave de una fila del historial).

Las pruebas de interfaz renderizan los componentes; aún falta validar el recorrido interactivo autenticado en la copia del servidor. Los correos se prueban con transporte de memoria: no se afirma recepción en buzones reales.

## Publicación pendiente

1. Recuperar el acceso con la clave temporal ya autorizada.
2. Generar respaldo nuevo y restaurarlo en una base aislada; ensayar 0128 y comparar las tablas históricas.
3. Ejecutar las pruebas del servidor con la imagen candidata y comprobar las cuentas reales sin crear datos de prueba en producción.
4. Mantener toda la cadena actual de configuración, incluida la corrección de español. Aplicar la migración aditiva y actualizar API, trabajador, planificador e interfaz con la misma revisión.
5. Comprobar salud, identificadores históricos, recursos públicos de español, cola y permisos. Conservar imágenes y orden de recuperación; una reversión cambia las imágenes sin eliminar tablas o datos.

El procedimiento preparado está fuera del código de la aplicación, en `output/izclick-release-20261124/release-task-intake.py` del espacio de trabajo. No debe anunciarse esta ventana como disponible hasta completar esos pasos.
