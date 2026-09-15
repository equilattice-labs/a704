import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { ref, computed } from 'vue'
import { ethers as realEthers } from 'ethers'

// Exercise the composable with isolated wallet/contract adapters: no RPC or signing.
const source = (await readFile(new URL('../src/composables/useWallet.js', import.meta.url), 'utf8'))
  .replace(/^import .*$/gm, '').replace('export function useWallet()', 'function useWallet()')
const makeComposable = new Function('deps', `const { ref, computed, onMounted, onBeforeUnmount, ethers, CHAIN_ID, CHAIN_PARAMS, CONTRACT_ADDRESS, tokenAbi } = deps; ${source}; return useWallet()`)
const address = '0x1111111111111111111111111111111111111111'
const secondAddress = '0x2222222222222222222222222222222222222222'
const chainParams = { chainId: '0xb626', chainName: 'Robinhood Chain Testnet', nativeCurrency: { symbol: 'RBH' } }
const settle = () => new Promise(resolve => setTimeout(resolve, 0))

function setup(options = {}) {
  const listeners = new Map()
  const calls = []
  const state = { chain: '0xb626', accounts: [address], native: 10n ** 18n, hood: 100n * 10n ** 18n,
    lastClaim: 0n, cooldown: 86400n, now: 200000, paused: false, txCount: 0, ...options }
  const ethereum = {
    async request(request) {
      calls.push(request)
      if (request.method === 'eth_requestAccounts') {
        if (state.connectError) throw state.connectError
        if (state.connectWait) await state.connectWait
        listeners.get('accountsChanged')?.(state.accounts)
        return state.accounts
      }
      if (request.method === 'eth_chainId') return state.chain
      if (request.method === 'wallet_switchEthereumChain') {
        if (state.unknownChain) { state.unknownChain = false; throw { code: 4902 } }
        state.chain = request.params[0].chainId
        listeners.get('chainChanged')?.(state.chain)
        return null
      }
      if (request.method === 'wallet_addEthereumChain') return null
      throw new Error(`Unexpected wallet request: ${request.method}`)
    },
    on(event, handler) { listeners.set(event, handler) },
    removeListener(event, handler) { if (listeners.get(event) === handler) listeners.delete(event) },
  }
  class BrowserProvider {
    async getBalance(account) {
      state.lastBalanceAccount = account
      if (state.balanceWait) await state.balanceWait
      if (state.balanceError) throw new Error('RPC offline')
      return state.native
    }
    async getBlock() { return { timestamp: state.now } }
    async getSigner(account) { return { address: account } }
  }
  class Contract {
    async balanceOf() { if (state.tokenError) throw new Error('No code'); return state.hood }
    async decimals() { return 18n }
    async faucetAmount() { return 100n * 10n ** 18n }
    async faucetCooldown() { return state.cooldown }
    async lastFaucetClaim() { return state.lastClaim }
    async paused() { return state.paused }
    connect() { return this }
    async claimFaucet() {
      state.txCount++
      if (state.claimError) throw state.claimError
      return { hash: '0xtransaction', wait: async () => {
        if (state.confirmWait) await state.confirmWait
        state.hood += 100n * 10n ** 18n
        state.lastClaim = BigInt(state.now)
        return { status: 1 }
      } }
    }
  }
  let mount, unmount
  globalThis.window = state.noWallet ? {} : { ethereum }
  const api = makeComposable({ ref, computed, onMounted: fn => { mount = fn }, onBeforeUnmount: fn => { unmount = fn },
    ethers: { ...realEthers, BrowserProvider, Contract }, CHAIN_ID: 46630, CHAIN_PARAMS: chainParams,
    CONTRACT_ADDRESS: state.contractAddress || address, tokenAbi: [] })
  mount()
  return { api, state, calls, listeners, unmount, emit: (event, data) => listeners.get(event)?.(data) }
}

test('missing wallet and rejected requests provide actionable feedback', async () => {
  const missing = setup({ noWallet: true })
  assert.equal(await missing.api.connectWallet(), false)
  assert.match(missing.api.walletError.value, /No EVM wallet/)
  assert.equal(missing.api.balance.value, null)
  missing.unmount()
  const rejected = setup({ connectError: { code: 4001 } })
  assert.equal(await rejected.api.connectWallet(), false)
  assert.match(rejected.api.walletError.value, /declined/)
  assert.equal(rejected.api.isConnecting.value, false)
  rejected.unmount()
})

test('connect reads real adapter balances and suppresses duplicate wallet requests', async () => {
  let resolveConnection
  const fixture = setup({ connectWait: new Promise(resolve => { resolveConnection = resolve }) })
  const pending = fixture.api.connectWallet()
  assert.equal(await fixture.api.connectWallet(), false)
  resolveConnection()
  assert.equal(await pending, true)
  assert.equal(fixture.calls.filter(call => call.method === 'eth_requestAccounts').length, 1)
  assert.equal(fixture.api.balance.value, '1')
  assert.equal(fixture.api.tokenBalance.value, '100')
  assert.equal(fixture.api.correctNetwork.value, true)
  fixture.unmount()
})

