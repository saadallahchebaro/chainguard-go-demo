#!/usr/bin/env bash
# tools/check-manifests.sh: do the Kubernetes manifests in k8s/ match what the cluster runs (step 32)?
#   bash tools/check-manifests.sh        the checks: dry run, kubectl diff, the digest three ways, its signature,
#                                        then what isn't in the files (the namespace label) and the Service's pods
#   bash tools/check-manifests.sh show   the two files first, with line numbers, then the checks
# Read-only: a server-side dry run and kubectl diff change nothing. Run from the repo root on the build VM.
set -uo pipefail
cd "$(dirname "$0")/.."

if [ "${1:-}" = show ]; then
  for f in k8s/deployment.yaml k8s/service.yaml; do echo "===== $f"; cat -n "$f"; echo; done
fi

echo "== 1. the files, checked by the API server without changing anything:"
kubectl apply --dry-run=server -f k8s/
echo "== 2. kubectl diff: the files against what the cluster runs"
DIFF=$(kubectl diff -f k8s/); rc=$?            # exit 0: no difference; 1: a difference; above 1: an error
echo "   exit $rc, $(printf '%s' "$DIFF" | grep -c '') lines of difference"
echo "== 3. the digest in the file, in the cluster, and on hello:e in the registry"
F=$(grep -o "sha256:[0-9a-f]*" k8s/deployment.yaml)
echo "   file:     $F"
echo "   cluster:  $(kubectl get deploy hello -o jsonpath='{.spec.template.spec.containers[0].image}' | grep -o 'sha256:.*')"
echo "   registry: $(crane digest localhost:5000/hello:e)"
echo "== 4. that digest, signed with the lab key:"
cosign verify --key cosign.pub --insecure-ignore-tlog=true "localhost:5000/hello@$F" >/dev/null 2>&1
echo "   cosign verify exit $?"
echo "== not in the files: the namespace label that enforces the restricted level"
kubectl get ns default -o json | jq -r '.metadata.labels | to_entries[] | select(.key | startswith("pod-security")) | "   " + .key + "=" + .value'
echo "== what the Service sends traffic to"
kubectl get endpointslices -l kubernetes.io/service-name=hello \
  -o jsonpath='{range .items[*].endpoints[*]}   {.addresses[0]} {.targetRef.name} ready={.conditions.ready}{"\n"}{end}'
