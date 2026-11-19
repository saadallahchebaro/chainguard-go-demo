# resolve.py: pin fastapi + uvicorn and every package they pull in, each to the newest release that is at
# least 7 days old (the gate's cooldown rule). Runs inside cgr.dev/chainguard/python:latest-dev, so pip resolves
# for the same Python the image builds with. Prints a fully pinned requirements.txt.
import datetime, json, subprocess, sys, urllib.request
from pip._vendor.packaging.version import Version

CUT = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=7)
TOP = ["fastapi", "uvicorn"] + sys.argv[1:]      # extra top-level packages as arguments

def pypi(path):
    with urllib.request.urlopen(f"https://pypi.org/pypi/{path}/json") as r:
        return json.load(r)

def uploaded(name, version):            # same rule as gate.sh: the first file's upload time
    files = pypi(f"{name}/{version}")["urls"]
    return datetime.datetime.fromisoformat(files[0]["upload_time_iso_8601"].replace("Z", "+00:00"))

def newest_old_enough(name):
    best = None
    for v, files in pypi(name)["releases"].items():
        if not files or any(f.get("yanked") for f in files):
            continue
        ver = Version(v)
        if ver.is_prerelease or ver.is_devrelease:
            continue
        t = datetime.datetime.fromisoformat(files[0]["upload_time_iso_8601"].replace("Z", "+00:00"))
        if t <= CUT and (best is None or ver > Version(best)):
            best = v
    return best

pins = {n: newest_old_enough(n) for n in TOP}
for attempt in range(6):
    reqs = [f"{n}=={v}" for n, v in pins.items()]
    subprocess.run([sys.executable, "-m", "pip", "install", "--quiet", "--dry-run", "--ignore-installed",
                    "--report", "/tmp/report.json", *reqs], check=True)
    resolved = {i["metadata"]["name"].lower().replace("_", "-"): i["metadata"]["version"]
                for i in json.load(open("/tmp/report.json"))["install"]}
    young = {n: v for n, v in resolved.items() if uploaded(n, v) > CUT}
    print(f"# attempt {attempt + 1}: {len(resolved)} packages, too new: {young or 'none'}", file=sys.stderr)
    if not young:
        break
    for n in young:
        pins[n] = newest_old_enough(n)
for n, v in sorted(resolved.items()):
    print(f"{n}=={v}")
