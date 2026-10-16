# IZ-Click — Puerta de liberación del candidato 9ec35bf (15 oct 2026)

**Estado: BLOQUEADA para producción hasta completar evidencia real.**
PR origen: #4. SHA candidato: `9ec35bf5e0d32676d37533e33a5548d1a90d1e85`.
No mezclar imágenes de diferentes commits.

## Aprobado en entorno desechable (sin datos reales)
- Build Web/API, análisis React, migraciones de QA.
- GitHub Actions [38824937452](https://github.com/paolobp82/IZ-Click/actions/runs/38824937452): navegador e integridad de 8 cargas de prueba, sin fallos bloqueantes.
- Estas pruebas NO acreditan restauración de copias de producción ni integración con el entorno real.

## Antes de desplegar: evidencias obligatorias
1. Obtener acceso autorizado al host y confirmar directorio de Compose, versión de contenedores, nombres de servicios, almacenamiento/volúmenes, espacio disponible y configuración de proxy. **No suponer rutas ni nombres a partir del repo.**
2. Registrar imágenes y digests exactos de Web y API actualmente en uso; mantener disponibles para reversión.
3. Crear copia íntegra y fechada de **PostgreSQL** usando herramienta compatible con la versión en ejecución, y copia consistente del almacenamiento de adjuntos/objetos y configuración operativa. No subir secretos ni datos de usuarios a GitHub/Actions.
4. Comprobar integridad de archivos de respaldo y **restaurar en instancia aislada**, con conteos de proyectos/cargas, identidades, estados, adjuntos y permisos. No reemplazar la base activa en esta prueba.
5. Inspeccionar `migrate --plan` de las migraciones aditivas 0123 y 0124 contra la base real, sin ejecutar aún, y verificar compatibilidad de versiones/rollback. Una reversión de imágenes por sí sola puede no revertir el esquema de BD.
6. Congelar el candidato al SHA indicado, disponer de ventana de mantenimiento y responsable de validación.

## Despliegue controlado (solo después del cumplimiento anterior)
1. Aprobar por escrito los cambios del PR y el plan de migración.
2. Aplicar las migraciones necesarias con registro de salida y estrategia de recuperación de esquema/datos.
3. Actualizar Web y API **juntas** a imágenes inmutables del mismo SHA; preservar los volúmenes existentes. No usar `docker compose down -v`, comandos que eliminen volúmenes, ni recrear bases o buckets.
4. Ejecutar pruebas de humo autenticadas en dominio real: vista clásica, estados comunes, campos personalizados, abrir ficha, guardar/recargar, roles, CSRF, adjuntos, links SIG.
5. Comparar identidades, estados y recuentos de proyectos/cargas antes y después; observar errores HTTP y eventos de contenedores.
6. Si hay regresión, retirar tráfico de la versión nueva y volver a los digests originales, siguiendo el plan de compatibilidad/migración probado. Si los cambios de esquema son incompatibles, usar plan de restauración ensayado, nunca improvisar.

## Condiciones de suspensión
- Falta copia restaurable o prueba de restauración.
- Falta cualquiera de los digests originales de Web/API.
- Error de migración, pérdida de datos, falla de permisos, defectos de hidratación o error crítico de interfaz.
- Cualquier diferencia no explicada en IDs, estados o recuentos.

## Límites de la automatización Codex
El workflow `.github/workflows/izclick-codex-proposals.yml` en la rama `preview` **solamente propone PRs de cambios de código**. Su ejecución efectiva depende del secreto `OPENAI_API_KEY` y de permisos de GitHub. No ejecuta el despliegue ni crea respaldos de Contabo.

**Responsable del visto bueno de producción:** usuario. Ninguna automatización debe fusionar ni desplegar sin aprobación.
