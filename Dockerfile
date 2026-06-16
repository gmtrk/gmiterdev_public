# syntax=docker/dockerfile:1
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Install Python deps first so this layer caches across code changes.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the project.
COPY . .

# Build static assets into STATIC_ROOT (=staticfiles/) at image-build time.
# settings.py requires SECRET_KEY when DEBUG is off and imports dj_database_url at module load,
# so pass throwaway values here; collectstatic never touches the database.
RUN SECRET_KEY=build-only-not-a-secret \
    DATABASE_URL=sqlite:////tmp/build.sqlite3 \
    python manage.py collectstatic --no-input

EXPOSE 8080

# WSGI app; 2 sync workers fit comfortably in 512 MB for this low-traffic site.
CMD ["gunicorn", "gmiterdev.wsgi:application", "--bind", "0.0.0.0:8080", "--workers", "2"]
