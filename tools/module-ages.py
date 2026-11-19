#!/usr/bin/env python3
# tools/module-ages.py [--json]: the Go and every module in the binary A, B and C ship, against D's: each version, the
# date it was published, and the CVEs each scanner reports in it. Changes nothing.
#   Versions:  go version -m on hello-server-b (A, B and C ship this file) and hello-server-d.
#   Dates:     modules from proxy.golang.org (go list -m), Go itself from go.dev/doc/devel/release.
#   CVEs:      reports/final: Grype and Trivy on C (the same binary, no OS packages left) and govulncheck on the binary.
#              Unique IDs per package; "KEV" are IDs on reports/final/cisa-kev.json.
import collections, json, os, re, subprocess, sys, urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
F = os.path.join(ROOT, "reports", "final")


def sh(*a):
    return subprocess.run(a, capture_output=True, text=True, cwd="/tmp").stdout.strip()


def deps(binary):
    out = sh("go", "version", "-m", os.path.join(ROOT, binary)).split("\n")
    return out[0].split(": ")[1], {l.split()[1]: l.split()[2] for l in out if l.split()[:1] == ["dep"]}


def published(mod, ver):
    return sh("go", "list", "-m", "-f", "{{.Time}}", f"{mod}@{ver}")[:10] or "?"


def main():
    go_b, mods_b = deps("hello-server-b")
    go_d, mods_d = deps("hello-server-d")
    rel = re.sub(r"<[^>]+>|\s+", " ", urllib.request.urlopen("https://go.dev/doc/devel/release", timeout=30).read().decode())
    go_date = lambda v: (re.search(re.escape(v) + r" \(released ([0-9-]+)\)", rel) or [None, "?"])[1]

    grype = collections.defaultdict(set)
    for m in json.load(open(f"{F}/c-grype.json"))["matches"]:
        grype[m["artifact"]["name"]].add(m["vulnerability"]["id"])
    trivy = collections.defaultdict(set)
    for r in json.load(open(f"{F}/c-trivy.json"))["Results"]:
        for v in r.get("Vulnerabilities") or []:
            trivy[v["PkgName"]].add(v["VulnerabilityID"])
    gvc = collections.Counter()
    symbols = open(f"{F}/govulncheck-binary-abc.txt").read().split("=== Package Results ===")[0]
    for block in re.split(r"\nVulnerability #\d+: ", symbols)[1:]:
        where = re.search(r"Found in: (\S+?)@", block).group(1)
        gvc["stdlib" if "." not in where.split("/")[0] else where] += 1
    kev = {v["cveID"] for v in json.load(open(f"{F}/cisa-kev.json"))["vulnerabilities"]}

    def counts(pkg):
        return {"grype": len(grype[pkg]), "trivy": len(trivy[pkg]), "govulncheck": gvc[pkg], "kev": sorted((grype[pkg] | trivy[pkg]) & kev)}

    rows = [{"module": "Go (standard library)", "abc": go_b, "abc_date": go_date(go_b), "d": go_d, "d_date": go_date(go_d), **counts("stdlib")}]
    for mod, ver in mods_b.items():
        dv = mods_d.get(mod)
        rows.append({"module": mod, "abc": ver, "abc_date": published(mod, ver), "d": dv or "removed",
                     "d_date": published(mod, dv) if dv else "", **counts(mod)})
    rows[1:] = sorted(rows[1:], key=lambda r: (-r["grype"], -r["trivy"], r["module"]))
    added = sorted(set(mods_d) - set(mods_b))

    if "--json" in sys.argv:
        print(json.dumps({"rows": rows, "added_in_d": added}, indent=1))
        return
    short = lambda v: re.sub(r"^(v0\.0\.0-\d{8})\d{6}-[0-9a-f]+$", r"\1…", v)
    print(f"Go and modules in the A-to-C binary ({go_b}) and in D's ({go_d}); CVEs in the A-to-C binary (reports/final)")
    print(f"{'module':46} {'A to C':17} {'published':10}  {'D':9} {'published':10}  Grype Trivy govulncheck  KEV")
    for r in rows:
        print(f"{r['module']:46} {short(r['abc']):17} {r['abc_date']:10}  {r['d']:9} {r['d_date']:10}  {r['grype']:5} {r['trivy']:5} {r['govulncheck']:11}  {' '.join(r['kev'])}")
    print(f"Added in D: {', '.join(added)}")


if __name__ == "__main__":
    main()
