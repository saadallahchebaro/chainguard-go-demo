#!/usr/bin/env python3
"""tools/comparison.py [DIR]: writes DIR/comparison.md, a readable view of the same-day rescan.

Reads results.json (written by tools/results.sh) for the images and Grype's counts, and the saved scan reports in DIR
(X-grype.json and X-trivy.json, or .json.gz) to compare the two scanners ID by ID. Nothing is typed by hand: every
number below comes from those files, and the Go gap classification from the step 10 log (logs/10-triage.log).
Standard library only. Run from the repo root; tools/results.sh calls it after building results.json.
"""
import gzip, json, os, re, sys
from collections import Counter, defaultdict

DIR = sys.argv[1] if len(sys.argv) > 1 else "reports/final"
IMAGES = "abcde"
RANK = {"critical": 5, "high": 4, "medium": 3, "low": 2, "negligible": 1, "unknown": 0}
ALIASES = {"CVE-2023-44487": "CVE-2023-39325"}   # Rapid Reset: KEV and Grype's ID, and Go's own (JOURNAL surprise 18)

def load(p):
    return json.load(open(p)) if os.path.exists(p) else json.load(gzip.open(p + ".gz"))

def n(v):
    return f"{v:,}" if isinstance(v, int) else str(v)

def row(label, cells, bold=False):
    cells = [f"**{n(c)}**" if bold and n(c) else n(c) for c in cells]
    return f"| {'**' + label + '**' if bold else label} | " + " | ".join(cells) + " |"

def table(head, rows):
    return "\n".join([f"| {head[0]} | " + " | ".join(head[1:]) + " |", "|---|" + "---|" * (len(head) - 1)] + rows)

# ---------- the two scanners, ID by ID ----------
def grype(t):
    out = defaultdict(set); sev = {}
    for m in load(f"{DIR}/{t}-grype.json")["matches"]:
        a, v = m["artifact"], m["vulnerability"]
        layer = ("go_stdlib" if a["name"] == "stdlib" else "go_module" if a["type"] == "go-module"
                 else "os" if a["type"] in ("deb", "apk", "rpm") else "go_toolchain" if a["type"] == "binary" else a["type"])
        out[v["id"]].add((layer, a["name"], a.get("version", "")))
        s = v["severity"].lower()
        if RANK.get(s, 0) >= RANK.get(sev.get(v["id"], "unknown"), 0): sev[v["id"]] = s
    return out, sev

def trivy(t):
    out = defaultdict(set); sev = {}
    for r in load(f"{DIR}/{t}-trivy.json").get("Results") or []:
        for v in r.get("Vulnerabilities") or []:
            layer = ("go_stdlib" if v["PkgName"] == "stdlib" else "go_module" if r["Type"] == "gobinary"
                     else "os" if r.get("Class") == "os-pkgs" else r["Type"])
            out[v["VulnerabilityID"]].add((layer, v["PkgName"], v.get("InstalledVersion", ""), v.get("Status", "")))
            s = v["Severity"].lower()
            if RANK.get(s, 0) >= RANK.get(sev.get(v["VulnerabilityID"], "unknown"), 0): sev[v["VulnerabilityID"]] = s
    return out, sev

def only_trivy_bucket(where):
    pkgs = {p for _, p, _, _ in where}; layers = {l for l, _, _, _ in where}
    if pkgs == {"linux-libc-dev"}: return "kernel"
    if "os" in layers: return "os"
    if layers == {"go_module"}: return "mod"
    if layers == {"go_stdlib"}: return "std"
    return "modstd"

def only_grype_bucket(i, where, trivy_ids):
    if ALIASES.get(i) in trivy_ids: return "alias"
    if all(l == "go_toolchain" for l, _, _ in where): return "toolchain"
    if all(l == "os" for l, _, _ in where): return "os"
    return "other"

cmp = {}
for t in IMAGES:
    G, gs = grype(t); T, ts = trivy(t)
    both = set(G) & set(T)
    sevdiff = [i for i in both if gs[i] != ts[i]]
    cmp[t] = dict(G=G, T=T, both=both, og=set(G) - set(T), ot=set(T) - set(G), sevdiff=sevdiff,
                  negl=sum(1 for i in sevdiff if gs[i] == "negligible" and ts[i] == "low"),
                  ot_b=Counter(only_trivy_bucket(T[i]) for i in set(T) - set(G)),
                  og_b=Counter(only_grype_bucket(i, G[i], set(T)) for i in set(G) - set(T)),
                  ot_temp=sum(1 for i in set(T) - set(G) if only_trivy_bucket(T[i]) == "os" and i.startswith("TEMP-")),
                  ot_os_status=Counter(next(iter(sorted({s for *_, s in T[i]}))) for i in set(T) - set(G) if only_trivy_bucket(T[i]) == "os"))

