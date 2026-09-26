import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { ref, computed } from 'vue'

const source = (await readFile(new URL('../src/composables/useWallet.js', import.meta.url), 'utf8'))
  .replace(/^import .*$/gm, '').replace('export function useWallet()', 'function useWallet()')
const makeComposable = new Function('deps', `const { ref, computed, onMounted, onBeforeUnmount, Connection, PublicKey, LAMPORTS_PER_SOL, CLUSTER_LABEL, EXPLORER_URL, RPC_URL, SOLANA_CLUSTER, TOKEN_MINT } = deps; ${source}; return useWallet()`)
const address = '11111111111111111111111111111111'
const settle = () => new Promise(resolve => setTimeout(resolve, 0))

function setup(options = {}) {
  const listeners = new Map()
  const pendingBalances = []
  let balanceReads = 0
  const wallet = {
    isConnected: false,
    publicKey: null,
    cluster: options.cluster,
    async connect() { if (options.connectError) throw options.connectError; this.isConnected = true; this.publicKey = { toString: () => address }; return { publicKey: this.publicKey } },
    async disconnect() { this.isConnected = false; this.publicKey = null },
    on(event, handler) { listeners.set(event, handler) },
    off(event, handler) { if (listeners.get(event) === handler) listeners.delete(event) },
  }
  class MockPublicKey {
    constructor(value) { this.value = value }
    toString() { return typeof this.value === 'string' ? this.value : 'key-bytes' }
    toBuffer() { return this.value instanceof Uint8Array ? this.value : new Uint8Array(32) }
    equals(other) { return this.toString() === other.toString() }
    static findProgramAddressSync() { return [new MockPublicKey('AssociatedTokenAccount'), 255] }
  }
  class MockConnection {
    async getBalance(publicKey) {
      balanceReads += 1
      if (options.rpcError) throw new Error('network timeout')
      if (options.deferredBalances) return new Promise(resolve => pendingBalances.push({ address: publicKey.toString(), resolve }))
      return 1.25e9
    }
    async getParsedTokenAccountsByOwner() {
      if (options.tokenError) throw new Error('token RPC unavailable')
      return { value: options.tokenAccounts || [] }
    }
    async getAccountInfo(publicKey) {
      if (options.ataError) throw new Error('direct account RPC unavailable')
      if (publicKey.toString() === options.tokenMint) return options.mintInfo || null
      return options.ataAccount || null
    }
  }
  let mount, unmount
  globalThis.window = { solana: wallet }
  const api = makeComposable({ ref, computed, onMounted: fn => { mount = fn }, onBeforeUnmount: fn => { unmount = fn }, Connection: MockConnection, PublicKey: MockPublicKey, LAMPORTS_PER_SOL: 1e9, CLUSTER_LABEL: options.cluster === 'testnet' ? 'Solana Testnet' : 'Solana Devnet', EXPLORER_URL: 'https://explorer.solana.com', RPC_URL: options.rpcUrl || (options.cluster === 'testnet' ? 'https://solana-testnet-rpc.publicnode.com' : 'https://api.devnet.solana.com'), SOLANA_CLUSTER: options.cluster === 'testnet' ? 'testnet' : 'devnet', TOKEN_MINT: options.tokenMint || '' })
  mount()
  return { api, wallet, listeners, pendingBalances, balanceReads: () => balanceReads, unmount, emit: (event, value) => listeners.get(event)?.(value) }
}

test('missing Solana wallet is reported without throwing', async () => {
  globalThis.window = {}
  let mount, unmount
  const api = makeComposable({ ref, computed, onMounted: fn => { mount = fn }, onBeforeUnmount: fn => { unmount = fn }, Connection: class {}, PublicKey: class {}, LAMPORTS_PER_SOL: 1e9, CLUSTER_LABEL: 'Solana Devnet', EXPLORER_URL: '', RPC_URL: '', SOLANA_CLUSTER: 'devnet', TOKEN_MINT: '' })
  mount()
  assert.equal(api.walletError.value, '')
  assert.equal(await api.connectWallet(), false)
  assert.match(api.walletError.value, /No Solana wallet/)
  unmount()
})

test('connect reads native SOL and prevents duplicate state loss', async () => {
  const fixture = setup({ cluster: 'devnet' })
  assert.equal(await fixture.api.connectWallet(), true)
  await settle()
  assert.equal(fixture.api.connected.value, true)
  assert.equal(fixture.api.account.value, address)
  assert.equal(fixture.api.balance.value, '1.25')
  assert.equal(fixture.api.walletCluster.value, 'devnet')
  assert.equal(fixture.api.correctNetwork.value, true)
  fixture.unmount()
})

test('rejected wallet connection is recoverable', async () => {
  const fixture = setup({ connectError: new Error('User rejected') })
  assert.equal(await fixture.api.connectWallet(), false)
  assert.match(fixture.api.walletError.value, /declined/)
  fixture.unmount()
})

