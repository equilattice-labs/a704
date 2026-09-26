import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { CLUSTER_LABEL, EXPLORER_URL, RPC_URL, SOLANA_CLUSTER, TOKEN_MINT } from '../config'

function shortKey(value) { return value ? `${value.slice(0, 4)}...${value.slice(-4)}` : '' }
function readableError(error, fallback) {
  const detail = String(error?.message || error || '').toLowerCase()
  if (detail.includes('reject') || detail.includes('denied')) return 'Wallet connection was declined. You can try again when ready.'
  if (detail.includes('timeout') || detail.includes('network')) return 'The Solana RPC could not be reached. Try refreshing in a moment.'
  return fallback
}
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL')

function formatTokenAmount(rawAmount, decimals) {
  const amount = BigInt(rawAmount)
  const scale = 10n ** BigInt(decimals)
  const whole = amount / scale
  const fraction = decimals ? (amount % scale).toString().padStart(decimals, '0').replace(/0+$/, '') : ''
  return `${whole}${fraction ? `.${fraction}` : ''}`
}

function sameBytes(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function readU64LittleEndian(data, offset) {
  let value = 0n
  for (let index = 7; index >= 0; index -= 1) value = (value << 8n) | BigInt(data[offset + index])
  return value
}

async function readAssociatedTokenBalance(connection, owner, mint) {
  const [associatedAddress] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )
  const [mintAccount, tokenAccount] = await Promise.all([
    connection.getAccountInfo(mint, 'confirmed'),
    connection.getAccountInfo(associatedAddress, 'confirmed'),
  ])
  if (!mintAccount?.owner.equals(TOKEN_PROGRAM_ID) || mintAccount.data.length < 45 || mintAccount.data[45] !== 1) {
    throw new Error('Configured ORL mint account is not readable.')
  }
  if (!tokenAccount) return '0'
  if (
    !tokenAccount.owner.equals(TOKEN_PROGRAM_ID) ||
    tokenAccount.data.length < 72 ||
    !sameBytes(tokenAccount.data.subarray(0, 32), mint.toBuffer()) ||
    !sameBytes(tokenAccount.data.subarray(32, 64), owner.toBuffer())
  ) {
    throw new Error('Associated ORL token account is invalid.')
  }
  return formatTokenAmount(readU64LittleEndian(tokenAccount.data, 64), mintAccount.data[44])
}