# Go, per scope, as tools/gap-analysis.sh counts it, for B's binary (C's is the same file)
def scope_counts(t):
    g = load(f"{DIR}/{t}-grype.json"); tr = load(f"{DIR}/{t}-trivy.json")
    gm = {m["vulnerability"]["id"] for m in g["matches"] if m["artifact"]["type"] == "go-module" and m["artifact"]["name"] != "stdlib"}
    gsd = {m["vulnerability"]["id"] for m in g["matches"] if m["artifact"]["name"] == "stdlib"}
    tm = {v["VulnerabilityID"] for r in tr["Results"] if r["Type"] == "gobinary" for v in r.get("Vulnerabilities") or [] if v["PkgName"] != "stdlib"}
    tsd = {v["VulnerabilityID"] for r in tr["Results"] if r["Type"] == "gobinary" for v in r.get("Vulnerabilities") or [] if v["PkgName"] == "stdlib"}
    return {"modules": (len(gm), len(tm), len(tm - gm)), "stdlib": (len(gsd), len(tsd), len(tsd - gsd))}
scopes = scope_counts("b")
gap = {}
log = "logs/10-triage.log"
if os.path.exists(log):
    for line in open(log, encoding="utf-8", errors="replace"):
        m = re.match(r"(modules|stdlib)\s+Grype\s+(\d+)\s+Trivy\s+(\d+)\s+Trivy-only\s+(\d+) -> pkg-absent (\d+), fn-absent (\d+), fn-present (\d+)(?: \(([^)]*)\))?, no-data (\d+)", line)
        if m: gap[m.group(1)] = m.groups()[1:]

# ---------- the page ----------
R = json.load(open("results.json"))
im = R["images"]; S = R["scanners"]
cols = ["", "A", "B", "C", "D", "E"]
def per(f): return [f(im[t]) for t in IMAGES]
def yn(b): return "yes" if b else "no"
out = []
w = out.append
w("# The five images, rescanned against the same databases: results and how the two scanners differ")
w("")
w(f"Scanned {S['scanned_on']} on the build VM, images A, B, C and E within a minute; image D, built at step 37, on 17 November. All against the same databases:")
w(f"- Grype {S['grype']['version']}, database built {S['grype']['db_built']}")
w(f"- Trivy {S['trivy']['version']}, database updated {S['trivy']['db_updated'][:19]}Z")
w(f"- CISA KEV catalog {S['kev_catalog']['catalogVersion']}")
w("")
w("Counting: unique vulnerability IDs, each counted once at its highest severity (Grype with `--by-cve`). Generated by `tools/results.sh` and `tools/comparison.py` from `reports/final/` and `results.json`; nothing typed by hand.")
w("")
w("**Contents:** 1. The images · 2. Vulnerabilities, Grype · 3. Grype against Trivy · 4. Why Trivy reports more · 5. Why Grype reports some Trivy doesn't · 6. The Go gap, function by function · 7. Every ID only one scanner reports")
w("")
w("## 1. The images")
w("")
w(table(cols, [
    row("Build stage", per(lambda x: f"`{x['build_stage']}`")),
    row("Runtime base", per(lambda x: x["runtime_base"] if x["runtime_base"].startswith("(") else f"`{x['runtime_base']}`")),
    row("Code", per(lambda x: x["code"])),
    row("Size on disk (compressed)", per(lambda x: f"{x['size']['disk']} ({x['size']['compressed']})")),
    row("OS packages", per(lambda x: f"{x['packages']['os']} {x['packages']['os_type'] or ''}".strip())),
    row("Go modules in the binary", per(lambda x: f"{x['packages']['app_go_modules']} (Go {x['packages']['app_go_version']})")),
    row("Runs as (uid:gid)", per(lambda x: "root (0:0)" if x["user"]["runs_as"] == "0:0" else x["user"]["runs_as"])),
    row("Shell inside", per(lambda x: yn(x["shell"]))),
    row("Answers \"Hello World!\"", per(lambda x: yn(x["hello_world"]))),
]))
w("")
w("## 2. Vulnerabilities, Grype (the primary count)")
w("")
w(table(cols, [
    row("Unique CVE IDs", per(lambda x: x["grype"]["unique"]), bold=True),
    row("Critical", per(lambda x: x["grype"]["critical"])), row("High", per(lambda x: x["grype"]["high"])),
    row("Medium", per(lambda x: x["grype"]["medium"])), row("Low", per(lambda x: x["grype"]["low"])),
    row("Negligible", per(lambda x: x["grype"]["negligible"])), row("Unknown", per(lambda x: x["grype"]["unknown"])),
    row("Fixable (a fixed version exists)", per(lambda x: x["grype"]["fixable"])),
    row("On CISA's KEV list", per(lambda x: x["grype"]["kev"])),
    row("govulncheck: known vulnerabilities in the shipped binary", per(lambda x: x["govulncheck_binary"])),
]))
w("")
w("By layer. A CVE found in two layers counts once in each, so the layers add up to more than the total.")
w("")
layers = [("os_packages", "1. OS packages"), ("go_toolchain", "2. Build tools (the Go toolchain, image A)"),
          ("go_stdlib", "3. Go standard library (every Go program in the image)"), ("go_module", "4. Go modules")]
