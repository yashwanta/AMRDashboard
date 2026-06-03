#!/usr/bin/env python3
import argparse
import hashlib
import hmac
import http.server
import os
import secrets
import time
from http import cookies
from pathlib import Path
from urllib.parse import parse_qs


LOGIN_HTML = """<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>AMR Log Dashboard Login</title>
    <style>
      :root {{
        color-scheme: light;
        --bg: #f6f7f4;
        --ink: #1d2526;
        --muted: #667071;
        --line: #dfe4df;
        --accent: #2563eb;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }}
      * {{ box-sizing: border-box; }}
      body {{
        display: grid;
        min-height: 100vh;
        margin: 0;
        place-items: center;
        background: var(--bg);
        color: var(--ink);
      }}
      main {{
        width: min(420px, calc(100vw - 32px));
        padding: 28px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: #fff;
      }}
      h1 {{ margin: 0 0 6px; font-size: 24px; }}
      p {{ margin: 0 0 22px; color: var(--muted); }}
      label {{ display: block; margin: 14px 0 6px; font-size: 13px; font-weight: 700; }}
      input {{
        width: 100%;
        height: 42px;
        padding: 8px 10px;
        border: 1px solid var(--line);
        border-radius: 6px;
        font: inherit;
      }}
      button {{
        width: 100%;
        height: 42px;
        margin-top: 18px;
        border: 0;
        border-radius: 6px;
        background: var(--accent);
        color: #fff;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }}
      .error {{
        margin: 12px 0 0;
        color: #c2410c;
        font-size: 13px;
      }}
    </style>
  </head>
  <body>
    <main>
      <h1>AMR Log Dashboard</h1>
      <p>Sign in to view server logs.</p>
      <form method="post" action="/login">
        <label for="username">Username</label>
        <input id="username" name="username" autocomplete="username" autofocus required>
        <label for="password">Password</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required>
        <button type="submit">Sign in</button>
      </form>
      {error}
    </main>
  </body>
</html>"""


class LoginDashboardHandler(http.server.SimpleHTTPRequestHandler):
    server_version = "AMRLogDashboard/1.0"

    def do_GET(self):
        if self.path == "/login":
            self.show_login()
            return
        if self.path == "/logout":
            self.clear_session()
            self.send_response(302)
            self.send_header("Location", "/login")
            self.end_headers()
            return
        if not self.is_authenticated():
            self.send_response(302)
            self.send_header("Location", "/login")
            self.end_headers()
            return
        super().do_GET()

    def do_POST(self):
        if self.path != "/login":
            self.send_error(404)
            return

        length = int(self.headers.get("Content-Length", "0"))
        fields = parse_qs(self.rfile.read(length).decode("utf-8", errors="replace"))
        username = fields.get("username", [""])[0]
        password = fields.get("password", [""])[0]

        if hmac.compare_digest(username, self.server.login_user) and hmac.compare_digest(password, self.server.login_password):
            token = self.make_session(username)
            self.send_response(302)
            self.send_header("Set-Cookie", f"amr_session={token}; HttpOnly; SameSite=Lax; Path=/")
            self.send_header("Location", "/")
            self.end_headers()
            return

        self.show_login("Invalid username or password.")

    def show_login(self, error=""):
        error_html = f'<p class="error">{error}</p>' if error else ""
        body = LOGIN_HTML.format(error=error_html).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def clear_session(self):
        self.send_header("Set-Cookie", "amr_session=; Max-Age=0; HttpOnly; SameSite=Lax; Path=/")

    def make_session(self, username):
        expiry = int(time.time()) + self.server.session_seconds
        payload = f"{username}:{expiry}:{secrets.token_hex(16)}"
        sig = hmac.new(self.server.secret, payload.encode("utf-8"), hashlib.sha256).hexdigest()
        return f"{payload}:{sig}"

    def is_authenticated(self):
        raw = self.headers.get("Cookie", "")
        jar = cookies.SimpleCookie(raw)
        morsel = jar.get("amr_session")
        if not morsel:
            return False
        parts = morsel.value.rsplit(":", 1)
        if len(parts) != 2:
            return False
        payload, signature = parts
        expected = hmac.new(self.server.secret, payload.encode("utf-8"), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected):
            return False
        try:
            expiry = int(payload.split(":")[1])
        except (IndexError, ValueError):
            return False
        return expiry >= int(time.time())


def main():
    parser = argparse.ArgumentParser(description="Serve the AMR dashboard behind a simple login.")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8885)
    parser.add_argument("--dashboard", default=str(Path(__file__).resolve().parents[1] / "dashboard"))
    parser.add_argument("--user", default=os.environ.get("AMR_DASH_USER", "admin"))
    parser.add_argument("--password", default=os.environ.get("AMR_DASH_PASSWORD", "admin123"))
    parser.add_argument("--session-hours", type=int, default=12)
    args = parser.parse_args()

    dashboard = Path(args.dashboard).resolve()
    if not dashboard.exists():
        raise SystemExit(f"Dashboard folder not found: {dashboard}")

    os.chdir(dashboard)
    httpd = http.server.ThreadingHTTPServer((args.host, args.port), LoginDashboardHandler)
    httpd.login_user = args.user
    httpd.login_password = args.password
    httpd.session_seconds = args.session_hours * 60 * 60
    httpd.secret = os.environ.get("AMR_DASH_SECRET", secrets.token_hex(32)).encode("utf-8")

    print(f"Serving dashboard with login at http://{args.host}:{args.port}")
    print(f"Username: {args.user}")
    if args.password == "admin123":
        print("Default password is admin123. Set AMR_DASH_PASSWORD before production use.")
    httpd.serve_forever()


if __name__ == "__main__":
    main()

