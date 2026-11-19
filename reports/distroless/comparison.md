Grype 0.121.3, database 2026-11-16T06:30:54Z; Trivy 0.76.2, database 2026-11-16

| | C: Chainguard static | C-distroless: Google distroless static |
|---|---|---|
| Runtime base | `cgr.dev/chainguard/static` | `gcr.io/distroless/static-debian13` |
| Base signature | verified (https://github.com/chainguard-images/images) | verified (keyless@distroless.iam.gserviceaccount.com) |
| Base attestations | apko.dev/image-configuration, slsa.dev/provenance/v1, spdx.dev | spdx.dev |
| Base build date, as recorded | 2026-10-28 | 1970-01-01 |
| OS packages | 3: ca-certificates-bundle, tzdata, wolfi-baselayout | 6: base-files, ca-certificates, media-types, netbase, tzdata, tzdata-legacy |
| Size on disk (compressed) | 19MB (5.62MB) | 21.6MB (6.02MB) |
| Runs as (uid:gid) | 65532:65532 | 65532:65532 |
| Shell inside | no | no |
| Answers | Hello World! | Hello World! |
| App binary, SHA-256 | ec6fa6de2be34bc3… | ec6fa6de2be34bc3… |
| Grype, unique CVE IDs | 69 (OS 0, Go 69) | 69 (OS 0, Go 69) |
| Trivy, unique CVE IDs | 157 (OS 0, Go 157) | 157 (OS 0, Go 157) |
