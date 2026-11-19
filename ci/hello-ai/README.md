# hello-ai

A small FastAPI service used to show a supply-chain gate in CI, as a bonus to a container-security lab.

- `gate.sh`: seven checks every change must pass: Chainguard base images pinned by digest, their signatures, exact
  dependency pins, a 7-day cooldown on new releases, a build, a non-root user, and no fixable high or critical CVE.
- `.github/workflows/gate.yml`: runs the gate on every pull request, on a self-hosted runner in the lab's build VM.
- `.github/workflows/deploy.yml`: after a merge to `main`, runs the gate again, then `deploy.sh`: push to the lab
  registry, sign by digest with cosign, deploy to k3s.
- `policy/require-signature.yaml`: a Kyverno policy in the cluster that admits only images signed with the lab key.

`requirements.txt` pins every installed package, transitive ones included, each to a release at least 7 days old.
