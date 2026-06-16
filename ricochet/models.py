from django.db import models


class RicochetScore(models.Model):
    initials = models.CharField(max_length=3)
    cores = models.BigIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-cores', 'created_at']

    def __str__(self):
        return f"{self.initials}: {self.cores}"
