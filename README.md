# Harbaxis frontend

**Liquidity, on your axis.** A Vue 3 / Vite liquidity exploration workspace for Robinhood Chain Testnet (chain ID 46630).

## Local use

```sh
npm install
npm run dev
npm test
npm run build
```

The application offers pool discovery and local position previews. Pool metrics and positions are simulations; creating a preview does not deposit funds. Overview, Pools, Positions, and Governance organize the experience around distinct tasks. Governance content describes future scope.

## Public configuration

Copy `.env.example` to `.env`. The frontend reads the configured token address from `VITE_CONTRACT_ADDRESS` and uses `VITE_CHAIN_ID`, `VITE_RPC_URL`, and `VITE_EXPLORER_URL` for testnet interactions. A zero address is an unconfigured example, not a faucet deployment. Every `VITE_` value is public in a frontend bundle: keep private keys exclusively in the contract deployment environment.

Wallet connection and the HOOD faucet use the Robinhood Chain Testnet. The app checks or switches the chain before a faucet transaction. Test tokens have no cash value; the faucet does not create liquidity positions.

Set optional `VITE_X_URL` only to the confirmed official X profile, then rebuild. An empty value leaves the social destination unconfigured. Harbaxis domains and handles have not been verified or registered by this update.

## Identity and verification

Display brand: **Harbaxis**; slug: `harbaxis`. The testnet token remains Robinhood Commons (`HOOD`), and the contract/ABI remains `RobinhoodCommons`. Historical `PTV` is not a newly selected token symbol. See the root `BRAND_IDENTITY.md` for the replacement map.

`website/` and `website/a704/` share the same frontend source and current public artwork. Build each copy from its own folder. Current verification is recorded in the root `BRAND_UPDATE_SCAN.md` and `UX_VALIDATION.md`.
