export const SOLANA_CLUSTER = import.meta.env.VITE_SOLANA_CLUSTER || 'testnet'
const DEFAULT_RPC_URL = SOLANA_CLUSTER === 'testnet'
  ? 'https://solana-testnet-rpc.publicnode.com'
  : `https://api.${SOLANA_CLUSTER}.solana.com`
export const RPC_URL = import.meta.env.VITE_SOLANA_RPC_URL || DEFAULT_RPC_URL
export const EXPLORER_URL = import.meta.env.VITE_SOLANA_EXPLORER_URL || 'https://explorer.solana.com'
export const TOKEN_NAME = 'VelaCircuit'
export const TOKEN_SYMBOL = 'ORL'
const DEFAULT_TESTNET_MINT = 'EvatdLdQKLV5pMzp75dCbyWbVewckB2SXuEwnoHQfEbj'
export const TOKEN_MINT = import.meta.env.VITE_TOKEN_MINT || (SOLANA_CLUSTER === 'testnet' ? DEFAULT_TESTNET_MINT : '')
export const TOKEN_EXPLORER_URL = TOKEN_MINT ? `${EXPLORER_URL}/address/${TOKEN_MINT}?cluster=${SOLANA_CLUSTER}` : ''
export const SOCIAL_URL = /^https:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/[A-Za-z0-9_]{1,15}\/?$/.test(import.meta.env.VITE_X_URL || '') ? import.meta.env.VITE_X_URL : ''
export const CLUSTER_LABEL = SOLANA_CLUSTER === 'mainnet-beta' ? 'Solana Mainnet' : `Solana ${SOLANA_CLUSTER[0].toUpperCase()}${SOLANA_CLUSTER.slice(1)}`
export const TOKEN_CONFIGURED = Boolean(TOKEN_MINT)
