from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("db", "0124_izclick_custom_fields")]
    operations = [migrations.AlterField(
        model_name="izclickcustomfield", name="field_type",
        field=models.CharField(max_length=12, choices=[
            ("text", "Texto"), ("number", "Número"), ("date", "Fecha"),
            ("select", "Selección"), ("member", "Asignación"),
        ]),
    )]
