from django.contrib import admin

from .models import Games, HighScore

admin.site.register(Games)
admin.site.register(HighScore)