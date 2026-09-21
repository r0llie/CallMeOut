"""Small, unofficial Pump Callout client based on browser HAR captures.

No wallet key material is accepted or stored. The caller supplies a Phantom
signature for ``Sign in to pump.fun: <timestamp_ms>``.
"""

from __future__ import annotations

import http.cookiejar
import json
from dataclasses import dataclass
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import HTTPCookieProcessor, Request, build_opener


BASE_URL = "https://frontend-api-v3.pump.fun"
SOLANA_CHAIN_ID = 1399811149


class CalloutAPIError(RuntimeError):
    def __init__(self, status: int | None, message: str):
        self.status = status
        super().__init__(f"Pump API ({status}): {message}")


@dataclass(frozen=True)
class CalloutDraft:
    mint: str
    thesis: str

    def __post_init__(self) -> None:
        if not self.mint or "/" in self.mint or "?" in self.mint:
            raise ValueError("Enter a valid token mint address")
        if not self.thesis.strip():
            raise ValueError("Callout thesis cannot be empty")


class PumpCalloutClient:
    """Private frontend API wrapper; endpoints can change without notice."""

    def __init__(self, base_url: str = BASE_URL):
        self.base_url = base_url.rstrip("/")
        self.cookies = http.cookiejar.CookieJar()
        self._opener = build_opener(HTTPCookieProcessor(self.cookies))

    def _request(self, method: str, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        body = None if payload is None else json.dumps(payload, separators=(",", ":")).encode("utf-8")
        request = Request(
            self.base_url + path,
            data=body,
            method=method,
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Origin": "https://pump.fun",
            },
        )
        try:
            with self._opener.open(request, timeout=20) as response:
                return json.load(response)
        except HTTPError as exc:
            try:
                error = json.load(exc)
                message = str(error.get("message", "HTTP error"))
            except (ValueError, AttributeError):
                message = "HTTP error"
            raise CalloutAPIError(exc.code, message) from exc
        except (URLError, TimeoutError) as exc:
            raise CalloutAPIError(None, "Network request failed") from exc

    def login_session(self, address: str, signature: str, timestamp_ms: int) -> dict[str, Any]:
        """Create an auth_token cookie session from a Phantom message signature."""
        if not address or not signature or timestamp_ms <= 0:
            raise ValueError("Address, signature, and millisecond timestamp are required")
        result = self._request("POST", "/auth/login/session", {
            "address": address,
            "signature": signature,
            "timestamp": timestamp_ms,
            "authType": "non_custodial",
        })
        if not any(cookie.name == "auth_token" for cookie in self.cookies):
            raise CalloutAPIError(None, "Login response did not set an auth_token cookie")
        return result

    def my_profile(self) -> dict[str, Any]:
        return self._request("GET", "/auth/my-profile")

    def eligibility(self, mint: str) -> dict[str, Any]:
        return self._request("GET", "/callout/eligibility/" + quote(mint, safe=""))

    def callout(self, callout_id: str) -> dict[str, Any]:
        return self._request("GET", "/callout/" + quote(callout_id, safe=""))

    def list_for_wallet(self, address: str) -> dict[str, Any]:
        return self._request("GET", "/callout/list/" + quote(address, safe=""))

    def publish(self, draft: CalloutDraft, *, confirm: bool = False) -> dict[str, Any]:
        """Check preflight and create one callout after explicit caller confirmation."""
        if not confirm:
            raise ValueError("Publishing requires confirm=True")
        eligibility = self.eligibility(draft.mint)
        create = eligibility.get("preflight", {}).get("create", {})
        accounts = eligibility.get("preflight", {}).get("postableAccounts", [])
        if not eligibility.get("eligible") or create.get("verdict") != "ELIGIBLE":
            raise CalloutAPIError(None, f"Callout ineligible: {create.get('verdict', eligibility.get('reason'))}")
        if not any(a.get("verdict") == "ELIGIBLE" for a in accounts):
            raise CalloutAPIError(None, "No eligible account can publish this callout")
        return self._request("POST", "/callout/create", {
            "coinMint": draft.mint,
            "thesis": draft.thesis,
            "chainId": SOLANA_CHAIN_ID,
            "version": 2,
        })
