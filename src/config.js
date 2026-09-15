export const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000'
export const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || 46630)
export const RPC_URL = import.meta.env.VITE_RPC_URL || 'https://rpc.testnet.chain.robinhood.com'
export const EXPLORER_URL = import.meta.env.VITE_EXPLORER_URL || 'https://explorer.testnet.chain.robinhood.com'
export const CHAIN_PARAMS = { chainId: `0x${CHAIN_ID.toString(16)}`, chainName:'Robinhood Chain Testnet', nativeCurrency:{name:'Robinhood',symbol:'RBH',decimals:18}, rpcUrls:[RPC_URL], blockExplorerUrls:[EXPLORER_URL] }
// Set only after the official Depthena profile is confirmed.
const xUrl = import.meta.env.VITE_X_URL || ''
export const SOCIAL_URL = /^https:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/[A-Za-z0-9_]{1,15}\/?$/.test(xUrl) ? xUrl : ''
