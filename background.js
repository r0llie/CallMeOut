const MINT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const ALLOWED = new Set(["axiom.trade", "gmgn.ai", "trade.padre.gg"]);
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const sessions = new Map();
let deviceKeyPromise;

function base58Decode(value) {
  let n = 0n;
  for (const c of value) {
    const digit = ALPHABET.indexOf(c);
    if (digit < 0) throw new Error("Invalid private key.");
    n = n * 58n + BigInt(digit);
  }
  const bytes = [];
  while (n) { bytes.unshift(Number(n & 255n)); n >>= 8n; }
  return Uint8Array.from([...Array((value.match(/^1+/) || [""])[0].length).fill(0), ...bytes]);
}

function base58Encode(bytes) {
  let n = 0n;
  for (const b of bytes) n = n * 256n + BigInt(b);
  let encoded = "";
  while (n) { encoded = ALPHABET[Number(n % 58n)] + encoded; n /= 58n; }
  for (const b of bytes) { if (b !== 0) break; encoded = "1" + encoded; }
  return encoded;
}

function b64(bytes) { return btoa(String.fromCharCode(...bytes)); }
function unb64(value) { return Uint8Array.from(atob(value), c => c.charCodeAt(0)); }
function b64url(value) { return unb64(value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4)); }

function parseSecret(value) {
  if (typeof value !== "string" || value.length > 1000) throw new Error("Invalid private key.");
  let bytes;
  const input = value.trim();
  if (input.startsWith("[")) {
    const numbers = JSON.parse(input);
    if (!Array.isArray(numbers) || !numbers.every(n => Number.isInteger(n) && n >= 0 && n <= 255)) throw new Error("Invalid JSON private key.");
    bytes = Uint8Array.from(numbers);
  } else bytes = base58Decode(input);
  if (bytes.length !== 32 && bytes.length !== 64) throw new Error("Solana private keys must be 32 or 64 bytes.");
  return bytes;
}

async function keypair(secret) {
  const seed = secret.slice(0, 32);
  const prefix = Uint8Array.from([0x30,0x2e,0x02,0x01,0x00,0x30,0x05,0x06,0x03,0x2b,0x65,0x70,0x04,0x22,0x04,0x20]);
  const pkcs8 = new Uint8Array(prefix.length + 32);
  pkcs8.set(prefix); pkcs8.set(seed, prefix.length);
  const key = await crypto.subtle.importKey("pkcs8", pkcs8, { name: "Ed25519" }, true, ["sign"]);
  const jwk = await crypto.subtle.exportKey("jwk", key);
  const publicBytes = b64url(jwk.x);
  if (secret.length === 64 && !secret.slice(32).every((b, i) => b === publicBytes[i])) throw new Error("Private key does not match its public key.");
  return { key, seed, address: base58Encode(publicBytes) };
}

async function vaultKey(passphrase, salt) {
  if (typeof passphrase !== "string" || passphrase.length < 10) throw new Error("Enter the previous wallet passphrase.");
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 310000 }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

async function walletStore() { return (await chrome.storage.local.get("wallets")).wallets || []; }
async function selectedWallet() { return (await chrome.storage.local.get("selectedWallet")).selectedWallet || "pump"; }

