# IZ-Click · Correos operativos (referencia ClickUp)

## Objetivo
Implementar y verificar **cuatro** clases de correo transaccional por usuario, en español, con identidad visual IZ-Click/Izango, accesos directos autenticados a tareas y preferencias de notificación. No incluir marca ni URLs de ClickUp.

## Eventos
1. **Asignación de tarea:** cuando se asigna a un usuario activo, un email para cada nuevo asignado; título, proyecto/lista, asignador, fecha de vencimiento, estado actual, CTA «Ver tarea». No enviarlo a alguien que ya estaba asignado.
2. **Cambio de estado:** a asignados y seguidores según sus preferencias; nombre del responsable del cambio, estado anterior → nuevo, fecha, CTA a tarea. No emitir correo si el estado no cambió realmente.
3. **Vencimiento individual:** una notificación cuando una tarea asignada vence y continúa abierta; incluir la fecha, tarea, prioridad y CTA. Enviar máximo una vez por usuario+tarea+fecha de vencimiento, incluso ante reintentos.
4. **Resumen diario:** un correo por usuario con pendientes que vencen hoy, mañana y vencidos; ordenados por fecha/prioridad y enlazados. Por defecto días laborables a las 08:00 hora America/Lima, ajustable por usuario; no enviar resumen vacío salvo que el usuario lo active.

## Reglas transversales
- SMTP configurado y probado con envío real a destinatario controlado; reportar errores sin imprimir credenciales.
- Respetar destinatarios activos, estado de proyecto y preferencias. Nunca poner a varios usuarios en un mismo correo con destinatarios visibles.
- Enlaces absolutos con dominio https://izclick.izango.com.pe y ruta existente probada.
- Bandeja de salida persistente con idempotencia y reintentos; registrar pending/sent/failed, timestamp y causa sin mostrar secretos.
- Evitar duplicados por evento/tarea/usuario, tanto por señal Celery como por ejecución periódica.
- Zona horaria America/Lima; fechas de vencimiento de tipo date no reinterpretadas como UTC.
- Al completar/cancelar, no enviar recordatorios de vencimiento. Si cambia fecha, reevaluar deduplicación por fecha nueva.
- No enviar emails históricos en masa al activar.
- HTML responsive + texto plano; remitente identificado como «IZ-Click | Izango», CTA verificable.
- Botón de preferencias a ajustes de notificaciones; no permitir responder por correo para añadir comentarios hasta implementar ingestión segura.
- Control anti-spam, limitación de frecuencia, aislamiento de errores SMTP, logs auditables.
- Pruebas de multiusuario, roles, asignaciones masivas, reintentos, UTC/Lima, fecha cambiante, sin destinatario email, usuarios deshabilitados.
- Pruebas end-to-end reales en buzón de prueba antes de producción; despliegue aditivo, compatible con la versión V2.

## Hallazgos técnicos comprobados en preview
- Plane ya implementa notificaciones y EmailNotificationLog: apps/api/plane/bgtasks/notification_task.py
- La plantilla actual es genérica y usa marca Plane: apps/api/templates/emails/notifications/issue-updates.html
- Existe tarea de envío agrupado cada 5 minutos: apps/api/plane/celery.py y apps/api/plane/bgtasks/email_notification_task.py
- El correo existente marca processed_at antes de que send_email_notification confirme SMTP; revisar garantía de entrega e idempotencia.
- El envío depende de get_email_configuration() y existe pantalla administrativa de SMTP.
- Preferencias actuales incluyen property_change, state_change, comment, mention, issue_completed; no hay ajustes específicos de resumen/vencimiento.

## Criterios de aceptación
- Los cuatro diseños de las imágenes proporcionadas tienen equivalentes funcionales en IZ-Click en español.
- Asignación y cambio de estado entregados al destinatario de prueba en menos de 5 minutos.
- Vencimiento individual y resumen no se duplican al reintentar ni reenvían al actualizar página.
- Enviar prueba real y aportar evidencia de logs + entrega (redactando datos personales).
- Cero impacto en los 9 issues y 10 estados de la producción actual.
- No desplegar hasta completar CI y verificar SMTP + rutas en entorno de prueba.