w(table(["Grype, unique IDs by layer", "A", "B", "C", "D", "E"],
        [row(name, per(lambda x, l=l: x["grype"]["by_layer"].get(l, 0))) for l, name in layers]
        + [row("Total (unique IDs)", per(lambda x: x["grype"]["unique"]), bold=True)]))
w("")
w("## 3. Grype against Trivy, ID by ID")
w("")
c = lambda f: [f(cmp[t]) for t in IMAGES]
w(table(cols, [
    row("Grype, unique IDs", c(lambda x: len(x["G"])), bold=True),
    row("Trivy, unique IDs", c(lambda x: len(x["T"])), bold=True),
    row("Found by both", c(lambda x: len(x["both"]))),
    row("Only Grype (section 5)", c(lambda x: len(x["og"]))),
    row("Only Trivy (section 4)", c(lambda x: len(x["ot"]))),
    row("Found by both, rated differently", c(lambda x: len(x["sevdiff"]))),
    row("... of which Grype \"Negligible\", Trivy \"Low\"", c(lambda x: x["negl"])),
]))
w("")
w("The two agree on D and E: nothing. Where both report an ID they often rate it differently: Grype keeps Debian's \"Negligible\", which Trivy, with no such level, reports as \"Low\"; the rest are ratings taken from different sources.")
w("")
w("## 4. Why Trivy reports more")
w("")
ot = lambda k: c(lambda x: x["ot_b"].get(k, 0))
a_os = cmp["a"]["ot_os_status"]; b_os = cmp["b"]["ot_os_status"]
w(table(["Only Trivy, by where it found them", "A", "B", "C", "D", "E", "Why Grype doesn't report them"], [
    row("Kernel headers (`linux-libc-dev`)", ot("kernel") + ["Trivy matches kernel CVEs to the kernel headers package; Grype doesn't (`match-upstream-kernel-headers: false`). A container never runs this kernel: it uses the host's"]),
    row("Other OS packages", ot("os") + [f"Different Debian data. {cmp['a']['ot_temp']} of A's and {cmp['b']['ot_temp']} of B's are Debian's temporary TEMP- IDs, for issues with no CVE yet. Trivy marks {a_os.get('affected', 0)} of A's and {b_os.get('affected', 0)} of B's \"affected\" (no fix yet). The rest not investigated one by one"]),
    row("Go modules", ot("mod") + ["Trivy matches a module by its version. Grype, on a Go binary, reports only when a vulnerable function is compiled in (section 6)"]),
    row("Go standard library", ot("std") + ["The same: version matching against function matching"]),
    row("Go, both modules and the standard library", ot("modstd") + ["The same"]),
    row("Total only Trivy", c(lambda x: len(x["ot"])) + [""], bold=True),
]))
w("")
w("## 5. Why Grype reports some that Trivy doesn't")
w("")
og = lambda k: c(lambda x: x["og_b"].get(k, 0))
w(table(["Only Grype", "A", "B", "C", "D", "E", "Why"], [
    row("The `go` command itself (A ships the toolchain)", og("toolchain") + ["Vulnerabilities in `go` and cgo, which Grype matches to the toolchain's version; Trivy reports none of them"]),
    row("OS packages", og("os") + ["Recent CVEs in Debian packages that Trivy's data didn't list for these versions that day (section 7). Not investigated further"]),
    row("Rapid Reset, under its protocol-wide ID", og("alias") + ["Grype and CISA's KEV list use CVE-2023-44487; Trivy files the same bug under Go's ID, CVE-2023-39325, which both report"]),
    row("Total only Grype", c(lambda x: len(x["og"])) + [""], bold=True),
]))
w("")
w("## 6. The Go gap, function by function (image B's binary; C ships the same file)")
w("")
w("Counted per scope, as `tools/gap-analysis.sh` does, modules and standard library separately; an ID that one scanner files under a module and the other under the standard library counts in both scopes, so these add up to more than section 4.")
w("")
rows = []
for sc, name in [("modules", "Go modules"), ("stdlib", "Go standard library")]:
    gg, tt, only = scopes[sc]
    gl = gap.get(sc)
    cls = (f"{gl[3]} | {gl[4]} | {gl[5]}" + (f" ({gl[6]})" if gl[6] else "")) if gl else "— | — | —"
    rows.append(f"| {name} | {gg} | {tt} | {only} | {cls} |")
