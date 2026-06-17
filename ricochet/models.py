from django.db import models


class RicochetScore(models.Model):
    initials = models.CharField(max_length=3)
    cores = models.BigIntegerField()
    player_id = models.CharField(max_length=64, blank=True, default="", db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-cores', 'created_at']

    def __str__(self):
        return f"{self.initials}: {self.cores}"
