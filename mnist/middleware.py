# middleware.py
from .models import AppVisit
from django.db.models import F
from django.utils.deprecation import MiddlewareMixin


class VisitTrackingMiddleware(MiddlewareMixin):
    def process_view(self, request, view_func, view_args, view_kwargs):
        # Only count safe GET requests (skip HEAD/POST/etc.)
        if request.method != 'GET':
            return None

        # Define the apps to track
        trackable_apps = ('mnist', 'metaguess', 'ricochet')

        # Get the app name from the URL path
        app_name = request.path.strip('/')

        # Check if the app_name is in the list of trackable apps
        if app_name in trackable_apps:
            # Ensure the row exists, then atomically increment to avoid the
            # lost-update race of a read-modify-write.
            AppVisit.objects.get_or_create(app_name=app_name)
            AppVisit.objects.filter(app_name=app_name).update(
                visit_count=F('visit_count') + 1
            )

        return None
