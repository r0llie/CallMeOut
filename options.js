const $ = id => document.getElementById(id);
const short = address => `${address.slice(0, 5)}…${address.slice(-5)}`;
let legacyAddress = "";
async function request(type, extra = {}) {
  const response = await chrome.runtime.sendMessage({ type, ...extra });
  if (!response?.ok) throw new Error(response?.error || "Request failed.");
  return response.data;
}
function feedback(message, kind = "") { $("feedback").textContent = message; $("feedback").dataset.kind = kind; }
function button(label, className, handler) {
  const el = document.createElement("button");
  el.type = "button"; el.className = className; el.textContent = label;
  el.addEventListener("click", async () => {
    el.disabled = true;
    try { await handler(); await render(); } catch (error) { feedback(error.message, "error"); }
    finally { el.disabled = false; }
  });
  return el;
}
async function render() {
  const status = await request("WALLETS");
  const list = $("walletList"); list.replaceChildren();
  function addRow(title, detail, glyph, actions) {
    const row = document.createElement("div"); row.className = "wallet-row";
    const icon = document.createElement("span"); icon.className = "wallet-icon"; icon.textContent = glyph;
    const info = document.createElement("div"); info.className = "wallet-info";
    const name = document.createElement("strong"); name.textContent = title;
    const sub = document.createElement("small"); sub.textContent = detail;
    info.append(name, sub);
    const controls = document.createElement("div"); controls.className = "wallet-actions"; controls.append(...actions);
    row.append(icon, info, controls); list.append(row);
  }
  addRow("Pump / Phantom", status.pumpSignedIn ? "Browser session connected" : "Sign in on Pump", "P", [
    status.selected === "pump" ? button("Selected", "selected", async () => {}) : button("Select", "", async () => request("SELECT_WALLET", { address: "pump" })),
    !status.pumpSignedIn ? button("Open Pump", "", async () => chrome.tabs.create({ url: "https://pump.fun/" })) : document.createTextNode("")
  ]);
  for (const wallet of status.wallets) {
    const title = `Wallet ${short(wallet.address)}`;
    const actions = [];
    if (wallet.legacy) {
      actions.push(button("Migrate", "", async () => {
        legacyAddress = wallet.address;
        $("legacyPassphrase").value = "";
        $("legacyDialog").showModal();
      }));
    } else {
      actions.push(status.selected === wallet.address ? button("Selected", "selected", async () => {}) :
        button("Select", "", async () => request("SELECT_WALLET", { address: wallet.address })));
    }
    actions.push(button("×", "remove", async () => {
      if (confirm(`Remove ${title} from CallMeOut?`)) {
        await request("REMOVE_WALLET", { address: wallet.address });
        feedback("Wallet removed.");
      }
    }));
    actions.at(-1).setAttribute("aria-label", `Remove ${title}`);
    addRow(title, wallet.legacy ? "Migration needed" : "Auto sign ready", "S", actions);
  }
}
$("importForm").addEventListener("submit", async event => {
  event.preventDefault();
  const add = $("add"); add.disabled = true;
  try {
    const result = await request("IMPORT_WALLET", { secret: $("secret").value });
    $("secret").value = "";
    feedback(`Wallet ${short(result.address)} added.`);
    await render();
  } catch (error) { feedback(error.message, "error"); }
  finally { add.disabled = false; }
});
$("legacyCancel").addEventListener("click", () => $("legacyDialog").close());
$("legacyForm").addEventListener("submit", async event => {
  event.preventDefault();
  const submit = $("legacySubmit"); submit.disabled = true;
  try {
    await request("MIGRATE_WALLET", { address: legacyAddress, passphrase: $("legacyPassphrase").value });
    $("legacyPassphrase").value = "";
    $("legacyDialog").close();
    feedback("Wallet migrated.");
    await render();
  } catch (error) { feedback(error.message, "error"); }
  finally { submit.disabled = false; }
});
render().catch(error => feedback(error.message, "error"));
