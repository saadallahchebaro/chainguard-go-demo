# syntax=docker/dockerfile:1

# ---- Build stage: install dependencies into an isolated virtualenv ----
FROM cgr.dev/chainguard/python:latest-dev@sha256:50bef4bfe98ea2f3c8c146a04847c8857e0afb1c8803e2047f140f10c028a7ee AS builder

ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app
RUN python -m venv /app/venv
ENV PATH="/app/venv/bin:$PATH"

COPY requirements.txt .
RUN pip install -r requirements.txt

# ---- Runtime stage: minimal Chainguard image (no shell), runs as nonroot 65532 ----
FROM cgr.dev/chainguard/python:latest@sha256:6a467605cd347cb7af8404af3648d01c2b39a967c342b70bbd5ef39dd0b74f5c AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/app/venv/bin:$PATH"

WORKDIR /app
COPY --from=builder /app/venv /app/venv
COPY app ./app

EXPOSE 8080

ENTRYPOINT ["/app/venv/bin/python", "-m", "uvicorn"]
CMD ["app.main:app", "--host", "0.0.0.0", "--port", "8080"]
