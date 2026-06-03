#!/usr/bin/env python3
import argparse
import gzip
import json
import re
from collections import Counter, defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path

MONTHS = {
    "Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6,
    "Jul": 7, "Aug": 8, "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12,
}

SEVERITY_PATTERNS = {
    "critical": re.compile(r"\b(critical|crit|panic|fatal)\b", re.I),
    "error": re.compile(r"\b(error|err|failed|failure|denied|segfault)\b", re.I),
    "warning": re.compile(r"\b(warn|warning|deprecated)\b", re.I),
    "info": re.compile(r"\b(info|notice|started|stopped|accepted|session)\b", re.I),
}

AUTH_PATTERNS = {
    "accepted": re.compile(r"\bAccepted \w+ for (?P<user>\S+) from (?P<ip>[0-9a-fA-F:.]+)", re.I),
    "failed": re.compile(r"\bFailed \w+ for (invalid user )?(?P<user>\S+) from (?P<ip>[0-9a-fA-F:.]+)", re.I),
    "invalid": re.compile(r"\binvalid user (?P<user>\S+) from (?P<ip>[0-9a-fA-F:.]+)", re.I),
}

SYSLOG_RE = re.compile(
    r"^(?P<month>[A-Z][a-z]{2})\s+(?P<day>\d{1,2})\s+"
    r"(?P<time>\d{2}:\d{2}:\d{2})\s+"
    r"(?P<host>\S+)\s+(?P<service>[^\s:\[]+)(?:\[(?P<pid>\d+)\])?:\s+(?P<message>.*)$"
)

ISO_RE = re.compile(r"^(?P<ts>\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?)")

TEXT_SUFFIXES = {"", ".log", ".txt", ".out", ".err", ".conf", ".list"}


def open_text(path):
    if path.suffix == ".gz":
        return gzip.open(path, "rt", encoding="utf-8", errors="replace")
    return path.open("r", encoding="utf-8", errors="replace")


def is_probably_text(path):
    suffixes = path.suffixes
    if suffixes and suffixes[-1] == ".gz":
        return len(suffixes) > 1 and suffixes[-2] in TEXT_SUFFIXES
    return path.suffix in TEXT_SUFFIXES


def classify(message):
    for name in ("critical", "error", "warning", "info"):
        if SEVERITY_PATTERNS[name].search(message):
            return name
    return "other"


def parse_timestamp(line, current_year):
    match = SYSLOG_RE.match(line)
    if match:
        month = MONTHS.get(match.group("month"))
        if month:
            dt = datetime.strptime(
                f"{current_year} {month} {match.group('day')} {match.group('time')}",
                "%Y %m %d %H:%M:%S",
            )
            return dt.isoformat(), match.groupdict()

    iso = ISO_RE.match(line)
    if iso:
        return iso.group("ts").replace(" ", "T"), {}

    return None, {}


def normalize_rel(path, root):
    return str(path.relative_to(root)).replace("\\", "/")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--logs-root", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--host", default="")
    parser.add_argument("--archive", default="")
    args = parser.parse_args()

    root = Path(args.logs_root)
    now = datetime.now(timezone.utc)
    current_year = now.year

    totals = Counter()
    severities = Counter()
    by_file = []
    services = Counter()
    auth = Counter()
    auth_users = Counter()
    auth_ips = Counter()
    timeline = Counter()
    recent = deque(maxlen=250)
    skipped = []

    files = [p for p in root.rglob("*") if p.is_file()]
    for path in files:
        rel = normalize_rel(path, root)
        size = path.stat().st_size
        totals["files"] += 1
        totals["bytes"] += size

        if not is_probably_text(path):
            skipped.append({"file": rel, "reason": "non-text or unsupported extension", "bytes": size})
            continue

        file_counts = Counter()
        line_count = 0
        try:
            with open_text(path) as handle:
                for line in handle:
                    line = line.rstrip("\n")
                    line_count += 1
                    totals["lines"] += 1
                    severity = classify(line)
                    severities[severity] += 1
                    file_counts[severity] += 1

                    ts, groups = parse_timestamp(line, current_year)
                    service = groups.get("service") or "unknown"
                    if service != "unknown":
                        services[service] += 1
                    if ts:
                        timeline[ts[:13] + ":00:00"] += 1

                    for kind, rx in AUTH_PATTERNS.items():
                        match = rx.search(line)
                        if match:
                            auth[kind] += 1
                            auth_users[match.group("user")] += 1
                            auth_ips[match.group("ip")] += 1

                    if severity in {"critical", "error", "warning"}:
                        recent.appendleft({
                            "timestamp": ts or "",
                            "file": rel,
                            "service": service,
                            "severity": severity,
                            "message": line[:500],
                        })
        except Exception as exc:
            skipped.append({"file": rel, "reason": str(exc), "bytes": size})
            continue

        by_file.append({
            "file": rel,
            "bytes": size,
            "lines": line_count,
            "severity": dict(file_counts),
        })

    by_file.sort(key=lambda item: (item["severity"].get("critical", 0), item["severity"].get("error", 0), item["lines"]), reverse=True)

    payload = {
        "generatedAt": now.isoformat(),
        "sourceHost": args.host,
        "archive": args.archive,
        "totals": dict(totals),
        "severities": dict(severities),
        "topFiles": by_file[:50],
        "services": [{"name": name, "count": count} for name, count in services.most_common(30)],
        "auth": {
            "counts": dict(auth),
            "users": [{"name": name, "count": count} for name, count in auth_users.most_common(20)],
            "ips": [{"name": name, "count": count} for name, count in auth_ips.most_common(20)],
        },
        "timeline": [{"hour": hour, "count": count} for hour, count in sorted(timeline.items())],
        "recentSignals": list(recent),
        "skipped": skipped[:100],
    }

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()