async function deviceKey() {
  if (!deviceKeyPromise) deviceKeyPromise = (async () => {
    const database = await new Promise((resolve, reject) => {
      const open = indexedDB.open("callmeout-vault", 1);
      open.onupgradeneeded = () => open.result.createObjectStore("keys");
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    try {
      const saved = await new Promise((resolve, reject) => {
        const get = database.transaction("keys", "readonly").objectStore("keys").get("device");
        get.onsuccess = () => resolve(get.result);
        get.onerror = () => reject(get.error);
      });
      if (saved) return saved;
      const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
      await new Promise((resolve, reject) => {
        const transaction = database.transaction("keys", "readwrite");
        transaction.objectStore("keys").put(key, "device");
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
      });
      return key;
    } finally { database.close(); }
  })().catch(error => { deviceKeyPromise = null; throw error; });
  return deviceKeyPromise;
}

async function importWallet(message) {
  const secret = parseSecret(message.secret);
  const pair = await keypair(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deviceKey();
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, pair.seed);
  const wallets = await walletStore();
  if (wallets.some(w => w.address === pair.address)) throw new Error("Wallet already added.");
  wallets.push({ address: pair.address, iv: b64(iv), ciphertext: b64(new Uint8Array(ciphertext)) });
  await chrome.storage.local.set({ wallets, selectedWallet: pair.address });
  secret.fill(0); pair.seed.fill(0);
  return { address: pair.address };
}

async function migrateWallet(message) {
  const wallets = await walletStore();
  const wallet = wallets.find(w => w.address === message.address);
  if (!wallet?.salt) throw new Error("No legacy wallet to migrate.");
  try {
    const key = await vaultKey(message.passphrase, unb64(wallet.salt));
    const raw = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(wallet.iv) }, key, unb64(wallet.ciphertext));
    const seed = new Uint8Array(raw);
    const pair = await keypair(seed);
    if (pair.address !== wallet.address) throw new Error("Wallet address mismatch.");
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await deviceKey(), seed);
    seed.fill(0); pair.seed.fill(0);
    delete wallet.salt;
    delete wallet.name;
    wallet.iv = b64(iv);
    wallet.ciphertext = b64(new Uint8Array(ciphertext));
    await chrome.storage.local.set({ wallets });
    sessions.delete(wallet.address);
    return { address: wallet.address };
  } catch { throw new Error("Incorrect passphrase or damaged wallet data."); }
}

async function walletsStatus() {
  const selected = await selectedWallet();
  const cookie = await chrome.cookies.get({ url: "https://pump.fun/", name: "auth_token" });
  const wallets = (await walletStore()).map(w => ({ address: w.address, legacy: !!w.salt }));
  return { selected, pumpSignedIn: !!cookie?.value, wallets };
}

async function pumpCookie() {
  return (await chrome.cookies.get({ url: "https://pump.fun/", name: "auth_token" }))?.value || null;
}

async function createPumpTab() {
  const tab = await chrome.tabs.create({ url: "https://pump.fun/", active: false });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdate);
      reject(new Error("Pump tab did not load."));
    }, 20000);
    function finish() {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdate);
      resolve();
    }
    function onUpdate(tabId, change) {
      if (tabId === tab.id && change.status === "complete") finish();
    }
    chrome.tabs.onUpdated.addListener(onUpdate);
    chrome.tabs.get(tab.id).then(current => {
      if (current.status === "complete") finish();
    }).catch(reject);
  });
  return tab.id;
}

async function pumpRequest(request) {
  const tabs = await chrome.tabs.query({ url: "https://pump.fun/*" });
  for (const tab of tabs.filter(item => item.status === "complete")) {
    let result;
    try { result = await chrome.tabs.sendMessage(tab.id, { type: "PUMP_API", request }); }
    catch { continue; }
    if (!result?.ok) throw new Error(result?.error || "Pump request failed.");
    return result.data;
  }
  const tabId = await createPumpTab();
  const result = await chrome.tabs.sendMessage(tabId, { type: "PUMP_API", request });
  if (!result?.ok) throw new Error(result?.error || "Pump request failed.");
  return result.data;
}

async function importedToken(address) {
  const current = sessions.get(address);
  if (current && current.expires > Date.now()) return current.token;
  const wallet = (await walletStore()).find(w => w.address === address);
  if (!wallet) throw new Error("Wallet not found.");
  if (wallet.salt) throw new Error("Migrate this wallet in CallMeOut settings.");
  let key;
  try {
    const raw = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(wallet.iv) }, await deviceKey(), unb64(wallet.ciphertext));
    const seed = new Uint8Array(raw);
    const pair = await keypair(seed);
    seed.fill(0); pair.seed.fill(0);
    if (pair.address !== address) throw new Error("Wallet address mismatch.");
    key = pair.key;
  } catch { throw new Error("Cannot open this wallet in the current browser profile."); }
  const timestamp = Date.now();
  const message = new TextEncoder().encode(`Sign in to pump.fun: ${timestamp}`);
  const signature = base58Encode(new Uint8Array(await crypto.subtle.sign("Ed25519", key, message)));
  const login = await api("/auth/login/token", null, {
    method: "POST",
    body: { address, signature, timestamp, authType: "non_custodial" }
  });
  if (typeof login.access_token !== "string") throw new Error("Pump token response was not recognized.");
  const token = login.access_token;
  sessions.set(address, { token, expires: Date.now() + 20 * 60 * 1000 });
  return token;
}

