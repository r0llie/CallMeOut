const API = "https://frontend-api-v3.pump.fun";
const MINT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function allowedRequest(request) {
  if (!request || typeof request.path !== "string") return false;
  if (request.path === "/auth/login/token") return request.method === "POST" && !request.token;
  if (request.path === "/callout/create") return request.method === "POST" && typeof request.token === "string";
  if (request.path === "/auth/my-profile") return request.method === "GET" && typeof request.token === "string";
  const mint = request.path.match(/^\/callout\/eligibility\/([^/]+)$/)?.[1];
  return !!mint && MINT.test(mint) && request.method === "GET" && typeof request.token === "string";
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "PUMP_API" || sender.id !== chrome.runtime.id) return false;
  (async () => {
    try {
      const request = message.request;
      if (!allowedRequest(request)) throw new Error("Unsupported Pump request.");
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      let response;
      try {
        response = await fetch(API + request.path, {
          method: request.method,
          credentials: "omit",
          signal: controller.signal,
          headers: {
            "Accept": "application/json",
            ...(request.token ? { "Authorization": `Bearer ${request.token}` } : {}),
            ...(request.body ? { "Content-Type": "application/json" } : {})
          },
          body: request.body ? JSON.stringify(request.body) : undefined
        });
      } finally { clearTimeout(timer); }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.message === "string" ? data.message.slice(0, 220) : `Pump API: ${response.status}`);
      sendResponse({ ok: true, data });
    } catch (error) {
      sendResponse({ ok: false, error: error.message || "Pump request failed." });
    }
  })();
  return true;
});
