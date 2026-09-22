# CallMeOut privacy policy

Last updated: September 22, 2026

CallMeOut adds a Pump callout composer to supported Solana token pages on Axiom, GMGN, and Padre. It is an independent browser extension, not an official product of those services.

## Data the extension uses

- The current token page URL and page content needed to identify the Solana token mint, position, and active theme.
- Your Pump session cookie when you choose the Pump browser wallet.
- Your selected wallet address, callout drafts, and extension settings in Chrome's local extension storage.
- An imported Solana private key, if you choose to add one. The extension encrypts the seed with an AES-GCM key held in the same browser profile before saving it locally. No password is required. Anyone who can use your unlocked browser profile may still be able to use the imported wallet.

## Where data goes

The extension contacts Pump to sign in, read profile and callout eligibility, and submit a callout when you confirm **Publish on Pump**. Login signatures, wallet addresses, and published callout text are sent to Pump for those functions. Private keys are used locally to sign the Pump login message and are not sent to Pump or to the supported trading sites.

Callout drafts stay in browser storage until you publish or remove them. The extension has no developer-operated server, analytics, advertising, or telemetry and does not sell user data. Data sent to Pump is subject to Pump's own privacy practices.

## Control and contact

You can remove an imported wallet from the extension's Wallets page. Removing the extension or clearing its site data deletes its local storage. To request help or report a privacy issue, use [GitHub Issues](https://github.com/r0llie/CallMeOut/issues).
