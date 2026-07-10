FROM python:3.12-slim
WORKDIR /srv
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
RUN useradd --system --no-create-home --shell /usr/sbin/nologin solver \
    && chown -R solver:solver /srv
USER solver
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request as u; u.urlopen('http://127.0.0.1:8000/health', timeout=2)" || exit 1
# Internal-only service: bind inside the Docker network, don't publish via Caddy.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
