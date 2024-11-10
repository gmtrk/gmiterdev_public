from django.shortcuts import render
from .models import AppVisit

def index(request):
    return render(request, 'mnist/index.html')

def main_view(request):
    # Get or create visit counts for each app
    mnist_visits, _ = AppVisit.objects.get_or_create(app_name='mnist')
    metaguess_visits, _ = AppVisit.objects.get_or_create(app_name='metaguess')

    # Pass the visit counts to the template
    context = {
        'mnist_visits': mnist_visits.visit_count,
        'metaguess_visits': metaguess_visits.visit_count,
    }
    return render(request, 'main.html', context)