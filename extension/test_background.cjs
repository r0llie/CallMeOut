const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

let listener;
let verdict = "ELIGIBLE";
const requests = [];
const storage = {};
const keys = new Map();
let initialized = false;
const indexedDB = {
  open: () => {
    const request = {};
    const database = {
      createObjectStore: () => {},
      close: () => {},
      transaction: (_, mode) => {
        const transaction = {
          objectStore: () => ({
            get: name => {
              const get = {};
              queueMicrotask(() => { get.result = keys.get(name); get.onsuccess(); });
              return get;
            },
            put: (key, name) => queueMicrotask(() => { keys.set(name, key); transaction.oncomplete(); })
          })
        };
        return transaction;
      }
    };
    request.result = database;
    queueMicrotask(() => {
      if (!initialized) { initialized = true; request.onupgradeneeded(); }
      request.onsuccess();
    });
    return request;
  }
};
const mock = {
  chrome: {
    cookies: { get: async () => ({ value: "pump-cookie" }) },
    storage: { local: {
      get: async key => ({ [key]: storage[key] }),
      set: async values => Object.assign(storage, values)
    } },
    runtime: { id: "extension", getURL: path => `chrome-extension://extension/${path}`, openOptionsPage: async () => {}, onMessage: { addListener: callback => { listener = callback; } } },
    tabs: {
      query: async () => [{ id: 1, status: "complete" }],
      sendMessage: async (id, message) => {
        requests.push({ url: "pump-tab-login", options: message });
        return { ok: true, token: "imported-jwt" };
      }
    },
    action: { onClicked: { addListener: () => {} } }
  },
  fetch: async (url, options) => {
    requests.push({ url, options });
    let data;
    if (url.endsWith("/auth/my-profile")) data = { address: "wallet" };
    else if (url.includes("/callout/eligibility/")) data = {
      eligible: verdict === "ELIGIBLE",
      preflight: { create: { verdict }, postableAccounts: [{ verdict, position: { valueUsd: 2.5 } }] }
    };
    else if (url.endsWith("/callout/create")) data = { callout: { calloutId: "created" } };
    else throw new Error(`Unexpected URL: ${url}`);
    return { ok: true, json: async () => data };
  },
  crypto: webcrypto, indexedDB, TextEncoder, Uint8Array, BigInt, atob, btoa, AbortController, setTimeout, clearTimeout, URL, Date
};
vm.runInNewContext(fs.readFileSync(__dirname + "/background.js", "utf8"), mock);
function send(message, url = "https://gmgn.ai/sol/token/test") {
  return new Promise(resolve => listener(message, { url, id: url.startsWith("chrome-extension:") ? "extension" : undefined }, resolve));
}
const optionsUrl = "chrome-extension://extension/options.html";

(async () => {
  const mint = "Aot9Eqe7Qs8UYk22vHi2Uq1fhguec86RpCd5EhTPpump";
  assert.equal((await send({ type: "STATUS" })).data.signedIn, true);
  assert.equal((await send({ type: "ELIGIBILITY", mint })).data.eligible, true);
  assert.equal((await send({ type: "PUBLISH", mint, thesis: "Original thesis" }, "https://example.com/")).ok, false);
  verdict = "EXISTING_CALLOUT";
  assert.equal((await send({ type: "PUBLISH", mint, thesis: "Original thesis" })).ok, false);
  assert.equal(requests.filter(r => r.url.endsWith("/callout/create")).length, 0);
  verdict = "ELIGIBLE";
  assert.equal((await send({ type: "PUBLISH", mint, thesis: "Original thesis" })).data.callout.calloutId, "created");
  const create = requests.find(r => r.url.endsWith("/callout/create"));
  assert.equal(create.options.headers.Authorization, "Bearer pump-cookie");

  const seed = webcrypto.getRandomValues(new Uint8Array(32));
  assert.equal((await send({ type: "IMPORT_WALLET", secret: JSON.stringify([...seed]) })).ok, false);
  const imported = await send({ type: "IMPORT_WALLET", secret: JSON.stringify([...seed]) }, optionsUrl);
  assert.equal(imported.ok, true);
  const address = imported.data.address;
  assert.match(address, /^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
  assert.equal(storage.wallets[0].secret, undefined);
  assert.ok(storage.wallets[0].ciphertext);
  assert.equal(storage.wallets[0].salt, undefined);
  assert.equal(keys.get("device").extractable, false);
  assert.equal((await send({ type: "STATUS", wallet: address })).data.signedIn, true);
  const login = requests.find(r => r.url === "pump-tab-login");
  assert.equal(login.options.payload.address, address);
  assert.equal((await send({ type: "ELIGIBILITY", mint, wallet: address })).ok, true);
  const latest = requests.at(-1);
  assert.equal(latest.options.headers.Authorization, "Bearer imported-jwt");
  assert.equal((await send({ type: "STATUS", wallet: address })).data.signedIn, true);
  const oldPassphrase = "previous-passphrase";
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const material = await webcrypto.subtle.importKey("raw", new TextEncoder().encode(oldPassphrase), "PBKDF2", false, ["deriveKey"]);
  const oldKey = await webcrypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 310000 }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const ciphertext = await webcrypto.subtle.encrypt({ name: "AES-GCM", iv }, oldKey, seed);
  storage.wallets[0] = { address, name: "Old name", salt: btoa(String.fromCharCode(...salt)), iv: btoa(String.fromCharCode(...iv)), ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext))) };
  assert.equal((await send({ type: "MIGRATE_WALLET", address, passphrase: oldPassphrase })).ok, false);
  assert.equal((await send({ type: "MIGRATE_WALLET", address, passphrase: oldPassphrase }, optionsUrl)).ok, true);
  assert.equal(storage.wallets[0].salt, undefined);
  assert.equal(storage.wallets[0].name, undefined);
  assert.equal((await send({ type: "STATUS", wallet: address })).data.signedIn, true);
  console.log("background wallet/auth/preflight checks passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
