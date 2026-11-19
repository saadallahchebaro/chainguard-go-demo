#!/bin/bash
# tools/compare.sh IMAGE...: one row per image, for comparing A, B, C and D.
#   disk, compressed  the two sizes `docker images` reports (unpacked on disk, compressed download)
#   packages          Debian packages (dpkg); images without a shell or dpkg are counted from the SBOM later
#   user              uid:gid the container actually runs as (from `id` inside), or the image config if there's no shell
#   shell             whether /bin/sh exists
#   tools             which of ten build or attacker-useful tools are present
# Run on the build VM from the repo folder:  bash tools/compare.sh hello:a hello:b
TOOLS="go gcc git make curl wget apt-get perl python3 ssh"
row() { printf '%-9s %-9s %-11s %-9s %-14s %-6s %s\n' "$@"; }
row image disk compressed packages "user uid:gid" shell "tools found (of: $TOOLS)"
for t in "$@"; do
  disk=$(docker images | awk -v t="$t" '$1==t{print $3}')
  comp=$(docker images | awk -v t="$t" '$1==t{print $4}')
  if docker run --rm --entrypoint /bin/sh "$t" -c true >/dev/null 2>&1; then
    shell=yes
    pk=$(docker run --rm --entrypoint /bin/sh "$t" -c 'dpkg-query -W 2>/dev/null | wc -l')
    ug=$(docker run --rm --entrypoint /bin/sh "$t" -c 'echo "$(id -u):$(id -g)"')
    found=$(docker run --rm --entrypoint /bin/sh "$t" -c "for x in $TOOLS; do command -v \$x >/dev/null && printf '%s ' \$x; done")
  else
    shell=no
    pk="(SBOM)"
    ug="cfg:$(docker image inspect "$t" --format '{{.Config.User}}')"
    found="(no shell to check from)"
  fi
  row "$t" "$disk" "$comp" "$pk" "$ug" "$shell" "${found:-none}"
done
