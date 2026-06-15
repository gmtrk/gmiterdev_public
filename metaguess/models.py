from django.db import models


class Games(models.Model):
    external_id = models.IntegerField(unique=True, blank=True, null=True)  # RAWG game id
    game_name = models.CharField(max_length=255, blank=True, null=True)
    platform = models.CharField(max_length=255, blank=True, null=True)
    release_year = models.IntegerField(blank=True, null=True)
    score = models.DecimalField(max_digits=5, decimal_places=2, blank=True, null=True)
    cover_url = models.CharField(max_length=255, blank=True, null=True)

    def __str__(self):
        return self.game_name or f"Game {self.pk}"


class HighScore(models.Model):
    initials = models.CharField(max_length=3)
    score = models.IntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-score', 'created_at']

    def __str__(self):
        return f"{self.initials}: {self.score}"
