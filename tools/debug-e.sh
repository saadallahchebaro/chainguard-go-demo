#!/usr/bin/env bash
# tools/debug-e.sh: getting into image E, the deployed image, which has no shell, without changing the image (step 31).
#   bash tools/debug-e.sh docker   docker exec fails; a debug container shares E's processes and network; docker cp copies the binary out
#   bash tools/debug-e.sh k3s      kubectl exec fails; kubectl debug adds a debug container to one E pod, under the restricted profile
#   bash tools/debug-e.sh gap      the side door: unsigned image C, refused as a pod, is admitted as a debug container
#   bash tools/debug-e.sh all      the three, one after another
# The debug image is Chainguard's busybox, pinned by digest, its signature verified at step 31. It runs as 65532,
# the same user as E, so it needs no added capabilities. It has ps, ls, cat and netstat, but no wget, curl or nc.
# docker: a throwaway container, removed at the end. k3s and gap: a debug container stays in a pod's spec until the
# pod is deleted, so each deletes the pod it used and waits for the deployment to replace it from the same signed digest.
# Run from the repo root on the build VM.
set -uo pipefail
cd "$(dirname "$0")/.."
BB=cgr.dev/chainguard/busybox@sha256:63f6bae487adff606359bd82418ffe0564564a6b272cf52107306749a714afb2
REG=192.168.252.2:5000
NOSH='executable file not found'

inside() {   # what the debug container runs: who it is, what it sees, E's files, E's socket
  cat <<'EOF'
echo "   user: $(id)"
echo "   processes it shares with E:"; ps -o pid,user,comm | sed "s/^/     /"
echo "   files in E, read through /proc/1/root:"; ls -l /proc/1/root/usr/local/bin | tail -n +2 | sed "s/^/     /"
echo "   listening:"; netstat -tln | tail -n +3 | sed "s/^/     /"
EOF
}

wait_done() {   # until the debug container $2 in pod $1 has finished (at most 60 s)
  for _ in $(seq 1 30); do
    kubectl get pod "$1" -o jsonpath="{.status.ephemeralContainerStatuses[?(@.name==\"$2\")].state.terminated.reason}" | grep -q . && return 0
    sleep 2
  done
  echo "   (still running after 60 s)"
}

replace_pod() {   # a debug container can't be removed from a pod: delete the pod, the deployment makes a fresh one
  echo "3. A debug container stays until the pod goes: delete the pod, the deployment replaces it."
  kubectl delete pod "$1" --wait=true >/dev/null
  kubectl rollout status deploy/hello --timeout=120s >/dev/null
  echo "   now: $(kubectl get pods -l app=hello -o jsonpath='{range .items[*]}{.metadata.name} {end}')ready;" \
       "debug containers left: $(kubectl get pods -l app=hello -o jsonpath='{.items[*].spec.ephemeralContainers[*].name}' | wc -w)"
}

restricted_pod() {   # a pod spec that meets the restricted Pod Security level, so only the signature policy decides
  printf '{"apiVersion":"v1","spec":{"securityContext":{"runAsNonRoot":true,"runAsUser":65532,"runAsGroup":65532,"seccompProfile":{"type":"RuntimeDefault"}},"containers":[{"name":"gap-c","image":"%s","securityContext":{"allowPrivilegeEscalation":false,"capabilities":{"drop":["ALL"]}}}]}}' "$1"
}

do_docker() {
  echo "===== Docker: image E, no shell"
  docker rm -f q-dbg-e >/dev/null 2>&1
  docker run -d --name q-dbg-e hello:e >/dev/null && sleep 1
  echo "1. docker exec into E: $(docker exec q-dbg-e sh -c id 2>&1 | grep -o "exec: \"sh\": $NOSH")"
  echo "2. Chainguard busybox, sharing its processes and network, no added capabilities:"
  docker run --rm --pid=container:q-dbg-e --network=container:q-dbg-e "$BB" sh -c "$(inside)"
  docker cp q-dbg-e:/usr/local/bin/hello-server /tmp/q-dbg-e-bin >/dev/null 2>&1
  echo "3. docker cp, no shell needed: hello-server copied out, $(stat -c %s /tmp/q-dbg-e-bin) bytes"
  rm -f /tmp/q-dbg-e-bin
  docker rm -f q-dbg-e >/dev/null
}

do_k3s() {
  echo "===== k3s: image E, no shell"
  P=$(kubectl get pods -l app=hello -o jsonpath='{.items[0].metadata.name}')
  echo "Pod $P runs E by its signed digest."
  echo "1. kubectl exec: $(kubectl exec "$P" -- sh -c id 2>&1 | grep -o "exec: \"sh\": $NOSH")"
  echo "2. kubectl debug --target=hello --profile=restricted (Chainguard busybox):"
  kubectl debug "$P" --image="$BB" --target=hello --profile=restricted -c debug-e -- sh -c "$(inside)" >/dev/null 2>&1
  wait_done "$P" debug-e
  kubectl logs "$P" -c debug-e
  echo "   admitted with: $(kubectl get pod "$P" -o json | jq -r '.spec.ephemeralContainers[] | select(.name == "debug-e") | .securityContext
    | "allowPrivilegeEscalation=\(.allowPrivilegeEscalation) drop=\(.capabilities.drop | join(",")) runAsNonRoot=\(.runAsNonRoot)"')"
  replace_pod "$P"
}

do_gap() {
  echo "===== The side door: an unsigned image as a debug container"
  C=$(crane digest localhost:5000/hello:c)
  P=$(kubectl get pods -l app=hello -o jsonpath='{.items[0].metadata.name}')
  echo "Image C was never signed: $REG/hello@${C:0:19}…"
  echo "1. As a new pod, with restricted settings so only the signature policy decides:"
  kubectl run gap-c --restart=Never --image="$REG/hello@$C" --overrides="$(restricted_pod "$REG/hello@$C")" 2>&1 \
    | grep -o "The image must be signed[^\"]*" | head -1 | sed "s/^/   refused: /"
  kubectl delete pod gap-c --ignore-not-found >/dev/null 2>&1   # only if it had been admitted: nothing to delete when refused
  echo "2. As a debug container in pod $P:"
  kubectl debug "$P" --image="$REG/hello@$C" --target=hello --profile=restricted -c gap-c >/dev/null 2>&1
  wait_done "$P" gap-c
  echo "   admitted: $(kubectl get pod "$P" -o jsonpath='{.spec.ephemeralContainers[?(@.name=="gap-c")].image}' | cut -c1-45)…, and it ran:"
  kubectl logs "$P" -c gap-c 2>&1 | grep -E "Listening|bind" | sed "s/^/     /"
  echo "   Why: the policy matches $(kubectl get imagevalidatingpolicy require-lab-signature -o jsonpath='{.spec.matchConstraints.resourceRules[0].resources[*]}')" \
       "on $(kubectl get imagevalidatingpolicy require-lab-signature -o jsonpath='{.spec.matchConstraints.resourceRules[0].operations[*]}');"
  echo "   kubectl debug adds a container through the pods/ephemeralcontainers subresource."
  replace_pod "$P"
}

case "${1:-}" in
  docker) do_docker ;;
  k3s) do_k3s ;;
  gap) do_gap ;;
  all) do_docker; echo; do_k3s; echo; do_gap ;;
  *) echo "usage: bash tools/debug-e.sh docker|k3s|gap|all"; exit 2 ;;
esac