export function useWallet() {
  const connected = ref(false); const account = ref(''); const shortAccount = computed(() => shortKey(account.value))
  const balance = ref(null); const tokenBalance = ref(null); const isConnecting = ref(false); const isRefreshing = ref(false)
  const walletError = ref(''); const tokenError = ref(''); const tokenNotice = ref(''); const tokenConfigured = computed(() => Boolean(TOKEN_MINT))
  const walletCluster = ref('unknown')
  const correctNetwork = computed(() => walletCluster.value === 'unknown' ? null : walletCluster.value === SOLANA_CLUSTER)
  const claimStatus = ref('disabled'); const claimMessage = ref('ORL is live on Testnet, but no faucet program is deployed.')
  const mintAddress = ref(TOKEN_MINT)
  let provider = null; let connection = null; let disposed = false; let accountHandler = null; let disconnectHandler = null
  let balanceRequest = 0

  function readWalletCluster(wallet) {
    const cluster = String(wallet?.cluster || '').toLowerCase()
    return ['devnet', 'testnet', 'mainnet-beta'].includes(cluster) ? cluster : 'unknown'
  }

  function getProvider(reportMissing = true) {
    provider = typeof window !== 'undefined' ? (window.solana || window.phantom?.solana || null) : null
    if (!provider && reportMissing) walletError.value = 'No Solana wallet detected. Install Phantom or open this site in a Solana wallet browser.'
    return provider
  }
  function resetBalances() { balanceRequest += 1; balance.value = null; tokenBalance.value = null; walletError.value = ''; tokenError.value = ''; tokenNotice.value = ''; isRefreshing.value = false }
  async function refreshBalances() {
    if (!connected.value || !account.value || disposed) return false
    if (correctNetwork.value === false) {
      resetBalances()
      walletError.value = `Wallet reports Solana ${walletCluster.value}, but this app reads ${CLUSTER_LABEL}. Select ${CLUSTER_LABEL} in your wallet before reading balances. The app will not switch networks.`
      return false
    }
    const requestedAccount = account.value
    const request = ++balanceRequest
    const isCurrentRequest = () => request === balanceRequest && !disposed && connected.value && account.value === requestedAccount
    isRefreshing.value = true; walletError.value = ''; tokenError.value = ''; tokenNotice.value = ''
    try {
      connection ||= new Connection(RPC_URL, 'confirmed')
      const publicKey = new PublicKey(requestedAccount)
      const lamports = await connection.getBalance(publicKey, 'confirmed')
      if (!isCurrentRequest()) return false
      balance.value = (lamports / LAMPORTS_PER_SOL).toFixed(4).replace(/0+$/, '').replace(/\.$/, '') || '0'
      if (tokenConfigured.value) {
        try {
          try {
            if (RPC_URL.includes('solana-testnet-rpc.publicnode.com')) {
              throw new Error('This Testnet RPC does not support token-account enumeration.')
            }
            const accounts = await connection.getParsedTokenAccountsByOwner(publicKey, { mint: new PublicKey(mintAddress.value) })
            if (!isCurrentRequest()) return false
            const amounts = accounts.value.map((entry) => entry.account.data.parsed.info.tokenAmount)
            const rawAmount = amounts.reduce((sum, amount) => sum + BigInt(amount.amount || '0'), 0n)
            tokenBalance.value = formatTokenAmount(rawAmount, amounts[0]?.decimals ?? 0)
          } catch {
            if (!isCurrentRequest()) return false
            tokenBalance.value = await readAssociatedTokenBalance(connection, publicKey, new PublicKey(mintAddress.value))
            if (!isCurrentRequest()) return false
            tokenNotice.value = 'This RPC does not allow token-account enumeration; the displayed ORL amount is from your associated account only.'
          }
        } catch {
          if (!isCurrentRequest()) return false
          tokenBalance.value = null
          tokenError.value = 'Could not read ORL on this RPC. Check that your wallet and mint use the configured cluster.'
        }
      }
      return true
    } catch (error) {
      if (!isCurrentRequest()) return false
      balance.value = null; tokenBalance.value = null
      walletError.value = readableError(error, 'Could not read your Solana balance. Try refreshing.')
      return false
    } finally { if (request === balanceRequest) isRefreshing.value = false }
  }
  function setAccount(value) {
    account.value = value || ''
    connected.value = Boolean(value)
    walletCluster.value = connected.value ? readWalletCluster(provider) : 'unknown'
    resetBalances()
    if (connected.value) void refreshBalances()
  }
  async function connectWallet() {
    if (isConnecting.value) return false
    const wallet = getProvider(); if (!wallet) return false
    isConnecting.value = true; walletError.value = ''
    try { const response = await wallet.connect(); const address = response?.publicKey?.toString?.() || wallet.publicKey?.toString?.(); if (!address) throw new Error('No public key returned'); setAccount(address); return true }
    catch (error) { walletError.value = readableError(error, 'Could not connect your Solana wallet. Try again.'); return false }
    finally { isConnecting.value = false }
  }
  async function disconnect() {
    const wallet = provider
    setAccount('')
    walletError.value = ''
    try { await wallet?.disconnect?.() } catch { /* already disconnected */ }
  }
  async function claimFaucet() { claimStatus.value = 'disabled'; claimMessage.value = 'ORL is live on Testnet, but no faucet program is deployed.'; return false }
  onMounted(() => {
    const wallet = getProvider(false)
    if (!wallet) return
    accountHandler = (publicKey) => setAccount(publicKey?.toString?.() || '')
    disconnectHandler = () => setAccount('')
    wallet.on?.('accountChanged', accountHandler)
    wallet.on?.('disconnect', disconnectHandler)
    if (wallet.isConnected && wallet.publicKey) setAccount(wallet.publicKey.toString())
  })
  onBeforeUnmount(() => {
    disposed = true
    balanceRequest += 1
    if (provider && accountHandler) provider.off?.('accountChanged', accountHandler)
    if (provider && disconnectHandler) provider.off?.('disconnect', disconnectHandler)
  })
  return { connected, account, shortAccount, balance, tokenBalance, walletCluster, correctNetwork, isConnecting, isRefreshing, walletError, tokenError, tokenNotice, claimStatus, claimMessage, tokenConfigured, mintAddress, connectWallet, disconnect, refreshBalances, claimFaucet, networkLabel: CLUSTER_LABEL, explorerUrl: EXPLORER_URL, cluster: SOLANA_CLUSTER }
}
