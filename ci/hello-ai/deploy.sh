#!/usr/bin/env bash
# deploy.sh: push, sign and deploy the image the gate just passed. Runs on the build VM, after gate.sh,
# from the same checkout. COSIGN_PASSWORD comes from the workflow (a GitHub secret); the key never leaves the VM.
set -euo pipefail
SHA=$(git rev-parse HEAD | cut -c1-7)                 # gate.sh tagged the image hello-ai:<first 7 of the commit>
REGISTRY=${REGISTRY:-192.168.252.2:5000}              # the address in k3s's registries.yaml
KEY=${COSIGN_KEY:-$HOME/cosign-lab/cosign.key}
PUB=${COSIGN_PUB:-$HOME/cosign-lab/cosign.pub}
REPO=localhost:5000/hello-ai

docker tag "hello-ai:$SHA" "$REPO:$SHA"
docker push -q "$REPO:$SHA"
D=$(crane digest "$REPO:$SHA")

# Sign by digest, without the public transparency log (as in step 17), then refuse to go on unless it verifies
cosign sign --yes --key "$KEY" --use-signing-config=false --tlog-upload=false "$REPO@$D"
cosign verify --key "$PUB" --insecure-ignore-tlog=true "$REPO@$D" > /dev/null
echo "SIGNED $REPO@$D"

# The cluster pulls by digest; its admission policy admits only images signed with this key
sed "s|IMAGE_PLACEHOLDER|$REGISTRY/hello-ai@$D|" k8s/deployment.yaml | kubectl apply -f -
kubectl apply -f k8s/service.yaml
kubectl rollout status deployment/hello-ai --timeout=120s
echo "DEPLOYED $REGISTRY/hello-ai@$D"
