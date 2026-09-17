# Fluxenote frontend

**Make room for understanding.** Vue 3 / Vite on Robinhood Chain Testnet, chain ID 46630.

```sh
npm install
npm run dev
npm test
npm run build
```

The editorial interface includes an introduction, searchable model comparison, a local practice notebook, governance scope, preview forms and a testnet wallet panel. Pool figures are illustrative. Saving a preview does not move assets or submit a deposit.

Copy `.env.example` to `.env` for a new environment. `VITE_CONTRACT_ADDRESS`, `VITE_CHAIN_ID`, `VITE_RPC_URL` and `VITE_EXPLORER_URL` keep their existing meaning. A zero address disables the faucet. Every `VITE_` value becomes public in the bundle.

Selected destinations are fluxenote.xyz and @fluxenote; dated checks and ownership limits are in the root `list.txt`. Set `VITE_X_URL` only after confirming account control.

Robinhood Commons (HOOD), the RobinhoodCommons ABI, network settings and wallet logic remain compatible. PTV is an illustrative symbol and no new project token is introduced. Existing session keys and pool IDs preserve saved previews. `#staking` still opens positions.

`website/a704/` is the secondary copy. Run root `scripts/sync-frontend.ps1` before building it. See root `UX_VALIDATION.md` and `BRAND_UPDATE_SCAN.md` for verification.
