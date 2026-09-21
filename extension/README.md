# CallMeOut extension

A compact Pump callout composer inside Axiom, GMGN, and Padre Solana token pages. It samples the active trading panel's colors, including light and dark themes.

| Axiom | GMGN | Padre |
| --- | --- | --- |
| [Preview](axiom-preview.png) · [Light theme](axiom-light-preview.png) | [Preview](gmgn-preview.png) | [Preview](padre-preview.png) |

## Install

1. Open `chrome://extensions` or `edge://extensions` and enable Developer mode.
2. Select **Load unpacked** and choose this `extension` folder.
3. Refresh a supported Solana token page. The composer appears in the trading column.

Click the toolbar icon to focus the composer. Outside a token page, it opens the wallet page.

## Wallets

- **Pump / Phantom** uses the Pump login in the same browser profile.
- To add a Solana wallet, open **CallMeOut → Wallets** and paste its base58 private key, 32-byte seed, or 64-number JSON array. The address is derived automatically. No name or passphrase is needed.
- Switch wallets with the selector above the composer. Imported wallets sign the Pump login message automatically.
- Imported seeds are encrypted with a non-extractable browser-profile key before storage. This protects against casual inspection of extension storage; someone with access to the unlocked browser profile could still use the wallet. Only add a wallet you trust this profile to hold.
- If you added a wallet in an earlier version, **Migrate** asks for its old passphrase once and moves it to the new storage format.

The key is entered only on the extension's own page. The extension sends the login signature through an isolated Pump tab; it does not send the private key to Pump or the trading sites.

## Posting

The composer reads the Solana token mint from the page. Axiom URLs can contain a pair address, so the extension reads the actual mint from the page's Pump link. GMGN's token path and `?chain=sol&token=...` URL both work. On GMGN, the composer replaces the native Callout row when present and otherwise sits above **Basic Data**. Pump's `/callout/eligibility/{mint}` response determines posting eligibility for the selected wallet; a balance shown by a trading site may belong to another wallet.

Write a callout, press the send icon, review it, then press **Publish on Pump**. Eligibility is checked again before submission. Drafts are saved per token. The extension does not trade or bulk publish.

Pump's private frontend endpoints and the trading sites' layouts may change. This extension is not an official Pump SDK.

Run `node test_background.cjs` to verify wallet import, authentication, selection, and posting preflight.
