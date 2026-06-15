from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("metaguess", "0005_highscore_delete_authgroup_and_more"),
    ]

    operations = [
        # Old model was managed=False -> dropping it issues no SQL (no table existed).
        migrations.DeleteModel(name="Games"),
        # Recreate as a managed model -> this CREATEs the metaguess_games table.
        migrations.CreateModel(
            name="Games",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("external_id", models.IntegerField(blank=True, null=True, unique=True)),
                ("game_name", models.CharField(blank=True, max_length=255, null=True)),
                ("platform", models.CharField(blank=True, max_length=255, null=True)),
                ("release_year", models.IntegerField(blank=True, null=True)),
                ("score", models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True)),
                ("cover_url", models.CharField(blank=True, max_length=255, null=True)),
            ],
        ),
    ]
