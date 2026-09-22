import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { ethers } from 'ethers'
import { CHAIN_ID, CHAIN_PARAMS, CONTRACT_ADDRESS } from '../config'
import tokenAbi from '../abi/RobinhoodCommons.json'

// These read methods exist on RobinhoodCommons; keep the deployed ABI intact.
const faucetAbi = [
  ...tokenAbi,
  'function faucetAmount() view returns (uint256)',
  'function faucetCooldown() view returns (uint256)',
  'function lastFaucetClaim(address) view returns (uint256)',
  'function paused() view returns (bool)',
]

function hasCode(error, code) {
  return [error?.code, error?.error?.code, error?.info?.error?.code,
    error?.data?.originalError?.code].some(value => String(value) === String(code))
}

function readableError(error, fallback) {
  const detail = [error?.reason, error?.shortMessage, error?.message,
    error?.info?.error?.message].filter(Boolean).join(' ').toLowerCase()
  if (hasCode(error, 4001) || hasCode(error, 'ACTION_REJECTED')) return 'Request declined in your wallet. You can try again when ready.'
  if (hasCode(error, -32002)) return 'A request is already open in your wallet. Open your wallet to continue.'
  if (detail.includes('cooldown')) return 'The faucet cooldown is still active. Refresh your balance to check when you can claim again.'
  if (detail.includes('paused')) return 'The HOOD faucet is paused. Please try again later.'
  if (detail.includes('cap exceeded')) return 'The test token supply cap has been reached. The faucet cannot issue more tokens.'
  if (detail.includes('insufficient funds')) return `You need some ${CHAIN_PARAMS.nativeCurrency.symbol} on ${CHAIN_PARAMS.chainName} to pay the network fee.`
  return fallback
}

function formatBalance(value, decimals = 18, places = 4) {
  const [whole, fraction = ''] = ethers.formatUnits(value, decimals).split('.')
  const visible = fraction.slice(0, places).replace(/0+$/, '')
  if (value > 0n && whole === '0' && !visible) return `<0.${'0'.repeat(places - 1)}1`
  return visible ? `${whole}.${visible}` : whole
}