test('account changes refresh the active address', async () => {
  const fixture = setup()
  await fixture.api.connectWallet()
  const next = '22222222222222222222222222222222'
  fixture.emit('accountChanged', { toString: () => next })
  await settle()
  assert.equal(fixture.api.account.value, next)
  fixture.unmount()
  assert.equal(fixture.listeners.size, 0)
})

test('wallet cluster is reported without pretending to switch it', async () => {
  const fixture = setup({ cluster: 'mainnet-beta' })
  await fixture.api.connectWallet()
  assert.equal(fixture.api.walletCluster.value, 'mainnet-beta')
  assert.equal(fixture.api.correctNetwork.value, false)
  assert.equal(fixture.api.balance.value, null)
  assert.equal(fixture.balanceReads(), 0)
  assert.match(fixture.api.walletError.value, /Select Solana Devnet/)
  assert.equal('switchNetwork' in fixture.api, false)
  fixture.unmount()
})

test('unknown provider cluster stays unknown', async () => {
  const fixture = setup()
  await fixture.api.connectWallet()
  assert.equal(fixture.api.walletCluster.value, 'unknown')
  assert.equal(fixture.api.correctNetwork.value, null)
  fixture.unmount()
})

test('stale balance reads cannot overwrite a changed account or disconnected state', async () => {
  const fixture = setup({ deferredBalances: true, cluster: 'devnet' })
  await fixture.api.connectWallet()
  const first = fixture.pendingBalances[0]
  const next = '22222222222222222222222222222222'
  fixture.emit('accountChanged', { toString: () => next })
  const second = fixture.pendingBalances[1]
  second.resolve(2.5e9)
  await settle()
  assert.equal(fixture.api.balance.value, '2.5')
  first.resolve(1.25e9)
  await settle()
  assert.equal(fixture.api.balance.value, '2.5')

  fixture.api.refreshBalances()
  const third = fixture.pendingBalances[2]
  await fixture.api.disconnect()
  third.resolve(4e9)
  await settle()
  assert.equal(fixture.api.connected.value, false)
  assert.equal(fixture.api.balance.value, null)
  fixture.unmount()
})

test('rpc failures clear balance and explain recovery', async () => {
  const fixture = setup({ rpcError: true })
  await fixture.api.connectWallet()
  await settle()
  assert.equal(fixture.api.balance.value, null)
  assert.match(fixture.api.walletError.value, /RPC|reached/i)
  fixture.unmount()
})

test('token actions stay disabled because no faucet program is deployed', async () => {
  const fixture = setup()
  assert.equal(fixture.api.tokenConfigured.value, false)
  assert.equal(await fixture.api.claimFaucet(), false)
  assert.match(fixture.api.claimMessage.value, /no faucet program is deployed/i)
  fixture.unmount()
})

test('ORL balance adds multiple token accounts without floating point loss', async () => {
  const tokenAccount = (amount) => ({ account: { data: { parsed: { info: { tokenAmount: { amount, decimals: 9 } } } } } })
  const fixture = setup({
    cluster: 'testnet',
    tokenMint: 'MintAddress',
    rpcUrl: 'https://provider.example',
    tokenAccounts: [tokenAccount('1250000000'), tokenAccount('300000000')],
  })
  await fixture.api.connectWallet()
  await settle()
  assert.equal(fixture.api.balance.value, '1.25')
  assert.equal(fixture.api.tokenBalance.value, '1.55')
  assert.equal(fixture.api.tokenError.value, '')
  fixture.unmount()
})

test('associated token account fallback reads ORL when the RPC blocks indexed account lists', async () => {
  const mintData = new Uint8Array(82)
  mintData[44] = 9
  mintData[45] = 1
  const ataData = new Uint8Array(165)
  new DataView(ataData.buffer).setBigUint64(64, 1_550_000_000n, true)
  const tokenProgramOwner = new (class { equals(other) { return other.toString() === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' } })()
  const fixture = setup({
    cluster: 'testnet',
    tokenMint: 'MintAddress',
    rpcUrl: 'https://solana-testnet-rpc.publicnode.com',
    mintInfo: { owner: tokenProgramOwner, data: mintData },
    ataAccount: { owner: tokenProgramOwner, data: ataData },
  })
  await fixture.api.connectWallet()
  await settle()
  assert.equal(fixture.api.balance.value, '1.25')
  assert.equal(fixture.api.tokenBalance.value, '1.55')
  assert.match(fixture.api.tokenNotice.value, /associated account only/i)
  assert.equal(fixture.api.tokenError.value, '')
  fixture.unmount()
})

test('token RPC failure preserves the native SOL balance and reports a mint-specific error', async () => {
  const fixture = setup({ cluster: 'testnet', tokenMint: 'MintAddress', rpcUrl: 'https://provider.example', tokenError: true, ataError: true })
  await fixture.api.connectWallet()
  await settle()
  assert.equal(fixture.api.balance.value, '1.25')
  assert.equal(fixture.api.tokenBalance.value, null)
  assert.equal(fixture.api.walletError.value, '')
  assert.match(fixture.api.tokenError.value, /ORL.*configured cluster/i)
  fixture.unmount()
})
