# hello-ai: Chainguard's documented pattern for Python. Both stages are Chainguard images, pinned by digest
# (crane digest cgr.dev/chainguard/python:latest-dev, and :latest). gate.sh checks both, and their signatures.
FROM cgr.dev/chainguard/python:latest-dev@sha256:e0df0ab3cb72380c82f8c5513538152e822a6d8994252663060adea9fdc450c2 AS build
WORKDIR /app
RUN python -m venv venv
ENV PATH="/app/venv/bin:$PATH"
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Runtime: distroless Chainguard Python, which runs as the nonroot user (65532) by default
FROM cgr.dev/chainguard/python:latest@sha256:b969ffa5d847b5acd28bd18b12d5b6631cb69c8289f03b309e19b68608724dc6
WORKDIR /app
COPY --from=build /app/venv /app/venv
COPY app/ app/
ENV PATH="/app/venv/bin:$PATH"
EXPOSE 8080
ENTRYPOINT ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
