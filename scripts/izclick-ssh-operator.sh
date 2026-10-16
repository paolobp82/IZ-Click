#!/bin/sh
# IZ-Click read-only SSH forced-command dispatcher.
# Install at /home/izango/.local/bin/izclick-connection-check
set -eu
case "${SSH_ORIGINAL_COMMAND:-}" in
  izclick-connection-check)
    echo "IZCLICK_SSH_OK"
    printf 'Servidor: '; hostname
    printf 'Usuario: '; whoami
    ;;
  izclick-status)
    echo "IZCLICK_STATUS_OK"
    printf 'Servidor: '; hostname
    printf 'Usuario: '; whoami
    printf 'Fecha UTC: '; date -u '+%Y-%m-%dT%H:%M:%SZ'
    printf 'Carga: '; uptime
    printf 'Disco de /opt: '; df -h /opt/iz-click | tail -n 1
    if command -v docker >/dev/null 2>&1; then
      if docker info >/dev/null 2>&1; then
        echo "Contenedores en ejecución:"
        docker ps --format '{{.Names}}|{{.Status}}|{{.Image}}' --filter name=plane-app
      else
        echo "Docker: permisos de lectura todavía no configurados."
      fi
    fi
    ;;
  *)
    echo "Acción SSH no autorizada" >&2
    exit 126
    ;;
esac
