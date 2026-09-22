# Zuno frontend

**Find your flow.** Vue 3 / Vite on Robinhood Chain Testnet, chain ID 46630.

```sh
npm install
npm run dev
npm test
npm run build
```

A compact crypto interface for sample-pool discovery, asset-mix practice, saved local positions, governance context, and an optional testnet wallet. Sample APY/TVL are illustrative; saving a practice position submits no deposit.

Copy `.env.example` to `.env` for a new environment. Existing `VITE_CONTRACT_ADDRESS`, `VITE_CHAIN_ID`, `VITE_RPC_URL`, and `VITE_EXPLORER_URL` retain their meaning. A zero contract address disables the faucet. Every `VITE_` value is public in the bundle.

Domain and X destinations are TBD. Set `VITE_X_URL` only after choosing an account and confirming control.

Robinhood Commons (HOOD), RobinhoodCommons ABI, wallet behavior, session key, and pool IDs remain compatible. No new token is introduced. `#staking` continues to open saved positions. Use root `scripts/sync-frontend.ps1` to synchronize `website/a704/` without publishing.
