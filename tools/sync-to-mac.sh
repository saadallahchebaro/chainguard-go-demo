#!/bin/bash
# tools/sync-to-mac.sh: copy the repo's files from the build VM into the Mac's lab/ folder, then verify them.
# Copies exactly the files git sees (tracked plus new, minus .gitignore'd ones such as binaries and the
# uncompressed image-A reports); images never leave the VM. Run on the Mac:  bash tools/sync-to-mac.sh
#
# How: the VM packs the repo into one archive, multipass transfer copies that file, the Mac unpacks it,
# and every file's SHA-256 is compared with the VM's. (Streaming tar through "multipass exec" stalled
# on the first screenshot when run from a terminal tab, so binary data never goes through exec.)
#
# Mac edits are safe: a Mac file newer than the VM's copy is NOT overwritten (--keep-newer-files).
# It then shows up below as a checksum mismatch, meaning: copy that edit to the VM first, then sync again.
set -euo pipefail
VM_REPO=/home/ubuntu/chainguard-technical-challenge
DEST="$(cd "$(dirname "$0")/.." && pwd)"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

multipass exec chainguard -- bash -c "cd $VM_REPO && comm -23 <(git ls-files --cached --others --exclude-standard | sort -u) <(git ls-files --deleted | sort -u) | tar -T - -czf /tmp/lab-sync.tgz" < /dev/null
multipass transfer chainguard:/tmp/lab-sync.tgz "$TMP/lab-sync.tgz"
multipass exec chainguard -- rm -f /tmp/lab-sync.tgz < /dev/null
tar -C "$DEST" --keep-newer-files -xzf "$TMP/lab-sync.tgz"

# Verify: every file's SHA-256 on the VM must match the copy on the Mac
multipass exec chainguard -- bash -c "cd $VM_REPO && comm -23 <(git ls-files --cached --others --exclude-standard | sort -u) <(git ls-files --deleted | sort -u) | tr '\\n' '\\0' | xargs -0 sha256sum" < /dev/null > "$TMP/vm.sums"
if ! (cd "$DEST" && shasum -a 256 -c --quiet "$TMP/vm.sums"); then
  echo "MISMATCH: the files above differ from the VM. If they are Mac edits not yet copied to the VM, copy them in and sync again."
  exit 1
fi
echo "Copied and verified $(wc -l < "$TMP/vm.sums" | tr -d ' ') files from the VM to $DEST at $(date '+%F %T')"
