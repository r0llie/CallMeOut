(() => {
  if (document.getElementById("callmeout-root")) return;
  const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  const host = location.hostname;
  const root = document.createElement("div");
  root.id = "callmeout-root";
  root.dataset.site = host;
  const shadow = root.attachShadow({ mode: "closed" });
  const css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = chrome.runtime.getURL("panel.css");
  shadow.append(css);
  const svg = (d, size = 16) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const chevron = svg('<path d="m7 10 5 5 5-5"/>', 14);
  const sendIcon = svg('<path d="m5 12 14-7-4 14-3-6-7-1Z"/><path d="m12 13 7-8"/>', 16);
  const refreshIcon = svg('<path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M5.7 9A7 7 0 0 1 18 7l2 5M4 12l2 5a7 7 0 0 0 12.3-2"/>', 15);
  const settingsIcon = svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06-2 2-.06-.06A1.7 1.7 0 0 0 15.87 18a1.7 1.7 0 0 0-1.2 1.6V20h-4v-.4A1.7 1.7 0 0 0 9.47 18a1.7 1.7 0 0 0-1.87.34l-.06.06-2-2 .06-.06A1.7 1.7 0 0 0 6 14.47 1.7 1.7 0 0 0 4.4 13.3H4v-4h.4A1.7 1.7 0 0 0 6 8.1a1.7 1.7 0 0 0-.4-1.87l-.06-.06 2-2 .06.06A1.7 1.7 0 0 0 9.47 4a1.7 1.7 0 0 0 1.2-1.6V2h4v.4A1.7 1.7 0 0 0 15.87 4a1.7 1.7 0 0 0 1.87-.34l.06-.06 2 2-.06.06A1.7 1.7 0 0 0 19.4 7.5 1.7 1.7 0 0 0 21 8.7h.4v4H21a1.7 1.7 0 0 0-1.6 1.2Z"/>', 15);
  const view = document.createElement("section");
  view.className = "composer";
  view.setAttribute("aria-label", "CallMeOut composer");
  view.innerHTML = `
    <header class="top">
      <div class="identity"><img class="logo" src="${chrome.runtime.getURL("images/callmeout.png")}" alt=""><span class="wordmark">CallMeOut</span><span class="token" id="token"></span></div>
      <button class="wallet-button" id="walletButton" type="button" aria-haspopup="true" aria-expanded="false"><span id="walletName">Wallet</span>${chevron}</button>
    </header>
    <div class="wallet-menu" id="walletMenu" hidden><div id="walletItems"></div><button class="manage" id="manage" type="button">${settingsIcon}<span>Manage wallets</span></button></div>
    <div class="mint-input" id="mintRow" hidden><label for="mint">Token mint</label><input id="mint" placeholder="Solana mint address" spellcheck="false" autocomplete="off"></div>
    <div class="entry"><label class="sr-only" for="thesis">Callout text</label><textarea id="thesis" maxlength="2000" placeholder="Write a callout..." rows="2"></textarea><button class="send" id="send" type="button" aria-label="Review callout" title="Review callout" disabled>${sendIcon}</button></div>
    <div class="bottom"><span class="elig" id="elig" data-tone="muted"><span class="state-dot"></span><span id="eligText">Checking eligibility</span></span><button class="refresh" id="refresh" type="button" aria-label="Refresh eligibility" title="Refresh eligibility">${refreshIcon}</button></div>
    <div class="notice" id="notice" role="status" aria-live="polite" hidden></div>
    <div class="review" id="review" hidden><div class="review-head">Review callout</div><div class="review-copy" id="reviewCopy"></div><div class="review-actions"><button id="edit" type="button">Edit</button><button id="confirm" type="button">Publish on Pump</button></div></div>
  `;
  shadow.append(view);
  const $ = id => shadow.getElementById(id);
  const state = { mint: "", symbol: "", wallet: "pump", signedIn: false, eligible: false, loading: false, draftTimer: null, page: "" };
  const short = value => value ? `${value.slice(0, 4)}…${value.slice(-4)}` : "";
  async function request(type, extra = {}) {
    const result = await chrome.runtime.sendMessage({ type, ...extra });
    if (!result?.ok) throw new Error(result?.error || "Request failed.");
    return result.data;
  }
  function setNotice(text, kind = "") {
    $("notice").hidden = !text;
    $("notice").textContent = text;
    $("notice").dataset.kind = kind;
  }
  function setEligibility(text, tone = "muted") {
    $("eligText").textContent = text;
    $("elig").dataset.tone = tone;
    state.eligible = tone === "good";
    updateSend();
  }
  function updateSend() {
    $("send").disabled = state.loading || !state.eligible || !$("thesis").value.trim();
  }
  function findMint() {
    const url = new URL(location.href);
    if (host === "axiom.trade") {
      if (!/^\/meme\//.test(url.pathname) || (url.searchParams.get("chain") && url.searchParams.get("chain") !== "sol")) return "";
      const links = document.querySelectorAll('a[href*="pump.fun/coin/"]');
      for (const link of links) {
        const mint = link.href.match(/pump\.fun\/coin\/([1-9A-HJ-NP-Za-km-z]{32,44})/)?.[1];
        if (mint) return mint;
      }
      return "";
    }
    if (host === "gmgn.ai") {
      const pathMint = url.pathname.match(/\/sol\/token\/([1-9A-HJ-NP-Za-km-z]{32,44})/)?.[1];
      const queryMint = url.searchParams.get("chain") === "sol" ? url.searchParams.get("token") : "";
      return pathMint || (BASE58.test(queryMint || "") ? queryMint : "");
    }
    if (host === "trade.padre.gg") return url.pathname.match(/\/trade\/solana\/([1-9A-HJ-NP-Za-km-z]{32,44})/)?.[1] || "";
    return "";
  }
  function relevant() {
    return host === "axiom.trade" ? /^\/meme\//.test(location.pathname) :
      host === "gmgn.ai" ? /^\/sol\/token\//.test(location.pathname) || (location.pathname === "/" && new URLSearchParams(location.search).get("chain") === "sol" && BASE58.test(new URLSearchParams(location.search).get("token") || "")) :
      /^\/trade\/solana\//.test(location.pathname);
  }
  function siteSymbol() {
    if (host === "trade.padre.gg") return document.querySelector("h2")?.textContent?.trim().slice(0, 16) || "";
    const title = document.title.split(/[ ↓|]/)[0].trim();
    return title.length < 18 ? title : "";
  }
  function candidate(text, selector = "span,button,div") {
    return [...document.querySelectorAll(selector)].find(el => el.children.length === 0 && el.textContent?.trim() === text && el.getBoundingClientRect().x > innerWidth * .58);
  }
  function anchor() {
    if (host === "axiom.trade") {
      const label = candidate("Make a callout");
      const button = label?.closest("button");
      return button?.parentElement ? { node: button.parentElement, hide: true } : null;
    }
    if (host === "gmgn.ai") {
      const calloutLabels = [...document.querySelectorAll("span")].filter(el => {
        const rect = el.getBoundingClientRect();
        return el.textContent?.trim() === "Callout" && rect.width > 0 && rect.x > innerWidth - 340;
      });
      for (const label of calloutLabels) {
        let row = label;
        while (row?.parentElement) {
          const rect = row.getBoundingClientRect();
          const border = parseFloat(getComputedStyle(row).borderBottomWidth);
          if (rect.width >= 250 && rect.width <= 500 && rect.height >= 40 && rect.height <= 180 && border > 0) return { node: row, hide: true };
          row = row.parentElement;
        }
      }
      const sections = ["Basic Data", "Token Audit", "Pool Info"];
      const leaves = [...document.querySelectorAll("span,div,button,h2,h3")].filter(el => {
        const rect = el.getBoundingClientRect();
        const value = el.textContent?.trim() || "";
        return sections.some(name => value.startsWith(name) && value.length <= name.length + 8) && rect.width > 0 && rect.x > innerWidth - 340;
      });
      const priority = el => sections.findIndex(name => el.textContent.trim().startsWith(name));
      leaves.sort((a, b) => priority(a) - priority(b) || a.textContent.length - b.textContent.length);
      const label = leaves[0];
      let section = label;
      while (section?.parentElement) {
        const rect = section.getBoundingClientRect();
        if (rect.width >= 250 && rect.width <= 500 && rect.height >= 25) return { node: section, hide: false };
        section = section.parentElement;
      }
      return null;
    }
    const label = candidate("Token Data & Security");
    const node = label?.closest(".MuiAccordion-root") || label?.closest('[class*="Accordion-root"]');
    return node ? { node, hide: false } : null;
  }
  function solidBackground(element) {
    for (let current = element; current; current = current.parentElement) {
      const value = getComputedStyle(current).backgroundColor;
      const alpha = value.match(/^rgba?\([^)]*,\s*([\d.]+)\)$/)?.[1];
      if (value && value !== "transparent" && (alpha === undefined || Number(alpha) > .7)) return value;
    }
    return getComputedStyle(document.body).backgroundColor || "#121212";
  }
  function applyTheme(node) {
    const slot = node.parentElement;
    const scope = slot;
    if (!scope) return;
    const base = solidBackground(slot);
    const text = getComputedStyle(scope).color;
    const nativeInput = scope.querySelector("input,textarea") || scope.parentElement?.querySelector("input,textarea");
    const field = nativeInput ? solidBackground(nativeInput) : base;
    const buttons = scope.parentElement ? [...scope.querySelectorAll("button"), ...scope.parentElement.querySelectorAll("button")] : [...scope.querySelectorAll("button")];
    const buy = buttons.find(button => /^Buy\b/i.test(button.textContent?.trim() || ""));
    const accent = buy && getComputedStyle(buy).backgroundColor;
    root.style.setProperty("--cm-bg", base);
    root.style.setProperty("--cm-text", text);
    root.style.setProperty("--cm-field", field);
    if (accent && accent !== "transparent") {
      root.style.setProperty("--cm-accent", accent);
      root.style.setProperty("--cm-accent-ink", getComputedStyle(buy).color);
    }
  }
  let mountedPlacement = null;
  let mountedDisplay = "";
  function place() {
    if (!relevant()) {
      if (mountedPlacement?.hide) mountedPlacement.node.style.display = mountedDisplay;
      mountedPlacement = null;
      root.remove();
      return;
    }
    const placement = mountedPlacement?.node.isConnected ? mountedPlacement : anchor();
    const node = placement?.node;
    if (!node?.parentElement) return;
    if (node !== mountedPlacement?.node) mountedDisplay = node.style.display;
    mountedPlacement = placement;
    if (root.parentElement !== node.parentElement || root.nextElementSibling !== node) node.parentElement.insertBefore(root, node);
    applyTheme(node);
    if (placement.hide) node.style.display = "none";
  }
  async function walletList() {
    const info = await request("WALLETS");
    state.wallet = info.selected;
    const selected = info.wallets.find(w => w.address === state.wallet);
    $("walletName").textContent = state.wallet === "pump" ? "Pump / Phantom" : selected ? `Wallet ${short(selected.address)}` : "Wallet";
    const items = $("walletItems");
    items.replaceChildren();
    const add = (name, address, detail, locked) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "wallet-item";
      button.dataset.active = String(state.wallet === address);
      const title = document.createElement("strong"); title.textContent = name;
      const sub = document.createElement("small"); sub.textContent = detail;
      button.append(title, sub);
      button.addEventListener("click", async () => {
        try {
          await request("SELECT_WALLET", { address });
          $("walletMenu").hidden = true; $("walletButton").setAttribute("aria-expanded", "false");
          await walletList();
          await refreshSession();
          if (locked) await request("OPEN_SETTINGS");
        } catch (error) { setNotice(error.message, "error"); }
      });
      items.append(button);
    };
    add("Pump / Phantom", "pump", info.pumpSignedIn ? "Connected" : "Sign in on Pump", !info.pumpSignedIn);
    info.wallets.forEach(w => add(`Wallet ${short(w.address)}`, w.address, w.legacy ? "Migration needed" : "Auto sign", w.legacy));
  }
  async function refreshSession() {
    state.eligible = false;
    setEligibility("Checking wallet");
    try {
      const status = await request("STATUS", { wallet: state.wallet });
      state.signedIn = status.signedIn;
      if (!status.signedIn) {
        setEligibility(state.wallet === "pump" ? "Sign in on Pump" : "Wallet unavailable", "warn");
        setNotice(state.wallet !== "pump" && status.error ? status.error : "", "error");
        return;
      }
      setNotice("");
      await refreshEligibility();
    } catch (error) { setEligibility(error.message, "bad"); }
  }
  async function refreshEligibility() {
    const mint = state.mint || $("mint").value.trim();
    if (!BASE58.test(mint)) { setEligibility("Token mint needed", "warn"); return; }
    if (!state.signedIn) { setEligibility("Connect a wallet", "warn"); return; }
    state.loading = true; updateSend(); setEligibility("Checking position");
    const wallet = state.wallet;
    try {
      const data = await request("ELIGIBILITY", { mint, wallet });
      if (wallet !== state.wallet || mint !== state.mint) return;
      const create = data.preflight?.create || {};
      const accounts = data.preflight?.postableAccounts || [];
      const account = accounts.find(a => a.verdict === "ELIGIBLE") || accounts[0];
      const value = account?.position?.valueUsd;
      if (data.eligible && create.verdict === "ELIGIBLE" && account?.verdict === "ELIGIBLE") {
        setEligibility(Number.isFinite(value) ? `Eligible · $${value.toFixed(2)} held` : "Eligible to post", "good");
      } else if (create.verdict === "EXISTING_CALLOUT") setEligibility("Already posted", "warn");
      else if (create.verdict === "INSUFFICIENT_BALANCE") setEligibility("Hold $1 to post", "warn");
      else if (Number.isFinite(value)) setEligibility(`Not eligible · $${value.toFixed(2)} held`, "warn");
      else setEligibility("Not eligible to post", "warn");
    } catch (error) { setEligibility(error.message, "bad"); }
    finally { state.loading = false; updateSend(); }
  }
  async function updatePage() {
    const page = location.href;
    const mint = findMint();
    const symbol = siteSymbol();
    if (state.page === page && state.mint === mint && state.symbol === symbol) return;
    state.page = page; state.mint = mint; state.symbol = symbol;
    $("token").textContent = symbol ? `$${symbol}` : "";
    $("mintRow").hidden = !!mint;
    $("mint").value = mint;
    const draft = await chrome.storage.local.get(`draft:${mint}`);
    $("thesis").value = draft[`draft:${mint}`] || "";
    updateSend();
    if (state.signedIn) await refreshEligibility();
  }
  $("walletButton").addEventListener("click", () => {
    const open = $("walletMenu").hidden;
    $("walletMenu").hidden = !open;
    $("walletButton").setAttribute("aria-expanded", String(open));
  });
  $("manage").addEventListener("click", () => request("OPEN_SETTINGS").catch(error => setNotice(error.message, "error")));
  $("refresh").addEventListener("click", () => { walletList().then(refreshSession).catch(error => setNotice(error.message, "error")); });
  $("mint").addEventListener("change", () => { state.mint = $("mint").value.trim(); refreshEligibility(); });
  $("thesis").addEventListener("input", () => {
    updateSend();
    clearTimeout(state.draftTimer);
    if (BASE58.test(state.mint)) state.draftTimer = setTimeout(() => chrome.storage.local.set({ [`draft:${state.mint}`]: $("thesis").value }), 350);
  });
  $("send").addEventListener("click", () => {
    if ($("send").disabled) return;
    $("reviewCopy").textContent = $("thesis").value.trim();
    $("review").hidden = false;
  });
  $("edit").addEventListener("click", () => { $("review").hidden = true; $("thesis").focus(); });
  $("confirm").addEventListener("click", async () => {
    const button = $("confirm");
    button.disabled = true; button.textContent = "Publishing…";
    try {
      const result = await request("PUBLISH", { mint: state.mint, wallet: state.wallet, thesis: $("thesis").value.trim() });
      $("review").hidden = true;
      setNotice("Callout published.", "success");
      const id = result.callout?.calloutId;
      if (id) {
        const link = document.createElement("a");
        link.href = `https://pump.fun/callouts/${state.mint}/${id}`;
        link.target = "_blank"; link.rel = "noopener noreferrer"; link.textContent = " View on Pump";
        $("notice").append(link);
      }
      await chrome.storage.local.remove(`draft:${state.mint}`);
      await refreshEligibility();
    } catch (error) { $("review").hidden = true; setNotice(error.message, "error"); }
    finally { button.disabled = false; button.textContent = "Publish on Pump"; }
  });
  shadow.addEventListener("keydown", event => {
    if (event.key === "Escape") { $("review").hidden = true; $("walletMenu").hidden = true; $("walletButton").setAttribute("aria-expanded", "false"); }
  });
  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === "FOCUS_COMPOSER") {
      place(); root.scrollIntoView({ behavior: "smooth", block: "center" }); $("thesis").focus();
    }
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && (changes.wallets || changes.selectedWallet)) walletList().then(refreshSession).catch(() => {});
  });
  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; place(); updatePage(); }, 320);
  });
  observer.observe(document.documentElement, { subtree: true, childList: true });
  place(); updatePage(); walletList().then(refreshSession).catch(error => setNotice(error.message, "error"));
  setInterval(() => { place(); updatePage(); }, 1200);
})();
