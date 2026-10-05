# Brassline frontend

**Tune into the signal.** Vue 3 / Vite on Solana, with a retro prediction-market workspace skin.

The interface supports simulated event-contract discovery, local practice positions, responsive navigation, and optional read-only SOL and configured outcome-share balance checks through an injected Solana provider. The configured market-asset mint is deployed on Testnet with 9 decimals and zero initial supply; prediction-market execution, settlement, and issuance remain unavailable.

Copy `.env.example` to `.env` and set `VITE_SOLANA_CLUSTER`, `VITE_SOLANA_RPC_URL`, and `VITE_SOLANA_EXPLORER_URL`. The public Testnet mint is configured in `VITE_TOKEN_MINT`. Never put a private key in a `VITE_` variable. `npm run deploy:testnet` verifies the existing mint idempotently; the signer is read only from the ignored workspace `key.txt`.
