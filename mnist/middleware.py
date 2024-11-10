# middleware.py
from .models import AppVisit
from django.utils.deprecation import MiddlewareMixin


class VisitTrackingMiddleware(MiddlewareMixin):
    def process_view(self, request, view_func, view_args, view_kwargs):
        # Define the apps to track
        trackable_apps = ['mnist', 'metaguess']

        # Get the app name from the URL path
        app_name = request.path.strip('/')

        # Check if the app_name is in the list of trackable apps
        if app_name in trackable_apps:
            # Increment visit count for the app
            app_visit, created = AppVisit.objects.get_or_create(app_name=app_name)
            app_visit.visit_count += 1
            app_visit.save()

        return None