async function activeToken(walletId) {
  if (walletId === "pump") {
    const token = await pumpCookie();
    if (!token) throw new Error("Sign in on Pump or add a wallet.");
    return token;
  }
  if (!(await walletStore()).some(w => w.address === walletId)) throw new Error("Wallet not found.");
  return importedToken(walletId);
}

async function api(path, token, options = {}) {
  return pumpRequest({ path, token, method: options.method || "GET", body: options.body });
}

function eligible(data) {
  return data?.eligible === true && data?.preflight?.create?.verdict === "ELIGIBLE" &&
    data?.preflight?.postableAccounts?.some(account => account.verdict === "ELIGIBLE");
}

async function handle(message, fromOptions) {
  if (message.type === "WALLETS") return walletsStatus();
  if (message.type === "OPEN_SETTINGS") { await chrome.runtime.openOptionsPage(); return {}; }
  if (message.type === "SELECT_WALLET") {
    if (message.address !== "pump" && !(await walletStore()).some(w => w.address === message.address)) throw new Error("Wallet not found.");
    await chrome.storage.local.set({ selectedWallet: message.address });
    return walletsStatus();
  }
  if (["IMPORT_WALLET", "MIGRATE_WALLET", "REMOVE_WALLET"].includes(message.type)) {
    if (!fromOptions) throw new Error("Manage wallets in CallMeOut settings.");
    if (message.type === "IMPORT_WALLET") return importWallet(message);
    if (!ADDRESS.test(message.address || "")) throw new Error("Invalid wallet address.");
    if (message.type === "MIGRATE_WALLET") return migrateWallet(message);
    sessions.delete(message.address);
    if (message.type === "REMOVE_WALLET") {
      await chrome.storage.local.set({ wallets: (await walletStore()).filter(w => w.address !== message.address), selectedWallet: "pump" });
    }
    return walletsStatus();
  }
  const wallet = message.wallet || await selectedWallet();
  if (wallet !== "pump" && !(await walletStore()).some(w => w.address === wallet)) throw new Error("Wallet not found.");
  if (message.type === "STATUS") {
    try {
      const token = await activeToken(wallet);
      const profile = await api("/auth/my-profile", token);
      return { signedIn: true, address: profile.address || wallet, wallet };
    } catch (error) { return { signedIn: false, wallet, error: error.message }; }
  }
  if (typeof message.mint !== "string" || !MINT.test(message.mint)) throw new Error("Enter a valid Solana mint.");
  const token = await activeToken(wallet);
  if (message.type === "ELIGIBILITY") return api(`/callout/eligibility/${message.mint}`, token);
  if (message.type === "PUBLISH") {
    const thesis = message.thesis;
    if (typeof thesis !== "string" || !thesis.trim() || thesis.length > 2000) throw new Error("Callout must be 1–2000 characters.");
    const preflight = await api(`/callout/eligibility/${message.mint}`, token);
    if (!eligible(preflight)) throw new Error(`Not eligible: ${preflight?.preflight?.create?.verdict || "unknown"}`);
    return api("/callout/create", token, { method: "POST", body: { coinMint: message.mint, thesis: thesis.trim(), chainId: 1399811149, version: 2 } });
  }
  throw new Error("Unknown action.");
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  let hostname = "";
  try { hostname = new URL(sender.url || sender.tab?.url).hostname; } catch {}
  const fromOptions = sender.id === chrome.runtime.id && sender.url?.startsWith(chrome.runtime.getURL("options.html"));
  const fromSite = ALLOWED.has(hostname);
  const siteTypes = ["WALLETS", "OPEN_SETTINGS", "SELECT_WALLET", "STATUS", "ELIGIBILITY", "PUBLISH"];
  if (!message || (!fromOptions && (!fromSite || !siteTypes.includes(message.type)))) {
    sendResponse({ ok: false, error: "Unavailable on this page." });
    return false;
  }
  handle(message, fromOptions).then(data => sendResponse({ ok: true, data })).catch(error => sendResponse({ ok: false, error: error.message || "Request failed." }));
  return true;
});

chrome.action.onClicked.addListener(tab => {
  if (!tab?.id || !tab.url) return;
  try { if (!ALLOWED.has(new URL(tab.url).hostname)) { chrome.runtime.openOptionsPage(); return; } } catch { return; }
  chrome.tabs.sendMessage(tab.id, { type: "FOCUS_COMPOSER" }).catch(() => {});
});
