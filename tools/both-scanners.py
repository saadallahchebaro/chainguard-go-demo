#!/usr/bin/env python3
# tools/both-scanners.py [IMAGE] [--json | --kev-ids]: one image, Grype and Trivy side by side, from reports/final/.
# Read-only. Counts unique IDs, each at its worst severity; "On KEV" against reports/final/cisa-kev.json; "Fixable" if
# any match of the ID has a fixed version. "no kernel headers" drops the IDs Trivy finds only on linux-libc-dev, which
# Grype doesn't match by default (match-upstream-kernel-headers: false). Slide 15's table; the console and the Word
# reports run this script.
#   --json     the same figures as JSON
#   --kev-ids  only the KEV IDs Trivy reports and Grype doesn't, outside the kernel headers, one per line
import gzip, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
FINAL = os.path.join(HERE, "..", "reports", "final")
ORDER = ["Critical", "High", "Medium", "Low", "Negligible", "Unknown"]


def load(name):
    p = os.path.join(FINAL, name)
    if os.path.exists(p + ".gz"):
        return json.load(gzip.open(p + ".gz", "rt", encoding="utf-8"))
    return json.load(open(p, encoding="utf-8"))


def add(ids, i, sev, fixed, pkg):
    sev = sev.capitalize() if sev.capitalize() in ORDER else "Unknown"
    if i in ids:
        s, f, p = ids[i]
        ids[i] = (sev if ORDER.index(sev) < ORDER.index(s) else s, f or fixed, p | {pkg})
    else:
        ids[i] = (sev, fixed, {pkg})


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    img = (args[0] if args else "a").lower()
    kev_doc = load("cisa-kev.json")
    kev = {v["cveID"] for v in kev_doc["vulnerabilities"]}

    grype = {}
    for m in load(f"{img}-grype.json")["matches"]:
        v = m["vulnerability"]
        add(grype, v["id"], v.get("severity", "Unknown"), v.get("fix", {}).get("state") == "fixed", m["artifact"]["name"])
    trivy_doc = load(f"{img}-trivy.json")
    trivy = {}
    for r in trivy_doc.get("Results", []):
        for v in r.get("Vulnerabilities") or []:
            add(trivy, v["VulnerabilityID"], v.get("Severity", "UNKNOWN"), bool(v.get("FixedVersion")), v["PkgName"])
    no_kernel = {i: x for i, x in trivy.items() if x[2] != {"linux-libc-dev"}}

    def row(label, ids):
        sev = [x[0] for x in ids.values()]
        return [label, len(ids), sev.count("Critical"), sev.count("High"), len(set(ids) & kev), sum(1 for x in ids.values() if x[1])]

    rows = [row("Grype", grype), row("Trivy", trivy)]
    kernel_only = len(trivy) - len(no_kernel)
    if kernel_only:
        rows.append(row("Trivy, no kernel headers", no_kernel))
    extra = sorted((set(no_kernel) & kev) - set(grype))
    extra_kev = [[i, ", ".join(sorted(no_kernel[i][2]))] for i in extra]
    os_info = trivy_doc.get("Metadata", {}).get("OS", {})
    out = {"image": img, "kev_catalog": kev_doc.get("catalogVersion"), "kernel_only": kernel_only,
           "head": [f"Image {img.upper()}, both scanners", "Unique CVEs", "Critical", "High", "On KEV", "Fixable"],
           "rows": [[r[0]] + [f"{n:,}" for n in r[1:]] for r in rows], "trivy_only_kev": extra_kev,
           "os": f"{os_info.get('Family', '?')} {os_info.get('Name', '?')}", "os_eosl": bool(os_info.get("EOSL"))}

    if "--json" in sys.argv:
        print(json.dumps(out, indent=1))
    elif "--kev-ids" in sys.argv:
        print("\n".join(extra))
    else:
        w = [26, 12, 9, 7, 7, 8]
        print(f"{out['head'][0]} (reports/final, KEV catalog {out['kev_catalog']})")
        print("Scanner".ljust(w[0]) + "".join(h.rjust(n) for h, n in zip(out["head"][1:], w[1:])))
        for r in out["rows"]:
            print(r[0].ljust(w[0]) + "".join(c.rjust(n) for c, n in zip(r[1:], w[1:])))
        if kernel_only:
            print(f"Trivy only, on the kernel headers (linux-libc-dev): {kernel_only:,} IDs")
        print(f"On KEV, Trivy only (no kernel headers): {', '.join(f'{i} ({p})' for i, p in extra_kev) or 'none'}")
        print(f"Trivy's OS: {out['os']}, end of service life: {'yes' if out['os_eosl'] else 'no'}")


if __name__ == "__main__":
    main()