export function useWallet() {
  const connected = ref(false)
  const account = ref('')
  const chainId = ref(null)
  const balance = ref(null)
  const tokenBalance = ref(null)
  const isConnecting = ref(false)
  const isSwitching = ref(false)
  const isClaiming = ref(false)
  const isRefreshing = ref(false)
  const walletError = ref('')
  const transactionHash = ref('')
  const claimStatus = ref('idle')
  const claimMessage = ref('')
  const faucetAmount = ref(null)
  const cooldownUntil = ref(null)
  const shortAccount = computed(() => account.value ? `${account.value.slice(0, 6)}…${account.value.slice(-4)}` : '')
  const correctNetwork = computed(() => chainId.value === CHAIN_ID)
  const tokenConfigured = computed(() => ethers.isAddress(CONTRACT_ADDRESS) && CONTRACT_ADDRESS.toLowerCase() !== ethers.ZeroAddress)

  let wallet = null
  let listeningWallet = null
  let disposed = false
  let revision = 0
  let refreshRevision = 0
  let activeRefreshSession = null
  let locallyDisconnected = false
  let awaitingAccountApproval = false
  let approvalAccounts = null

  function getWallet() {
    wallet = typeof window !== 'undefined' ? window.ethereum : null
    if (!wallet) walletError.value = 'No EVM wallet detected. Install an EVM wallet or open Zuno in your wallet browser.'
    return wallet
  }

  function resetBalances() {
    balance.value = null
    tokenBalance.value = null
    faucetAmount.value = null
    cooldownUntil.value = null
  }

  function resetClaim() {
    transactionHash.value = ''
    claimStatus.value = 'idle'
    claimMessage.value = ''
  }

  function setAccount(address) {
    revision += 1
    account.value = address || ''
    connected.value = Boolean(address)
    resetBalances()
    resetClaim()
  }

  function disconnect() {
    locallyDisconnected = true
    detachListeners()
    setAccount('')
    chainId.value = null
    walletError.value = ''
  }

  async function readChain(ethereum) {
    const value = await ethereum.request({ method: 'eth_chainId' })
    return Number(BigInt(value))
  }

  async function refreshBalances() {
    if (!connected.value || !wallet || disposed) return
    if (isRefreshing.value && activeRefreshSession === revision) return
    const requestRevision = ++refreshRevision
    const sessionRevision = revision
    activeRefreshSession = sessionRevision
    const currentAccount = account.value
    const isCurrent = () => !disposed && sessionRevision === revision && requestRevision === refreshRevision
    isRefreshing.value = true
    walletError.value = ''
    resetBalances()
    try {
      const currentChain = await readChain(wallet)
      if (!isCurrent()) return
      chainId.value = currentChain
      if (!correctNetwork.value) {
        walletError.value = `Switch to ${CHAIN_PARAMS.chainName} to view balances and use the faucet.`
        return
      }
      const provider = new ethers.BrowserProvider(wallet)
      const token = tokenConfigured.value ? new ethers.Contract(CONTRACT_ADDRESS, faucetAbi, provider) : null
      const reads = await Promise.allSettled([
        provider.getBalance(currentAccount),
        token ? Promise.all([token.balanceOf(currentAccount), token.decimals()]) : Promise.resolve(null),
        token ? Promise.all([token.faucetAmount(), token.faucetCooldown(), token.lastFaucetClaim(currentAccount)]) : Promise.resolve(null),
      ])
      if (!isCurrent()) return
      const failed = []
      if (reads[0].status === 'fulfilled') balance.value = formatBalance(reads[0].value)
      else failed.push('network balance')
      if (reads[1].status === 'fulfilled' && reads[1].value) tokenBalance.value = formatBalance(reads[1].value[0], Number(reads[1].value[1]))
      else if (reads[1].status === 'rejected') failed.push('HOOD balance')
      if (reads[2].status === 'fulfilled' && reads[2].value) {
        const [amount, cooldown, lastClaim] = reads[2].value
        faucetAmount.value = formatBalance(amount)
        cooldownUntil.value = lastClaim > 0n ? Number(lastClaim + cooldown) * 1000 : null
      } else if (reads[2].status === 'rejected') failed.push('faucet availability')
      if (failed.length) walletError.value = `Could not read ${failed.join(' or ')}. Please refresh or check your wallet connection.`
    } catch (error) {
      if (isCurrent()) {
        chainId.value = null
        walletError.value = readableError(error, 'Could not reach your wallet network. Please try refreshing.')
      }
    } finally {
      if (requestRevision === refreshRevision) isRefreshing.value = false
    }
  }

  function onAccountsChanged(accounts) {
    if (disposed) return
    if (awaitingAccountApproval) { approvalAccounts = accounts || []; return }
    if (locallyDisconnected) return
    setAccount(accounts?.[0])
    walletError.value = ''
    if (connected.value) void refreshBalances()
  }

  function onChainChanged(value) {
    if (disposed || locallyDisconnected) return
    if (awaitingAccountApproval) {
      try { chainId.value = Number(BigInt(value)) } catch { chainId.value = null }
      return // Connection approval reads the latest chain before reading balances.
    }
    revision += 1
    try { chainId.value = Number(BigInt(value)) } catch { chainId.value = null }
    resetBalances()
    resetClaim()
    if (connected.value) void refreshBalances()
  }

  function onWalletDisconnect() {
    disconnect()
    walletError.value = 'Your wallet connection was lost. Reconnect to continue.'
  }

  function detachListeners() {
    const remove = listeningWallet?.removeListener?.bind(listeningWallet)
    remove?.('accountsChanged', onAccountsChanged)
    remove?.('chainChanged', onChainChanged)
    remove?.('disconnect', onWalletDisconnect)
    listeningWallet = null
  }

  function attachListeners(ethereum) {
    if (ethereum === listeningWallet) return
    detachListeners()
    listeningWallet = ethereum
    ethereum.on?.('accountsChanged', onAccountsChanged)
    ethereum.on?.('chainChanged', onChainChanged)
    ethereum.on?.('disconnect', onWalletDisconnect)
  }

  async function connectWallet() {
    if (isConnecting.value || isSwitching.value || isClaiming.value) return false
    const ethereum = getWallet()
    if (!ethereum) return false
    attachListeners(ethereum)
    isConnecting.value = true
    awaitingAccountApproval = true
    approvalAccounts = null
    walletError.value = ''
    const startingRevision = revision
    try {
      const requestedAccounts = await ethereum.request({ method: 'eth_requestAccounts' })
      const accounts = approvalAccounts ?? requestedAccounts
      awaitingAccountApproval = false
      if (disposed || startingRevision !== revision) return false
      if (!accounts?.length) throw new Error('No account returned')
      locallyDisconnected = false
      setAccount(accounts[0])
      await refreshBalances()
      return connected.value
    } catch (error) {
      if (!disposed) walletError.value = readableError(error, 'Could not connect your wallet. Please try again.')
      return false
    } finally {
      awaitingAccountApproval = false
      approvalAccounts = null
      isConnecting.value = false
    }
  }

  async function switchNetwork() {
    if (isSwitching.value || isConnecting.value || isClaiming.value) return false
    const ethereum = getWallet()
    if (!ethereum) return false
    attachListeners(ethereum)
    isSwitching.value = true
    walletError.value = ''
    try {
      try {
        await ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_PARAMS.chainId }] })
      } catch (error) {
        if (!hasCode(error, 4902)) throw error
        await ethereum.request({ method: 'wallet_addEthereumChain', params: [CHAIN_PARAMS] })
        await ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_PARAMS.chainId }] })
      }
      if (disposed) return false
      chainId.value = await readChain(ethereum)
      if (!correctNetwork.value) throw new Error('Network unchanged')
      if (connected.value) await refreshBalances()
      return true
    } catch (error) {
      if (!disposed) walletError.value = readableError(error, `Could not switch networks. Select ${CHAIN_PARAMS.chainName} in your wallet and try again.`)
      return false
    } finally {
      isSwitching.value = false
    }
  }

  async function claimFaucet() {
    if (isClaiming.value || isConnecting.value || isSwitching.value) return
    walletError.value = ''
    if (!connected.value) {
      await connectWallet()
      return // Connecting never also submits a transaction.
    }
    if (!tokenConfigured.value) {
      walletError.value = 'The HOOD faucet contract is not configured for this deployment.'
      return
    }
    if (!correctNetwork.value) {
      walletError.value = `Switch to ${CHAIN_PARAMS.chainName} before claiming HOOD.`
      return
    }
    const sessionRevision = revision
    const currentAccount = account.value
    const isCurrent = () => !disposed && sessionRevision === revision && currentAccount === account.value
    isClaiming.value = true
    transactionHash.value = ''
    claimStatus.value = 'pending'
    claimMessage.value = 'Checking faucet availability…'
    try {
      if (await readChain(wallet) !== CHAIN_ID) throw new Error('Network changed')
      const provider = new ethers.BrowserProvider(wallet)
      const token = new ethers.Contract(CONTRACT_ADDRESS, faucetAbi, provider)
      const [lastClaim, cooldown, amount, paused, block] = await Promise.all([
        token.lastFaucetClaim(currentAccount), token.faucetCooldown(), token.faucetAmount(), token.paused(), provider.getBlock('latest'),
      ])
      if (!isCurrent()) return
      faucetAmount.value = formatBalance(amount)
      cooldownUntil.value = lastClaim > 0n ? Number(lastClaim + cooldown) * 1000 : null
      if (paused) throw new Error('HOOD: token is paused')
      if (!block) throw new Error('Could not read latest block')
      if (BigInt(block.timestamp) < lastClaim + cooldown) {
        claimStatus.value = 'error'
        claimMessage.value = `Your next HOOD claim is available ${new Date(Number(lastClaim + cooldown) * 1000).toLocaleString()}.`
        return
      }
      const signer = await provider.getSigner(currentAccount)
      if (!isCurrent()) return
      claimMessage.value = 'Confirm the HOOD faucet transaction in your wallet.'
      const tx = await token.connect(signer).claimFaucet()
      if (!isCurrent()) return
      transactionHash.value = tx.hash
      claimMessage.value = 'Transaction submitted. Waiting for network confirmation…'
      const receipt = await tx.wait()
      if (!isCurrent()) return
      if (!receipt || receipt.status !== 1) throw new Error('Transaction was not successful')
      claimStatus.value = 'confirmed'
      claimMessage.value = `${formatBalance(amount)} HOOD claimed. Your test tokens are ready.`
      await refreshBalances()
    } catch (error) {
      if (isCurrent()) {
        // A replacement can be confirmed even when the original wait rejects.
        if (error?.code === 'TRANSACTION_REPLACED' && !error.cancelled && error.receipt?.status === 1) {
          transactionHash.value = error.replacement?.hash || error.receipt.hash || transactionHash.value
          claimStatus.value = 'confirmed'
          claimMessage.value = 'Your replacement faucet transaction was confirmed.'
          await refreshBalances()
        } else {
          claimStatus.value = 'error'
          claimMessage.value = readableError(error, 'The faucet claim could not complete. Check the transaction in your wallet before trying again.')
        }
      }
    } finally {
      isClaiming.value = false
    }
  }

  onMounted(() => {
    const ethereum = typeof window !== 'undefined' ? window.ethereum : null
    if (ethereum) { wallet = ethereum; attachListeners(ethereum) }
  })
  onBeforeUnmount(() => {
    disposed = true
    revision += 1
    refreshRevision += 1
    detachListeners()
  })

  return {
    connected, account, shortAccount, chainId, balance, tokenBalance, correctNetwork,
    isConnecting, isSwitching, isClaiming, isRefreshing, walletError, transactionHash,
    claimStatus, claimMessage, faucetAmount, cooldownUntil, tokenConfigured,
    connectWallet, disconnect, switchNetwork, refreshBalances, claimFaucet,
  }
}
