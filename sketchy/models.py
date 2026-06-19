from django.db import models
from django.db.models import Q


class SketchyScore(models.Model):
    initials = models.CharField(max_length=3)
    points = models.IntegerField()
    player_id = models.CharField(max_length=64, blank=True, default="", db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-points", "created_at"]
        constraints = [
            # One row per joined player; partial so anonymous (player_id="")
            # submits are exempt. Makes the get_or_create upsert race-safe.
            models.UniqueConstraint(
                fields=["player_id"],
                condition=~Q(player_id=""),
                name="sketchy_unique_nonblank_player_id",
            ),
        ]

    def __str__(self):
        return f"{self.initials}: {self.points}"
