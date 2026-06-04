#!/usr/bin/env python3
import argparse
import hashlib
import json
import os
import urllib.error
import urllib.request
from http.cookiejar import CookieJar
from pathlib import Path
from urllib.parse import urljoin


STATUS_LABELS = {
    0: "offline",
    1: "undispatchable",
    2: "idle",
    3: "running",
    4: "charging",
    5: "online",
}


def digest_md5(value):
    return hashlib.md5(value.encode("utf-8")).hexdigest()


def digest_sha256(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


class RdsClient:
    def __init__(self, base_url):
        self.base_url = base_url.rstrip("/") + "/"
        self.cookies = CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.cookies))
        self.token = ""

    def request(self, method, path, payload=None):
        body = None
        headers = {"Content-Type": "application/json"}
        if self.token:
            headers["token"] = self.token
            headers["Authorization"] = self.token
        if payload is not None:
            body = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(urljoin(self.base_url, path.lstrip("/")), data=body, headers=headers, method=method)
        with self.opener.open(req, timeout=20) as response:
            raw = response.read().decode("utf-8", errors="replace")
        return json.loads(raw) if raw else None

    def login(self, username, password):
        encrypt_response = self.request("GET", "/admin/encrypt")
        encrypt = bool((encrypt_response or {}).get("data"))
        md5_password = digest_md5(password)
        login_response = self.request("POST", "/admin/login", {
            "username": username,
            "password": md5_password if encrypt else password,
            "sha2Password": digest_sha256(md5_password + "Rds123!"),
        })
        if not login_response or login_response.get("code") != 200:
            raise RuntimeError(f"RDS login failed: {login_response}")
        self.token = ((login_response.get("data") or {}).get("token") or "")
        return login_response


def unwrap(response):
    if response and response.get("code") == 200:
        return response.get("data")
    return None


def safe_call(client, method, path, payload=None):
    try:
        return unwrap(client.request(method, path, payload))
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError) as exc:
        return {"error": str(exc)}


def normalize_robot_status(rows):
    robots = []
    status_counts = {}
    if not isinstance(rows, list):
        return robots, status_counts

    for row in rows:
        if not isinstance(row, dict):
            continue
        status = row.get("newStatus")
        label = STATUS_LABELS.get(status, f"status-{status}")
        status_counts[label] = status_counts.get(label, 0) + 1
        robots.append({
            "uuid": row.get("uuid") or row.get("name") or row.get("vehicle") or "unknown",
            "statusCode": status,
            "status": label,
            "raw": row,
        })
    robots.sort(key=lambda item: item["uuid"])
    return robots, status_counts


def main():
    parser = argparse.ArgumentParser(description="Pull AMR/RDS web data into dashboard JSON.")
    parser.add_argument("--base-url", default="http://10.216.4.59:8080")
    parser.add_argument("--username", default=os.environ.get("RDS_USERNAME", "amrdashboard"))
    parser.add_argument("--password", default=os.environ.get("RDS_PASSWORD", ""))
    parser.add_argument("--output", default="dashboard/data/rds.json")
    args = parser.parse_args()
    if not args.password:
        raise SystemExit("RDS password is required. Pass --password or set RDS_PASSWORD.")

    client = RdsClient(args.base_url)
    client.login(args.username, args.password)

    status_current = safe_call(client, "POST", "/api/stat/agvStatusCurrent", {})
    uuids = safe_call(client, "GET", "/api/stat/findUUid")
    battery = safe_call(client, "POST", "/api/stat/vehicleBatteryLevel", {})
    orders = safe_call(client, "POST", "/api/getCoreRobotOrders", {})

    robots, status_counts = normalize_robot_status(status_current)
    payload = {
        "sourceUrl": args.base_url,
        "viewUrl": args.base_url.rstrip("/") + "/#/view",
        "robots": robots,
        "statusCounts": status_counts,
        "robotUuids": uuids if isinstance(uuids, list) else [],
        "battery": battery,
        "orders": orders,
        "errors": {
            "statusCurrent": status_current.get("error") if isinstance(status_current, dict) else "",
            "uuids": uuids.get("error") if isinstance(uuids, dict) else "",
            "battery": battery.get("error") if isinstance(battery, dict) else "",
            "orders": orders.get("error") if isinstance(orders, dict) else "",
        },
    }

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
