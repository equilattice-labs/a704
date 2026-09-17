<<<<<<< HEAD
export const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000'
export const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || 46630)
export const RPC_URL = import.meta.env.VITE_RPC_URL || 'https://rpc.testnet.chain.robinhood.com'
export const EXPLORER_URL = import.meta.env.VITE_EXPLORER_URL || 'https://explorer.testnet.chain.robinhood.com'
export const CHAIN_PARAMS = { chainId: `0x${CHAIN_ID.toString(16)}`, chainName:'Robinhood Chain Testnet', nativeCurrency:{name:'Robinhood',symbol:'RBH',decimals:18}, rpcUrls:[RPC_URL], blockExplorerUrls:[EXPLORER_URL] }
// Selected identity: https://x.com/rehevanta. Enable after confirming account control.
=======
export const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || '0x9f79dACF6B1C214D23aB55E132594740fA1A291D'
export const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || 5042002)
export const RPC_URL = import.meta.env.VITE_RPC_URL || 'https://rpc.testnet.arc.io'
export const EXPLORER_URL = import.meta.env.VITE_EXPLORER_URL || 'https://testnet.arcscan.app'
export const CHAIN_PARAMS = { chainId: `0x${CHAIN_ID.toString(16)}`, chainName:'Arc Chain Testnet', nativeCurrency:{name:'USDC',symbol:'USDC',decimals:18}, rpcUrls:[RPC_URL], blockExplorerUrls:[EXPLORER_URL] }
// Selected identity: https://x.com/prelivo. Enable after confirming account control.
>>>>>>> 5c846d837354e8efef5d3c6a5302062b46ef67fb
const xUrl = import.meta.env.VITE_X_URL || ''
export const SOCIAL_URL = /^https:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/[A-Za-z0-9_]{1,15}\/?$/.test(xUrl) ? xUrl : ''
