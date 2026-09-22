# Rivo frontend

**Move with intent.** Vue 3 / Vite, Robinhood Chain Testnet, chain ID 46630.

```sh
npm install
npm run dev
npm test
npm run build
```

The dark workbench provides interactive model exploration, a searchable pool library, local simulation records, governance scope and an optional testnet wallet panel. Sample APY/TVL are illustrative; saving a simulation never submits a deposit.

Copy `.env.example` to `.env` for a new environment. Existing `VITE_CONTRACT_ADDRESS`, `VITE_CHAIN_ID`, `VITE_RPC_URL` and `VITE_EXPLORER_URL` keep their meaning. A zero contract address disables the faucet. Every `VITE_` value becomes public in the bundle.

Selected destinations: rivo.xyz and @rivo. Dated checks and ownership limitations are in root `list.txt`. Set `VITE_X_URL` only after confirming account control.

Robinhood Commons (HOOD), RobinhoodCommons ABI, wallet behavior, session key and pool IDs remain compatible. No new token is introduced. `#staking` continues to open saved positions. Use root `scripts/sync-frontend.ps1` to synchronize `website/a704/` without publishing.
