from django.db import models

class AppVisit(models.Model):
    app_name = models.CharField(max_length=50, unique=True)  # E.g., 'mnist', 'metaguess'
    visit_count = models.PositiveIntegerField(default=0)

    def __str__(self):
        return f"{self.app_name}: {self.visit_count} visits"
