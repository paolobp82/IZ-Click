"""Standalone, side-effect-free validation for IZ-Click workspace statuses."""
import re

GROUPS = {"backlog", "unstarted", "started", "completed", "cancelled"}
COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")


def validate_status_fields(data, partial=False):
    if not isinstance(data, dict):
        return None, "Payload inválido."
    values = {}
    if not partial or "name" in data:
        name = data.get("name")
        if not isinstance(name, str) or not (1 <= len(name.strip()) <= 120):
            return None, "Ingresa un nombre válido de hasta 120 caracteres."
        values["name"] = name.strip()
    if not partial or "color" in data:
        color = data.get("color", "#64748b")
        if not isinstance(color, str) or not COLOR.fullmatch(color):
            return None, "El color debe tener formato #RRGGBB."
        values["color"] = color.lower()
    if not partial or "group" in data:
        group = data.get("group", "unstarted")
        if not isinstance(group, str) or group not in GROUPS:
            return None, "Grupo operativo no válido."
        values["group"] = group
    if not partial or "sequence" in data:
        sequence = data.get("sequence", 1000)
        if isinstance(sequence, bool) or not isinstance(sequence, int) or not (0 <= sequence <= 1000000):
            return None, "Orden de estado fuera de rango."
        values["sequence"] = sequence
    if not values:
        return None, "No hay cambios que guardar."
    return values, None
