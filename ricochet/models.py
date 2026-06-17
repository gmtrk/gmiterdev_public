from django.db import models
from django.db.models import Q


class RicochetScore(models.Model):
    initials = models.CharField(max_length=3)
    cores = models.BigIntegerField()
    player_id = models.CharField(max_length=64, blank=True, default="", db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-cores', 'created_at']
        constraints = [
            # One row per joined player. Partial (non-blank) so legacy/anonymous
            # submits — which all share player_id="" — are exempt. This is what
            # makes the get_or_create upsert in views.add_high_score race-safe.
            models.UniqueConstraint(
                fields=['player_id'],
                condition=~Q(player_id=''),
                name='ricochet_unique_nonblank_player_id',
            ),
        ]

    def __str__(self):
        return f"{self.initials}: {self.cores}"
