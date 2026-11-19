---
name: chainguard-dockerfile
description: Move a Dockerfile onto Chainguard base images and pin them by digest, so it passes a supply-chain gate that checks the base image, its signature, the runtime user and fixable CVEs. Use when a CI gate reports a non-Chainguard base image, an unpinned base, a root user or fixable high or critical findings.
---

# Chainguard Dockerfile

Use this when a pipeline's gate rejects a Dockerfile because of its base images. Change only what the gate reports, in the smallest change that works.

## Steps

1. Read the gate's failed checks, and fix only those.
2. Convert the base images with dfc, Chainguard's Dockerfile converter, which is installed on the build VM:
   `multipass exec chainguard -- dfc --org chainguard - < Dockerfile`
   It maps each `FROM` to the matching Chainguard image and rewrites package installs for it.
3. Keep a multi-stage build: build in the `-dev` variant, which has a shell and the package tools, and run in the minimal variant without them, never the `-dev` one.
4. Pin every `FROM` by digest. Read the digest with crane, also on the build VM:
   `multipass exec chainguard -- crane digest cgr.dev/chainguard/<image>:<tag>`
   then write `FROM cgr.dev/chainguard/<image>:<tag>@sha256:<digest>`.
   The free registry, cgr.dev/chainguard, serves only the `:latest` and `:latest-dev` tags.
5. Chainguard images run as the nonroot user 65532, and so do `RUN` steps in the `-dev` builder. Do not create users or groups, and do not write outside a directory that user owns: set `WORKDIR /app` and build there.
6. To check an image's entrypoint, user or environment, read its configuration:
   `multipass exec chainguard -- crane config cgr.dev/chainguard/<image>:<tag>`
7. Leave the exact version pins in requirements.txt as they are.

## Before you finish

- Every `FROM` starts with `cgr.dev/chainguard/` and ends with `@sha256:` followed by 64 hex characters.
- The final stage has no `RUN` step, because the runtime image has no shell.
- Nothing changed outside the Dockerfile and .dockerignore.
