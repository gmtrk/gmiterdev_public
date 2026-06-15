import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from metaguess.models import Games

DEFAULT_FIXTURE = Path(__file__).resolve().parents[2] / "fixtures" / "games.json"


class Command(BaseCommand):
    help = "Seed the games table from a JSON fixture (idempotent upsert on external_id)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--path", default=str(DEFAULT_FIXTURE),
            help="Path to the games JSON fixture.",
        )

    def handle(self, *args, **options):
        path = Path(options["path"])
        if not path.exists():
            self.stderr.write(self.style.WARNING(f"Fixture not found at {path}; nothing to seed."))
            return

        try:
            records = json.loads(path.read_text())
        except json.JSONDecodeError as exc:
            raise CommandError(f"Invalid JSON in {path}: {exc}") from exc
        if not isinstance(records, list):
            raise CommandError(f"Expected a JSON array in {path}, got {type(records).__name__}.")
        created = updated = skipped = 0
        for rec in records:
            ext = rec.get("external_id")
            if ext is None:
                skipped += 1
                continue
            _, was_created = Games.objects.update_or_create(
                external_id=ext,
                defaults={
                    "game_name": rec.get("game_name"),
                    "platform": rec.get("platform"),
                    "release_year": rec.get("release_year"),
                    "score": rec.get("score"),
                    "cover_url": rec.get("cover_url"),
                },
            )
            created += int(was_created)
            updated += int(not was_created)

        self.stdout.write(self.style.SUCCESS(
            f"Seed complete: {created} created, {updated} updated, {skipped} skipped."
        ))
