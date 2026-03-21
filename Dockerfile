FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY dive_backend.py postgres_store.py print_dives.py migrate_sqlite_to_postgres.py ./
COPY frontend ./frontend

EXPOSE 8000

CMD ["python", "dive_backend.py"]
