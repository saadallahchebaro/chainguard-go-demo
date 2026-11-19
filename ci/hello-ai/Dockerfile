# syntax=docker/dockerfile:1

# ---- Build stage: install dependencies into an isolated virtualenv ----
FROM cgr.dev/chainguard/python:latest-dev@sha256:e0df0ab3cb72380c82f8c5513538152e822a6d8994252663060adea9fdc450c2 AS builder

ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# RUN steps execute as the image's nonroot user (65532), so build in a directory it owns
WORKDIR /app
RUN python -m venv /app/venv
ENV PATH="/app/venv/bin:$PATH"

COPY requirements.txt .
RUN pip install -r requirements.txt

# ---- Runtime stage: minimal image (no shell, no package manager), already runs as nonroot 65532 ----
FROM cgr.dev/chainguard/python:latest@sha256:b969ffa5d847b5acd28bd18b12d5b6631cb69c8289f03b309e19b68608724dc6 AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/app/venv/bin:$PATH"

WORKDIR /app
COPY --from=builder /app/venv /app/venv
COPY app ./app

EXPOSE 8080

# The base image's entrypoint is /usr/bin/python, so replace it to run the venv's uvicorn
ENTRYPOINT ["/app/venv/bin/uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