w("| Scope | Grype | Trivy | Only Trivy | Package not compiled in | Package in, vulnerable function not | Vulnerable function in |")
w("|---|---|---|---|---|---|---|")
w("\n".join(rows))
w("")
if gap:
    exp = sum(int(gap[s][3]) + int(gap[s][4]) for s in gap); tot = sum(int(gap[s][2]) for s in gap)
    w(f"So {exp} of the {tot} Go IDs only Trivy reports for B are about code that isn't in the binary: the affected package isn't compiled in, or it is, without the vulnerable function. The classification is from step 10 (`logs/10-triage.log`), on the same binary and the same scanner databases; the Grype and Trivy counts above are recomputed from `reports/final/`.")
    w("")
w("## 7. Every ID only one scanner reports")
w("")
def listing(t, ids, src, scanner, limit_pkgs=None):
    by = defaultdict(set)
    for i in ids:
        for e in src[i]:
            by[(e[0], e[1], e[2])].add(i)
    items = sorted(by.items(), key=lambda kv: (-len(kv[1]), kv[0]))
    lines = []
    shown = items[:limit_pkgs] if limit_pkgs else items
    for (layer, pkg, ver), s in shown:
        label = {"os": "OS", "go_module": "Go module", "go_stdlib": "Go standard library", "go_toolchain": "Go toolchain"}.get(layer, layer)
        ids_txt = ", ".join(sorted(s)) if len(s) <= 12 else ", ".join(sorted(s)[:12]) + f", and {len(s) - 12} more"
        lines.append(f"- **{pkg}** {ver} ({label}): {len(s)} · {ids_txt}")
    if limit_pkgs and len(items) > limit_pkgs:
        lines.append(f"- and {len(items) - limit_pkgs} more packages")
    return lines
for t in IMAGES:
    x = cmp[t]
    if not x["og"] and not x["ot"]:
        w(f"**{t.upper()}:** none. Both scanners report nothing."); w(""); continue
    big = len(x["ot"]) > 200
    w(f"<details><summary><b>{t.upper()}</b>: {len(x['ot']):,} only Trivy, {len(x['og'])} only Grype{' (Trivy by package, the 15 largest)' if big else ''}</summary>")
    w("")
    w(f"Only Trivy, by package{' (an ID on several packages is listed under each)' if not big else ''}:")
    w("")
    out.extend(listing(t, x["ot"], x["T"], "Trivy", 15 if big else None))
    w("")
    w("Only Grype, by package:")
    w("")
    out.extend(listing(t, x["og"], x["G"], "Grype"))
    w("")
    w("</details>")
    w("")

open(f"{DIR}/comparison.md", "w", encoding="utf-8").write("\n".join(out).rstrip() + "\n")
print(f"wrote {DIR}/comparison.md: " + ", ".join(f"{t.upper()} {len(cmp[t]['both'])} both, {len(cmp[t]['og'])} only Grype, {len(cmp[t]['ot'])} only Trivy" for t in IMAGES))
