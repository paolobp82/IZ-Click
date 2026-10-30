# Unificación de las dos cuentas de Angélica

Origen: `aestupinan@izango.com`. Destino único de inicio de sesión: `aestupinan@izango.com.pe`.

El administrador confirmó que ambas identidades pertenecen a la misma persona y autorizó su unificación. La cuenta destino ya tiene acceso de administrador al espacio `izango` y al proyecto Cotizaciones Izango. El espacio `angelica` pertenece a la identidad de origen.

## Resultado

Se trasladan las referencias ORM de contenido y membresías desde el origen hacia el destino, manteniendo los mismos IDs de espacios, proyectos, tareas, comentarios, páginas y adjuntos. Los archivos almacenados en S3/MinIO no se copian, renombran ni borran. También se trasladan las asignaciones de los campos personalizados de tipo miembro, incluido Comercial asignado; los campos de texto libre y el contenido incrustado de documentos no se reescriben.

Los dos espacios conservan sus nombres y contenido: aparecen bajo una sola cuenta, no se fusionan entre sí. Se mantiene la contraseña y los accesos existentes de `.com.pe`, y su espacio inicial se fija en `izango`. Las preferencias globales del destino tienen prioridad; el perfil y las preferencias globales del origen se conservan en su registro histórico.

El origen queda inactivo. Se vencen sus sesiones y se desactivan sus tokens API, dispositivos y sesiones de dispositivos. No se transfieren credenciales ni se elimina ninguna cuenta o registro. El correo de origen sigue reservado en la cuenta inactiva, evitando que se cree accidentalmente otra cuenta con él.

## Protecciones

El programa admite exclusivamente los dos correos indicados. Comprueba que el destino sea una cuenta humana activa con acceso administrativo a `izango`, que el propietario de `angelica` sea el esperado y que exista el perfil destino. Si encuentra membresías solapadas, permisos globales del origen, acceso social o relaciones no soportadas, se detiene para resolver ese caso expresamente; nunca descarta duplicados ni aumenta roles para resolver conflictos.

Antes de aplicar, genera una copia privada de PostgreSQL y valida su archivo mediante `pg_restore --list`. Usa el candado operativo existente, compara el inventario revisado antes y después del respaldo y comprueba que el contenedor API no haya cambiado. Después del respaldo realiza obligatoriamente un ensayo completo dentro de una transacción externa que siempre revierte. Comprueba que el inventario original haya sido restaurado y solo entonces aplica la fusión en una nueva transacción. Dentro de cada transacción bloquea las identidades, mueve las referencias con actualizaciones directas sin notificaciones, comprueba las restricciones de integridad y valida la respuesta real de la API del selector para la cuenta destino. Deben aparecer `izango` y `angelica`. Un error revierte los cambios de contenido y autenticación de esa transacción. No se reinician ni cambian imágenes de servicios.

El respaldo incluye un plan y un resultado detallado con los IDs de las referencias modificadas, conservados con permisos privados en el servidor. No se imprime material de autenticación. La restauración de un respaldo no se ejecuta automáticamente: un respaldo completo podría sobrescribir trabajo posterior de otros usuarios y necesita revisión administrativa.

## Uso

Ejecutar en el VPS con el archivo correspondiente a la revisión exacta proporcionada:

```bash
sudo python3 /tmp/izclick-merge-angelica.py
sudo python3 /tmp/izclick-merge-angelica.py --apply
```

El primer comando solo inventaría; el segundo vuelve a inventariar, respalda y aplica la operación ya autorizada. El resultado exitoso es `accounts_merged`, con `login` igual al correo `.com.pe` y ambos espacios en `visible_workspaces`. Un segundo intento después de una fusión exitosa informa `already_merged` sin repetirla. Si la ejecución se interrumpe sin resultado final, consultar primero de nuevo sin `--apply` para comprobar su estado.

Después de la fusión, Angélica debe iniciar sesión con el correo `.com.pe` y su contraseña de esa cuenta. No se afirma que la operación ocurrió hasta contar con la salida del VPS.

## Validación

El workflow `IZCLICK account consolidation checks` está configurado para ejecutar pruebas con PostgreSQL y los modelos reales de Plane. Cubre inventario sin escrituras, conservación de contenido/IDs/contraseña/accesos, vencimiento exclusivo de credenciales del origen, repetición idempotente, rechazo de solapamientos, reversión ante una restricción única inesperada o fallo de la API final, rechazo de privilegios globales/social login detección de cambios posteriores al inventario y reversión completa del ensayo obligatorio. Las pruebas del programa del host comprueban que un ensayo fallido impida la aplicación real.
