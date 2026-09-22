chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "PUMP_LOGIN_TOKEN" || sender.id !== chrome.runtime.id) return false;
  (async () => {
    try {
      const response = await fetch("https://frontend-api-v3.pump.fun/auth/login/token", {
        method: "POST",
        credentials: "omit",
        headers: { "Accept": "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(message.payload)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.message === "string" ? data.message : `Pump sign-in failed: ${response.status}`);
      if (typeof data.access_token !== "string") throw new Error("Pump token response was not recognized.");
      sendResponse({ ok: true, token: data.access_token });
    } catch (error) {
      sendResponse({ ok: false, error: error.message || "Pump sign-in failed." });
    }
  })();
  return true;
});
