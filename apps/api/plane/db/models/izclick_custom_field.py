# IZ-Click project-scoped custom work-item fields.
# Copyright (c) 2026 Izango. Integrates with Plane's existing ORM.

from django.core.exceptions import ValidationError
from math import isfinite
import re
from django.db import models
from django.db.models.functions import Lower

from .base import BaseModel


class IzclickCustomField(BaseModel):
    TYPE_TEXT = "text"
    TYPE_NUMBER = "number"
    TYPE_DATE = "date"
    TYPE_SELECT = "select"
    TYPES = (
        (TYPE_TEXT, "Texto"),
        (TYPE_NUMBER, "Número"),
        (TYPE_DATE, "Fecha"),
        (TYPE_SELECT, "Selección"),
    )

    project = models.ForeignKey("db.Project", on_delete=models.CASCADE, related_name="izclick_custom_fields")
    name = models.CharField(max_length=100)
    field_type = models.CharField(max_length=12, choices=TYPES)
    options = models.JSONField(default=list, blank=True)
    position = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "izclick_project_custom_fields"
        constraints = [
            models.UniqueConstraint(Lower("name"), "project", name="izclick_field_project_name_ci_unique"),
        ]
        ordering = ("position", "created_at")

    def clean(self):
        super().clean()
        if not self.name or not self.name.strip():
            raise ValidationError({"name": "El nombre es obligatorio."})
        if self.field_type != self.TYPE_SELECT and self.options:
            raise ValidationError({"options": "Las opciones solo corresponden a campos de selección."})
        if self.field_type == self.TYPE_SELECT:
            if not isinstance(self.options, list):
                raise ValidationError({"options": "Se requiere una lista de opciones."})
            seen = set()
            for option in self.options:
                if not isinstance(option, dict) or not isinstance(option.get("id"), str) or not isinstance(option.get("name"), str):
                    raise ValidationError({"options": "Cada opción necesita un ID y nombre."})
                if option["id"] in seen:
                    raise ValidationError({"options": "Los IDs de opciones deben ser únicos."})
                if not option["name"].strip():
                    raise ValidationError({"options": "Cada opción debe tener un nombre."})
                if "color" in option and (not isinstance(option["color"], str) or not re.fullmatch(r"#[0-9a-fA-F]{6}", option["color"])):
                    raise ValidationError({"options": "Color de opción inválido."})
                seen.add(option["id"])


class IzclickCustomFieldValue(BaseModel):
    field = models.ForeignKey(IzclickCustomField, on_delete=models.CASCADE, related_name="values")
    issue = models.ForeignKey("db.Issue", on_delete=models.CASCADE, related_name="izclick_custom_values")
    value = models.JSONField(null=True, blank=True)

    class Meta:
        db_table = "izclick_issue_custom_field_values"
        constraints = [
            models.UniqueConstraint(fields=("field", "issue"), name="izclick_field_issue_unique"),
        ]

    def clean(self):
        super().clean()
        if self.field_id and self.issue_id and self.field.project_id != self.issue.project_id:
            raise ValidationError({"issue": "La carga y el campo deben pertenecer al mismo proyecto."})
        if self.value is None:
            return
        kind = self.field.field_type
        if kind == IzclickCustomField.TYPE_TEXT and not isinstance(self.value, str):
            raise ValidationError({"value": "Se esperaba texto."})
        if kind == IzclickCustomField.TYPE_NUMBER and (not isinstance(self.value, (int, float)) or isinstance(self.value, bool)):
            raise ValidationError({"value": "Se esperaba un número."})
        if kind == IzclickCustomField.TYPE_NUMBER and not isfinite(self.value):
            raise ValidationError({"value": "El número debe ser finito."})
        if kind == IzclickCustomField.TYPE_DATE:
            from datetime import date
            if not isinstance(self.value, str):
                raise ValidationError({"value": "Fecha inválida."})
            try:
                date.fromisoformat(self.value)
            except ValueError as exc:
                raise ValidationError({"value": "Fecha inválida."}) from exc
        if kind == IzclickCustomField.TYPE_SELECT and self.value not in [o.get("id") for o in self.field.options if isinstance(o, dict)]:
            raise ValidationError({"value": "La opción no existe en este campo."})