test('wrong network blocks claims; unknown chain is added and switched', async () => {
  const fixture = setup({ chain: '0x1', unknownChain: true })
  await fixture.api.connectWallet()
  assert.equal(fixture.api.balance.value, null)
  await fixture.api.claimFaucet()
  assert.equal(fixture.state.txCount, 0)
  assert.match(fixture.api.walletError.value, /Switch to/)
  assert.equal(await fixture.api.switchNetwork(), true)
  assert.deepEqual(fixture.calls.find(call => call.method === 'wallet_addEthereumChain').params, [chainParams])
  assert.equal(fixture.api.correctNetwork.value, true)
  fixture.unmount()
})

test('failed reads stay unavailable, then recover on refresh', async () => {
  const fixture = setup({ balanceError: true, tokenError: true })
  await fixture.api.connectWallet()
  assert.equal(fixture.api.balance.value, null)
  assert.equal(fixture.api.tokenBalance.value, null)
  assert.match(fixture.api.walletError.value, /Could not read/)
  fixture.state.balanceError = fixture.state.tokenError = false
  await fixture.api.refreshBalances()
  assert.equal(fixture.api.tokenBalance.value, '100')
  assert.equal(fixture.api.walletError.value, '')
  fixture.unmount()
})

test('account/network changes refresh state and unmount removes all listeners', async () => {
  const fixture = setup()
  await fixture.api.connectWallet()
  fixture.emit('accountsChanged', [secondAddress])
  await settle()
  assert.equal(fixture.api.account.value, secondAddress)
  assert.equal(fixture.state.lastBalanceAccount, secondAddress)
  fixture.state.chain = '0x1'
  fixture.emit('chainChanged', '0x1')
  await settle()
  assert.equal(fixture.api.correctNetwork.value, false)
  assert.equal(fixture.api.balance.value, null)
  fixture.api.disconnect()
  fixture.emit('accountsChanged', [address])
  assert.equal(fixture.api.connected.value, false)
  fixture.unmount()
  assert.equal(fixture.listeners.size, 0)
})

test('claim only connects when disconnected and zero-address contracts cannot claim', async () => {
  const fixture = setup({ contractAddress: realEthers.ZeroAddress })
  await fixture.api.claimFaucet()
  assert.equal(fixture.api.connected.value, true)
  assert.equal(fixture.state.txCount, 0)
  assert.equal(fixture.api.tokenConfigured.value, false)
  await fixture.api.claimFaucet()
  assert.match(fixture.api.walletError.value, /not configured/)
  assert.equal(fixture.state.txCount, 0)
  fixture.unmount()
})

test('cooldown is checked against network time before signing', async () => {
  const fixture = setup({ lastClaim: 199000n })
  await fixture.api.connectWallet()
  await fixture.api.claimFaucet()
  assert.equal(fixture.state.txCount, 0)
  assert.equal(fixture.api.claimStatus.value, 'error')
  assert.match(fixture.api.claimMessage.value, /next HOOD claim is available/)
  assert.equal(fixture.api.cooldownUntil.value, (199000 + 86400) * 1000)
  fixture.unmount()
})

test('pending claim prevents duplicate submissions and confirms with refreshed balances', async () => {
  let confirm
  const fixture = setup({ confirmWait: new Promise(resolve => { confirm = resolve }) })
  await fixture.api.connectWallet()
  const pending = fixture.api.claimFaucet()
  await settle()
  assert.equal(fixture.api.claimStatus.value, 'pending')
  assert.equal(fixture.api.transactionHash.value, '0xtransaction')
  await fixture.api.claimFaucet()
  assert.equal(fixture.state.txCount, 1)
  confirm()
  await pending
  assert.equal(fixture.api.claimStatus.value, 'confirmed')
  assert.equal(fixture.api.tokenBalance.value, '200')
  assert.equal(fixture.api.isClaiming.value, false)
  fixture.unmount()
})

test('declined claim becomes a recoverable error without a success message', async () => {
  const fixture = setup({ claimError: { code: 'ACTION_REJECTED' } })
  await fixture.api.connectWallet()
  await fixture.api.claimFaucet()
  assert.equal(fixture.api.claimStatus.value, 'error')
  assert.match(fixture.api.claimMessage.value, /declined/)
  assert.equal(fixture.api.transactionHash.value, '')
  assert.equal(fixture.api.isClaiming.value, false)
  fixture.unmount()
})

test('account changes during the initial balance read update the connected account', async () => {
  let releaseBalance
  const fixture = setup({ balanceWait: new Promise(resolve => { releaseBalance = resolve }) })
  const connection = fixture.api.connectWallet()
  await settle()
  fixture.state.accounts = [secondAddress]
  fixture.emit('accountsChanged', [secondAddress])
  releaseBalance()
  await connection
  await settle()
  assert.equal(fixture.api.account.value, secondAddress)
  assert.equal(fixture.state.lastBalanceAccount, secondAddress)
  fixture.unmount()
})

test('a network change while approving a connection keeps the approved account', async () => {
  let approve
  const fixture = setup({ connectWait: new Promise(resolve => { approve = resolve }) })
  const connection = fixture.api.connectWallet()
  fixture.state.chain = '0x1'
  fixture.emit('chainChanged', '0x1')
  approve()
  assert.equal(await connection, true)
  assert.equal(fixture.api.account.value, address)
  assert.equal(fixture.api.correctNetwork.value, false)
  assert.match(fixture.api.walletError.value, /Switch to/)
  fixture.unmount()
})
