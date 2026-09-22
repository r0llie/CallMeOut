# Suggested Chrome Web Store listing

**Name:** CallMeOut

**Summary:** Post Pump callouts from Axiom, GMGN, and Padre token pages.

**Description:**

Write Pump callouts in the trading panel while browsing Solana tokens on Axiom, GMGN, or Padre. CallMeOut follows the active site theme and keeps the composer compact.

- Detects the token mint on supported pages.
- Checks Pump callout eligibility for the selected wallet.
- Saves a draft for each token and asks you to review before publishing.
- Uses your Pump browser session or an imported Solana wallet for Pump sign-in.
- Lets you switch wallets in the composer.

Callouts are published only after you press **Publish on Pump**. Imported wallet keys stay encrypted in your browser profile; anyone with access to that unlocked profile may still be able to use them. This extension is independent of Pump, Axiom, GMGN, and Padre. Their APIs and layouts may change.

**Website:** https://github.com/r0llie/CallMeOut

**Support:** https://github.com/r0llie/CallMeOut/issues

**Privacy policy:** https://github.com/r0llie/CallMeOut/blob/main/PRIVACY.md

## Privacy form notes

Answer the Web Store data disclosure questions based on the current extension and review the form labels before submission. The extension handles wallet addresses, optional private keys, Pump session data, and user-written drafts. State the relevant data types and that they are used only to provide wallet authentication, eligibility, and callout publishing. Do not claim that no user data is handled merely because there is no developer server.

**Single purpose:** Let users compose and publish Pump callouts from supported Solana trading pages.

**Permission justification:** `storage` saves drafts, wallet selection, and encrypted imported wallets locally. `cookies` reads the Pump login cookie for the current browser session. Pump host access supports sign-in, eligibility checks, and publishing. Axiom, GMGN, and Padre host access identifies the token and places the composer in the trading panel.

**Reviewer test steps:** Open a supported Solana token page on Axiom, GMGN, or Padre and refresh after installation. The composer appears in the trading panel. The Wallets page can be opened through the toolbar action. Publishing requires a signed-in Pump account with a token position that Pump considers eligible; no sample credentials or private keys are provided.
