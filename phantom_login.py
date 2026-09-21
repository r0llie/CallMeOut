"""One-time localhost Phantom login for the Pump Callout client.

Run ``python phantom_login.py --mint TOKEN_MINT``. Nothing is published.
"""

from __future__ import annotations

import argparse
import json
import secrets
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from pump_callout import CalloutAPIError, PumpCalloutClient


PAGE = r"""<!doctype html>
<html lang="en"><meta charset="utf-8"><title>Pump Phantom login</title>
<style>body{font:16px system-ui;max-width:580px;margin:10vh auto;padding:0 20px;line-height:1.5}button{padding:12px 18px;font:inherit}pre{white-space:pre-wrap}</style>
<h1>Sign in to Pump with Phantom</h1>
<p>This page connects only to the local Python SDK. Phantom will ask you to sign a Pump login message, not a transaction.</p>
<button id="go">Connect Phantom</button><pre id="status"></pre>
<script>
const nonce = __NONCE__;
function base58(bytes) {
  const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let n=0n; for(const b of bytes) n=n*256n+BigInt(b);
  let out=''; while(n>0n){out=alphabet[Number(n%58n)]+out;n/=58n}
  for(const b of bytes){if(b!==0)break;out='1'+out}
  return out;
}
document.getElementById('go').onclick=async()=>{
  const status=document.getElementById('status');
  try {
    const provider=window.phantom?.solana || window.solana;
    if(!provider?.isPhantom) throw Error('Phantom was not found. Open this page in a browser with Phantom installed.');
    const connected=await provider.connect();
    const address=connected.publicKey.toString();
    const timestamp=Date.now();
    const message=`Sign in to pump.fun: ${timestamp}`;
    status.textContent='Waiting for Phantom signature: '+message;
    const signed=await provider.signMessage(new TextEncoder().encode(message),'utf8');
    const response=await fetch('/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nonce,address,timestamp,signature:base58(signed.signature)})});
    const result=await response.json();
    if(!response.ok) throw Error(result.error || 'Login failed');
    status.textContent='Signed in. You can close this tab.';
  } catch(error) { status.textContent=error.message; }
};
</script></html>"""


def login_with_phantom(timeout_seconds: int = 300) -> PumpCalloutClient:
    client = PumpCalloutClient()
    nonce = secrets.token_urlsafe(24)
    state: dict[str, object] = {}

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def reply(self, code: int, data: dict):
            body = json.dumps(data).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            if self.path != "/":
                self.send_error(404)
                return
            body = PAGE.replace("__NONCE__", json.dumps(nonce)).encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_POST(self):
            if self.path != "/login" or self.headers.get("Content-Type", "").split(";")[0] != "application/json":
                self.send_error(404)
                return
            if int(self.headers.get("Content-Length", "0")) > 2048:
                self.send_error(413)
                return
            try:
                data = json.loads(self.rfile.read(int(self.headers.get("Content-Length", "0"))))
                if data.get("nonce") != nonce:
                    raise ValueError("Invalid login request")
                address, signature, timestamp = data["address"], data["signature"], data["timestamp"]
                if not isinstance(address, str) or not isinstance(signature, str) or not isinstance(timestamp, int):
                    raise ValueError("Invalid login fields")
                result = client.login_session(address, signature, timestamp)
                profile = client.my_profile()
                if result.get("address") != address or profile.get("address") != address:
                    raise ValueError("Session address mismatch")
                state["address"] = address
                self.reply(200, {"ok": True})
                threading.Thread(target=self.server.shutdown, daemon=True).start()
            except (CalloutAPIError, ValueError, KeyError, json.JSONDecodeError) as exc:
                self.reply(400, {"error": str(exc)})

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    timer = threading.Timer(timeout_seconds, server.shutdown)
    timer.start()
    url = f"http://127.0.0.1:{server.server_port}/"
    print("Phantom login page:", url)
    webbrowser.open(url)
    try:
        server.serve_forever(poll_interval=0.2)
    finally:
        timer.cancel()
        server.server_close()
    if "address" not in state:
        raise TimeoutError("Phantom login timed out")
    print("Login successful. Wallet:", str(state["address"])[:6] + "...")
    return client


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Open a Pump session with Phantom without publishing a callout")
    parser.add_argument("--mint", help="Token mint to check for eligibility after login")
    args = parser.parse_args()
    session = login_with_phantom()
    if args.mint:
        eligibility = session.eligibility(args.mint)
        print(json.dumps({
            "eligible": eligibility.get("eligible"),
            "create": eligibility.get("preflight", {}).get("create"),
        }, ensure_ascii=False, indent=2))
