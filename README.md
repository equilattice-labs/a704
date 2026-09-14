# Depthalis deployment
The frontend reads the deployed contract from `VITE_CONTRACT_ADDRESS` in `.env`.
Set your private key only in the deployment environment (never commit it). The app supports Robinhood Chain Testnet (chain id 46630) and prompts users to switch networks before signing.

