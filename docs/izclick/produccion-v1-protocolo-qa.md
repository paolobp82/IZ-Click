# IZ-Click Producción V1 — protocolo de aceptación (sin desplegar)

**Rama candidata:** `izclick/produccion-v1` • PR #1.  
**Entorno activo:** NO modificar mientras haya validaciones pendientes.

## Verificaciones automatizadas
- [ ] GitHub Actions `production-metrics`: verde en el commit final.
- [ ] GitHub Actions `web-build`: verde en el commit final.
- [ ] Revisar que la rama candidata no incorpora migraciones de base de datos.
- [ ] Confirmar respaldo de PostgreSQL y versión actual de las imágenes para rollback.

## Prueba funcional con 2 usuarios autorizados
- [ ] Crear cargas de ejemplo en un proyecto piloto, no reutilizar registros de producción.
- [ ] Verificar que productor A solo ve los proyectos a los que Plane le da acceso.
- [ ] Verificar que las 3 vistas (pie, agenda y directorio) reflejan las mismas restricciones de productor/proyecto/cliente.
- [ ] Una carga con dos responsables suma 1 en el total global, pero 1 para cada responsable.
- [ ] Una subtarea no añade otra carga al pie ni al directorio.
- [ ] La suma de porcentajes de estados es 100%, incluidos casos con 3 estados.
- [ ] Un cliente etiquetado `Cliente: Nombre` aparece con su color.
- [ ] Una carga con `target_date` aparece en el calendario como **Fecha prevista (Plane)**.
- [ ] La fecha real del evento aún requiere campo independiente (no confundir con `target_date`).
- [ ] Buscar una carga por nombre, proyecto y estado.
- [ ] Abrir carga desde el calendario/directorio.
- [ ] Vincular una carga PILOTO al SIG usando código y URL de proyecto autorizados.
- [ ] Editar el vínculo SIG y comprobar persistencia tras recargar.
- [ ] Comprobar que los otros enlaces de la carga no se modificaron.
- [ ] Verificar errores 401/403 sin filtros que expongan datos no autorizados.

## Criterios para autorizar publicación
No fusionar PR ni sustituir las imágenes activas hasta concluir pruebas automáticas e integración. Los módulos financieros y de cotización residen exclusivamente en SIG Izango 360. La fecha del evento, estados específicos de negocio y ajustes UX pendientes continúan fuera del bloque aprobado y requieren entrega posterior.


## Verificación adicional de seguridad y rendimiento
- [ ] Probar con administrador, productor e invitado restringido que production-event-dates/ y production-sig-links/ respetan visibilidad de tareas.
- [ ] Sin sesión o sin membresía: obtener 401/403, sin simular cero cargas.
- [ ] Rechazar URL SIG externas, parámetros y rutas distintas de https://izango-erp.vercel.app/proyectos/UUID.
- [ ] Comprobar colores reales de clientes en varios proyectos.
- [ ] Probar 1, 4 y 20 proyectos: concurrencia máxima cuatro y sin cifras parciales.
- [ ] Editar fecha sin permiso de crear etiquetas ni alterar el vencimiento.
- [ ] Comprobar que la actualización automática del título de enlace conserva metadata de código SIG.
- [ ] Desplegar y revertir de forma coordinada web y API; la API original no tiene los endpoints nuevos.

## Validaciones offline
El CI incluye pruebas de apps/api/izclick_contract_tests/test_metadata.py sin servidor ni base de datos. No reemplazan integración autenticada real.