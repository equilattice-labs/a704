<script setup>
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from 'vue'
import AxisIcon from './components/AxisIcon.vue'
import { useWallet } from './composables/useWallet'
import { CHAIN_ID, CHAIN_PARAMS, CONTRACT_ADDRESS, EXPLORER_URL, SOCIAL_URL } from './config'

const {
  connected, account, shortAccount, balance, tokenBalance, correctNetwork,
  isConnecting, isSwitching, isClaiming, isRefreshing, walletError,
  transactionHash, claimStatus, claimMessage, faucetAmount, tokenConfigured,
  connectWallet, disconnect, switchNetwork, refreshBalances, claimFaucet,
} = useWallet()
const pages = ['Overview', 'Pools', 'Positions', 'Governance']
const activePage = ref('Overview')
const filter = ref('All pools')
const search = ref('')
const sort = ref('featured')
const pools = [
  { id: 'harbaxis-robin', name: 'Harbaxis / Robin', pair: 'PTV / RBH', token: 'PTV', profile: 'Core', apy: 42.8, tvl: 18.4, color: 'lime', symbols: ['H', 'R'], model: 'Balanced liquidity', width: 92 },
  { id: 'robin-usdc', name: 'Robin / USDC', pair: 'RBH / USDC', token: 'RBH', profile: 'Core', apy: 28.6, tvl: 11.2, color: 'blue', symbols: ['R', '$'], model: 'Stable pair liquidity', width: 66 },
  { id: 'harbaxis-eth', name: 'Harbaxis / ETH', pair: 'PTV / ETH', token: 'PTV', profile: 'Experimental', apy: 67.1, tvl: 6.8, color: 'purple', symbols: ['H', 'Ξ'], model: 'Variable liquidity', width: 42 },
]
const filteredPools = computed(() => {
  const query = search.value.trim().toLowerCase()
  const result = pools.filter(pool => (filter.value === 'All pools' || pool.profile === filter.value)
    && `${pool.name} ${pool.pair} ${pool.profile}`.toLowerCase().includes(query))
  if (sort.value === 'apy') result.sort((a, b) => b.apy - a.apy)
  if (sort.value === 'tvl') result.sort((a, b) => b.tvl - a.tvl)
  return result
})
const showDiscovery = computed(() => activePage.value === 'Overview' || activePage.value === 'Pools')
const walletBusy = computed(() => isConnecting.value || isSwitching.value || isClaiming.value)
const claimDisabled = computed(() => walletBusy.value || isRefreshing.value || !tokenConfigured.value || !correctNetwork.value)
const explorerBase = EXPLORER_URL.replace(/\/$/, '')
const transactionUrl = computed(() => transactionHash.value ? `${explorerBase}/tx/${transactionHash.value}` : '')
const nativeSymbol = CHAIN_PARAMS.nativeCurrency.symbol
const dialog = ref(null)
const modalType = ref('')
const selectedPoolId = ref(pools[0].id)
const selectedPool = computed(() => pools.find(pool => pool.id === selectedPoolId.value) || pools[0])
const previewStep = ref(1)
const previewAmount = ref('')
const reviewedAmount = ref('')
const amountError = ref('')
const acknowledged = ref(false)
const reviewHeading = ref(null)
const previewInput = ref(null)
let previousFocus = null
let previousOverflow = ''
const storageKey = 'harbaxis.preview-positions.v1'
const positions = ref([])
const undoPosition = ref(null)
const toast = ref('')
let toastTimer, undoTimer

function notify(message) {
  clearTimeout(toastTimer)
  toast.value = message
  toastTimer = setTimeout(() => { toast.value = '' }, 4800)
}
function readRoute() {
  const oldPage = activePage.value
  const hash = window.location.hash.slice(1).toLowerCase()
  activePage.value = hash === 'staking' ? 'Positions' : pages.find(page => page.toLowerCase() === hash) || 'Overview'
  document.title = `${activePage.value} · Harbaxis`
}
function goTo(page) {
  previousFocus = null
  closeModal()
  activePage.value = page
  window.location.hash = page.toLowerCase()
  window.scrollTo({ top: 0, behavior: 'instant' })
  nextTick(() => document.getElementById('main-content')?.focus({ preventScroll: true }))
}
function skipToContent() { document.getElementById('main-content')?.focus() }
function resetFilters() { filter.value = 'All pools'; search.value = ''; sort.value = 'featured' }
async function openModal(type) {
  if (modalType.value || dialog.value?.open) return
  previousFocus = document.activeElement
  modalType.value = type
  previousOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  await nextTick()
  dialog.value?.showModal()
  if (type === 'pool') previewInput.value?.focus()
}
function openPool(pool) {
  selectedPoolId.value = pool.id
  previewStep.value = 1
  previewAmount.value = ''; reviewedAmount.value = ''; amountError.value = ''; acknowledged.value = false
  openModal('pool')
}
function closeModal() { if (dialog.value?.open) dialog.value.close() }
function onDialogClose() {
  document.body.style.overflow = previousOverflow
  modalType.value = ''
  if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
}
function onDialogBackdrop(event) {
  if (event.target !== dialog.value) return
  const rect = dialog.value.getBoundingClientRect()
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeModal()
}
function onDialogKeydown(event) {
  if (event.key !== 'Tab' || !dialog.value?.open) return
  const modal = dialog.value
  const focusable = [...modal.querySelectorAll('a[href], button, input, select, textarea, summary, [tabindex]')]
    .filter(element => element.tabIndex >= 0 && !element.matches(':disabled')
      && !element.closest('[inert], [hidden]') && element.getClientRects().length > 0
      && getComputedStyle(element).visibility !== 'hidden')
  if (!focusable.length) {
    event.preventDefault()
    modal.focus()
    return
  }
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  const active = document.activeElement
  // Review headings use tabindex=-1, so Tab should enter the active form cycle.
  if (!focusable.includes(active) || (event.shiftKey ? active === first : active === last)) {
    event.preventDefault()
    ;(event.shiftKey ? last : first).focus()
  }
}
function validAmount(value) {
  return typeof value === 'string' && /^(?:\d+(?:\.\d{1,6})?|\.\d{1,6})$/.test(value.trim())
    && Number(value) > 0 && Number(value) <= 1000000
}
async function reviewPreview() {
  if (!validAmount(previewAmount.value)) {
    amountError.value = 'Enter an amount above 0 and up to 1,000,000, with no more than 6 decimal places.'
    previewInput.value?.focus()
    return
  }
  amountError.value = ''; reviewedAmount.value = String(Number(previewAmount.value)); acknowledged.value = false
  previewStep.value = 2
  await nextTick()
  reviewHeading.value?.focus()
}
function persistPositions() {
  try { sessionStorage.setItem(storageKey, JSON.stringify(positions.value)); return true }
  catch { notify('Your preview is available here. This browser could not save it for reloads.'); return false }
}
function loadPositions() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey) || '[]')
    if (!Array.isArray(saved)) return
    const seen = new Set()
    positions.value = saved.filter(position => {
      if (!position || typeof position.id !== 'string' || position.id.length > 100 || seen.has(position.id)
        || !pools.some(pool => pool.id === position.poolId) || !validAmount(position.amount)
        || typeof position.createdAt !== 'number' || !Number.isFinite(position.createdAt)) return false
      seen.add(position.id)
      return true
    }).slice(0, 100).map(({ id, poolId, amount, createdAt }) => ({ id, poolId, amount, createdAt }))
  } catch { positions.value = [] }
}
function savePreview() {
  if (!acknowledged.value || !validAmount(reviewedAmount.value)) return
  acknowledged.value = false
  positions.value.unshift({ id: globalThis.crypto?.randomUUID?.() || `preview-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    poolId: selectedPool.value.id, amount: reviewedAmount.value, createdAt: Date.now() })
  positions.value = positions.value.slice(0, 100)
  const persisted = persistPositions()
  goTo('Positions')
  if (persisted) notify('Preview saved in this tab. No assets moved and no transaction was sent.')
}
function poolFor(position) { return pools.find(pool => pool.id === position.poolId) || pools[0] }
function displayAmount(value) { return Number(value).toLocaleString('en-US', { maximumFractionDigits: 6 }) }
function removePosition(position) {
  clearTimeout(undoTimer)
  undoPosition.value = { position, index: positions.value.findIndex(item => item.id === position.id) }
  positions.value = positions.value.filter(item => item.id !== position.id)
  persistPositions()
  undoTimer = setTimeout(() => { undoPosition.value = null }, 8000)
}
function undoRemove() {
  if (!undoPosition.value) return
  clearTimeout(undoTimer)
  positions.value.splice(undoPosition.value.index, 0, undoPosition.value.position)
  undoPosition.value = null
  persistPositions(); notify('Preview restored.')
}
function disconnectWallet() { disconnect(); notify('Wallet disconnected from this page.') }
onMounted(() => { readRoute(); loadPositions(); window.addEventListener('hashchange', readRoute) })
onBeforeUnmount(() => {
  window.removeEventListener('hashchange', readRoute)
  clearTimeout(toastTimer); clearTimeout(undoTimer)
  if (dialog.value?.open) document.body.style.overflow = previousOverflow
})
</script>

<template>
  <div class="app-shell">
    <a class="skip-link" href="#main-content" @click.prevent="skipToContent">Skip to content</a>
    <header class="site-header">
      <a class="wordmark" href="#overview" aria-label="Harbaxis home"><img src="/harbaxis-mark.svg" width="36" height="36" alt=""/><span>harbaxis.</span></a>
      <nav class="main-nav" aria-label="Main navigation"><a v-for="page in pages" :key="page" :href="`#${page.toLowerCase()}`" :class="{ active: activePage === page }" :aria-current="activePage === page ? 'page' : undefined">{{ page }}</a></nav>
      <div class="header-actions"><span class="network-label"><i></i> Robinhood Testnet</span><button class="button button-lime connect-button" @click="openModal('wallet')"><AxisIcon name="wallet"/>{{ connected ? shortAccount : 'Connect wallet' }}</button></div>
    </header>
    <main id="main-content" tabindex="-1">
      <template v-if="activePage === 'Overview'">
        <section class="hero page-width" aria-labelledby="hero-title">
          <div class="hero-copy"><div class="eyebrow"><span class="tiny-cross" aria-hidden="true">+</span> A CLEARER DIRECTION FOR LIQUIDITY</div><h1 id="hero-title">Liquidity,<br>on your <em>axis.</em></h1><p>Find your footing in onchain liquidity. Explore pool models, build a practice position, and try the testnet at your own pace.</p><div class="hero-actions"><button class="button button-lime button-large" @click="goTo('Pools')">Explore pools <AxisIcon name="arrow"/></button><button class="text-button" @click="openModal('docs')">How Harbaxis works <AxisIcon name="external"/></button></div><div class="hero-note"><span class="tag tag-outline">TESTNET</span> A place to explore. Test tokens have no cash value.</div></div>
          <div class="axis-art"><div class="art-caption"><span>HARBAXIS / FIELD 001</span><span>FIND YOUR AXIS <AxisIcon name="plus"/></span></div>
            <svg viewBox="0 0 520 410" role="img" aria-labelledby="axis-art-title"><title id="axis-art-title">Harbaxis H mark plotted on a lime coordinate field</title><defs><pattern id="axis-grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#19352a" stroke-opacity=".12" stroke-width="1"/></pattern></defs><rect width="520" height="410" fill="#dcfa72"/><rect width="520" height="410" fill="url(#axis-grid)"/><g fill="none" stroke="#19352a" stroke-width="1"><path d="M40 200H480M260 40V370" stroke-opacity=".35"/><circle cx="260" cy="200" r="155" stroke-opacity=".2"/><path d="M38 32V48M30 40H46M474 362V378M466 370H482"/><path d="M80 332L440 70" stroke-dasharray="3 6" stroke-opacity=".35"/></g><path d="M135 294 199 104h64l-23 68h83l23-68h64l-64 190h-64l22-66h-83l-22 66Z" fill="#172a24"/><g fill="#19352a" font-size="10" font-family="monospace"><text x="24" y="200">Y</text><text x="483" y="200">X</text><text x="274" y="42">+01</text><text x="55" y="375">CAPITAL × DIRECTION</text><text x="391" y="340">46.630°</text></g><circle cx="260" cy="200" r="4" fill="#dcfa72"/></svg>
            <div class="art-footer"><span>OPEN POSSIBILITIES.</span><span>A SHARED COORDINATE. <AxisIcon name="arrow"/></span></div></div>
        </section>
        <section class="overview-strip page-width" aria-label="Explore Harbaxis"><div class="strip-intro"><AxisIcon name="grid"/><p>A little orientation.<br>A lot of possibility.</p></div><div class="strip-stat"><strong>03 <span>pools</span></strong><small>Illustrative models to explore</small></div><div class="strip-stat"><strong>100 <span>HOOD</span></strong><small>Default testnet faucet amount</small></div><div class="strip-stat"><strong>Your pace.</strong><small>Preview before you connect</small></div></section>
      </template>

      <section v-if="showDiscovery" class="discovery-section" aria-labelledby="discovery-title"><div class="page-width">
        <div class="section-heading"><div><div class="eyebrow">{{ activePage === 'Pools' ? 'THE POOL EXPLORER' : 'MAKE YOURSELF FAMILIAR' }}</div><component :is="activePage === 'Pools' ? 'h1' : 'h2'" id="discovery-title">A pool for your perspective.</component><p v-if="activePage === 'Pools'">Compare sample models and save a practice position. No wallet required.</p></div><button v-if="activePage === 'Overview'" class="text-button dark-text" @click="goTo('Pools')">Open pool explorer <AxisIcon name="arrow"/></button></div>
        <div class="discovery-layout"><div class="pool-workspace">
          <div class="pool-toolbar"><div class="filter-tabs" role="group" aria-label="Filter pools"><button v-for="item in ['All pools', 'Core', 'Experimental']" :key="item" :class="{ selected: filter === item }" :aria-pressed="filter === item" @click="filter = item">{{ item }}</button></div><label class="search-box"><AxisIcon name="search"/><input v-model="search" type="search" placeholder="Find a pool" aria-label="Search pools"/></label></div>
          <div class="table-info"><span>{{ filteredPools.length }} {{ filteredPools.length === 1 ? 'pool' : 'pools' }} · Example data</span><label>Sort by <select v-model="sort" aria-label="Sort pools"><option value="featured">Featured</option><option value="apy">Sample APY</option><option value="tvl">Sample TVL</option></select></label></div>
          <div class="pool-table" role="table" aria-label="Illustrative liquidity pools"><div class="pool-table-head" role="row"><span role="columnheader">POOL / MODEL</span><span role="columnheader">SAMPLE APY</span><span role="columnheader">SAMPLE TVL</span><span role="columnheader">EXPLORE</span></div>
            <div v-for="pool in filteredPools" :key="pool.id" class="pool-row" role="row"><div class="pool-identity" role="cell"><div class="asset-pair" :class="pool.color" aria-hidden="true"><span>{{ pool.symbols[0] }}</span><span>{{ pool.symbols[1] }}</span></div><div><h3>{{ pool.name }}</h3><p>{{ pool.pair }} <span>· {{ pool.profile }}</span></p></div></div><div class="pool-metric" role="cell"><small>SAMPLE APY</small><strong>{{ pool.apy }}<span>%</span></strong><svg viewBox="0 0 92 22" aria-hidden="true"><path d="M1 18 12 14 23 16 34 7 45 10 55 4 67 8 79 3 91 1" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></div><div class="pool-tvl" role="cell"><small>SAMPLE TVL</small><strong>${{ pool.tvl }}M</strong><div class="liquidity-bar" aria-hidden="true"><i :style="{ width: `${pool.width}%` }"></i></div></div><div class="pool-action" role="cell"><button class="square-button" :aria-label="`Preview ${pool.name} pool`" @click="openPool(pool)"><AxisIcon name="external"/><span>Preview pool</span></button></div></div>
          </div>
          <div v-if="!filteredPools.length" class="empty-state" role="status"><AxisIcon name="search"/><h3>No pools in this direction.</h3><p>Try another name, token, or model.</p><button class="text-button dark-text" @click="resetFilters">Reset filters <AxisIcon name="refresh"/></button></div>
          <div class="pool-disclosure"><AxisIcon name="shield"/><p>APY and TVL are sample figures, not live returns. PTV is a proposed token, distinct from HOOD test tokens. Previews move no assets.</p><button @click="openModal('docs')" aria-label="Read the guide to pool examples">Read guide <AxisIcon name="external"/></button></div>
        </div>
        <aside class="testnet-panel" aria-label="Your testnet wallet"><div class="panel-top"><div class="eyebrow">YOUR STARTING POINT</div><AxisIcon name="wallet"/></div>
          <template v-if="!connected"><div class="wallet-symbol"><AxisIcon name="plus"/></div><h3>Make your first<br>connection.</h3><p>Bring your wallet when you’re ready to explore HOOD on Robinhood Chain Testnet.</p><button class="button button-lime full-width" :disabled="walletBusy" @click="connectWallet">{{ isConnecting ? 'Connecting…' : 'Connect wallet' }} <AxisIcon name="arrow"/></button><small>Just looking? Pool previews work without a wallet.</small></template>
          <template v-else><div class="connection-state" :class="{ 'wrong-network': !correctNetwork }"><i></i>{{ correctNetwork ? 'Connected to testnet' : 'Network switch needed' }}</div><div class="account-heading"><h3>Your coordinates.</h3><span>{{ shortAccount }}</span></div><div class="balance-line"><span>Network balance</span><b>{{ balance ?? '—' }} <small>{{ nativeSymbol }}</small></b></div><div class="balance-line"><span>Test token balance</span><b>{{ tokenBalance ?? '—' }} <small>HOOD</small></b></div><button v-if="!correctNetwork" class="button button-lime full-width" :disabled="walletBusy" @click="switchNetwork">{{ isSwitching ? 'Switching…' : 'Switch to testnet' }} <AxisIcon name="arrow"/></button><button v-else class="button button-lime full-width" :disabled="claimDisabled" @click="claimFaucet">{{ isClaiming ? 'Claim in progress…' : !tokenConfigured ? 'Faucet unavailable' : `Claim ${faucetAmount ?? 'test'} HOOD` }} <AxisIcon name="arrow"/></button><small v-if="!tokenConfigured">The faucet contract has not been configured for this deployment.</small><button class="panel-manage text-button" @click="openModal('wallet')">Manage wallet <AxisIcon name="external"/></button></template>
          <p v-if="walletError" class="inline-message error" role="alert">{{ walletError }}</p><p v-if="claimMessage" class="inline-message" :class="{ error: claimStatus === 'error', success: claimStatus === 'confirmed' }" role="status">{{ claimMessage }}</p><a v-if="transactionUrl" class="transaction-link" :href="transactionUrl" target="_blank" rel="noopener noreferrer">View transaction <AxisIcon name="external"/></a><div class="testnet-panel-footer"><span class="small-dot"></span> TESTNET ONLY <span>NO CASH VALUE</span></div>
        </aside></div>
      </div></section>

      <section v-if="activePage === 'Overview'" class="closing-section page-width"><div class="closing-cross" aria-hidden="true">↗</div><div><div class="eyebrow">A GOOD PLACE TO BEGIN</div><h2>Get your bearings.<br>Then make your move.</h2></div><button class="button button-outline" @click="openModal('docs')">Read the field guide <AxisIcon name="arrow"/></button></section>
      <section v-if="activePage === 'Positions'" class="interior-page page-width" aria-labelledby="positions-title"><div class="section-heading"><div><div class="eyebrow">YOUR PRACTICE SPACE</div><h1 id="positions-title">A view of your positions.</h1><p>Local previews live in this browser tab for this session. They are practice plans and hold no assets.</p></div><button class="button button-lime" @click="goTo('Pools')">Explore pools <AxisIcon name="arrow"/></button></div>
        <div v-if="!positions.length" class="positions-empty"><div class="coordinate-empty"><AxisIcon name="plus"/></div><div class="eyebrow">A FRESH COORDINATE</div><h2>Your first perspective<br>starts with a preview.</h2><p>Choose a pool model, set a practice amount, and save it here. You can explore the whole flow without a wallet.</p><button class="button button-lime" @click="goTo('Pools')">Find a pool <AxisIcon name="arrow"/></button></div>
        <div v-else class="position-grid"><article v-for="position in positions" :key="position.id" class="position-card"><div class="position-card-top"><span class="tag">Local preview</span><span>{{ poolFor(position).profile }}</span></div><h2>{{ poolFor(position).name }}</h2><div class="position-amount">{{ displayAmount(position.amount) }} <small>{{ poolFor(position).token }}</small></div><p>Simulation only. No onchain deposit, assets, fees, or accrued returns.</p><div class="position-card-actions"><button class="text-button" @click="openPool(poolFor(position))">Create another <AxisIcon name="plus"/></button><button class="remove-button" :aria-label="`Remove ${poolFor(position).name} preview of ${displayAmount(position.amount)} ${poolFor(position).token}`" @click="removePosition(position)">Remove</button></div></article></div>
        <div v-if="undoPosition" class="undo-bar" role="status"><span>Preview removed.</span><button class="text-button" @click="undoRemove">Undo removal <AxisIcon name="refresh"/></button></div>
      </section>
      <section v-if="activePage === 'Governance'" class="interior-page page-width" aria-labelledby="governance-title"><div class="section-heading"><div><div class="eyebrow">OUR SHARED DIRECTION</div><h1 id="governance-title">Built to be shaped together.</h1><p>Harbaxis is an early testnet experience. There are no active proposals or onchain voting contracts in this release.</p></div></div><div class="governance-grid"><article class="governance-card"><AxisIcon name="grid"/><span class="tag">In development</span><h2>A place for<br>shared decisions.</h2><p>Pool parameters and community decisions are part of the longer-term design. Voting is not available yet, and test token balances do not grant voting power.</p><button class="button button-lime" @click="openModal('docs')">Understand the testnet <AxisIcon name="arrow"/></button></article><article class="governance-card light-card"><AxisIcon name="search"/><span class="tag">Available now</span><h2>Start with<br>a point of view.</h2><p>Explore the sample pool models and build a local preview to become familiar with the experience.</p><button class="button button-dark" @click="goTo('Pools')">Explore pool models <AxisIcon name="arrow"/></button></article></div></section>
    </main>
    <footer class="site-footer page-width"><a class="wordmark" href="#overview" aria-label="Harbaxis home"><img src="/harbaxis-mark.svg" width="28" height="28" alt=""/><span>harbaxis.</span></a><span>© 2026 Harbaxis</span><div><button @click="openModal('docs')">Field guide</button><a :href="EXPLORER_URL" target="_blank" rel="noopener noreferrer">Explorer <AxisIcon name="external"/></a><a v-if="SOCIAL_URL" :href="SOCIAL_URL" target="_blank" rel="noopener noreferrer">X <AxisIcon name="external"/></a></div><p>An independent project on Robinhood Chain Testnet. No affiliation with Robinhood. Test tokens have no cash value.</p></footer>

    <dialog ref="dialog" class="app-dialog" :class="{ 'guide-dialog': modalType === 'docs' }" aria-labelledby="dialog-title" @click="onDialogBackdrop" @keydown="onDialogKeydown" @close="onDialogClose"><div class="dialog-inner"><button class="dialog-close square-button" aria-label="Close dialog" @click="closeModal"><AxisIcon name="close"/></button>
      <template v-if="modalType === 'pool'"><div class="eyebrow">POOL EXPLORER / {{ previewStep === 1 ? '01 SET AMOUNT' : '02 REVIEW PREVIEW' }}</div><h2 v-if="previewStep === 1" id="dialog-title">{{ selectedPool.name }}</h2><h2 v-else id="dialog-title" ref="reviewHeading" class="review-heading" tabindex="-1">Check your coordinates.</h2><p class="dialog-lead">{{ previewStep === 1 ? 'Build a practice position and get a feel for the flow.' : `${selectedPool.name} · ${selectedPool.model}` }}</p><span class="tag">SIMULATION</span><div class="dialog-notice"><AxisIcon name="shield"/><p>This is a local preview. No transaction will be sent, no assets will move, and no yield will accrue.</p></div>
        <form v-if="previewStep === 1" novalidate @submit.prevent="reviewPreview"><label class="field-label" for="preview-amount">Amount to preview</label><div class="amount-input"><input id="preview-amount" ref="previewInput" v-model="previewAmount" type="text" inputmode="decimal" autocomplete="off" maxlength="30" placeholder="0.00" :aria-invalid="Boolean(amountError)" :aria-describedby="amountError ? 'amount-hint amount-error' : 'amount-hint'" @input="amountError = ''"/><span>{{ selectedPool.token }}</span></div><p id="amount-hint" class="field-hint">Up to 1,000,000 {{ selectedPool.token }} · Maximum 6 decimal places{{ selectedPool.token === 'PTV' ? ' · PTV is a proposed token' : '' }}</p><p v-if="amountError" id="amount-error" class="form-error" role="alert">{{ amountError }}</p><div class="quick-amounts" role="group" aria-label="Set practice amount"><button v-for="amount in ['100', '500', '1000']" :key="amount" type="button" @click="previewAmount = amount; amountError = ''">{{ Number(amount).toLocaleString() }}</button></div><div class="review-lines"><div><span>Sample APY</span><b>{{ selectedPool.apy }}% <small>illustrative</small></b></div><div><span>Model</span><b>{{ selectedPool.model }}</b></div><div><span>Network fee</span><b>None · local preview</b></div></div><button class="button button-dark full-width" type="submit">Review preview <AxisIcon name="arrow"/></button></form>
        <template v-else><div class="review-amount">{{ displayAmount(reviewedAmount) }} <span>{{ selectedPool.token }}</span></div><div class="review-lines"><div><span>Pool</span><b>{{ selectedPool.name }}</b></div><div><span>Sample APY</span><b>{{ selectedPool.apy }}% · not a forecast</b></div><div><span>Saved to</span><b>This tab’s practice positions</b></div><div><span>Network transaction</span><b>None</b></div></div><label class="check-label"><input v-model="acknowledged" type="checkbox"/><span>I understand this is a simulation with no real deposit or returns.</span></label><button class="button button-dark full-width" :disabled="!acknowledged" @click="savePreview">Save preview position <AxisIcon name="check"/></button><button class="text-button dark-text back-button" @click="previewStep = 1; nextTick(() => previewInput?.focus())">Back to amount</button></template>
      </template>
      <template v-if="modalType === 'wallet'"><div class="eyebrow">YOUR TESTNET CONNECTION</div><h2 id="dialog-title">Make the connection.</h2><p class="dialog-lead">Connect an EVM wallet to read your balances and request test tokens.</p><div class="wallet-status-card"><AxisIcon name="wallet"/><div><strong>{{ connected ? shortAccount : 'No wallet connected' }}</strong><span>{{ connected ? (correctNetwork ? CHAIN_PARAMS.chainName : 'Switch to Robinhood Chain Testnet') : 'Your wallet, your starting point.' }}</span></div><span v-if="connected" class="small-dot"></span></div>
        <template v-if="connected"><p class="wallet-address">{{ account }}</p><div class="review-lines"><div><span>Network balance</span><b>{{ balance ?? '—' }} {{ nativeSymbol }}</b></div><div><span>Test token balance</span><b>{{ tokenBalance ?? '—' }} HOOD</b></div></div><button v-if="!correctNetwork" class="button button-dark full-width" :disabled="walletBusy" @click="switchNetwork">{{ isSwitching ? 'Switching network…' : 'Switch to testnet' }} <AxisIcon name="arrow"/></button><button v-else class="button button-dark full-width" :disabled="claimDisabled" @click="claimFaucet">{{ isClaiming ? 'Claim in progress…' : !tokenConfigured ? 'Faucet unavailable' : `Claim ${faucetAmount ?? 'test'} HOOD` }} <AxisIcon name="arrow"/></button><p v-if="!tokenConfigured" class="field-hint">The faucet contract is not configured for this deployment.</p><div class="wallet-controls"><button class="text-button dark-text" :disabled="walletBusy || isRefreshing" @click="refreshBalances"><AxisIcon name="refresh"/>{{ isRefreshing ? 'Refreshing…' : 'Refresh balances' }}</button><button class="text-button dark-text" :disabled="walletBusy" @click="disconnectWallet">Disconnect</button></div></template>
        <button v-else class="button button-dark full-width" :disabled="walletBusy" @click="connectWallet">{{ isConnecting ? 'Waiting for wallet…' : 'Connect EVM wallet' }} <AxisIcon name="arrow"/></button><p v-if="walletError" class="inline-message light-error" role="alert">{{ walletError }}</p><p v-if="claimMessage" class="inline-message" :class="claimStatus === 'error' ? 'light-error' : 'light-message'" role="status">{{ claimMessage }}</p><a v-if="transactionUrl" class="transaction-link" :href="transactionUrl" target="_blank" rel="noopener noreferrer">View transaction <AxisIcon name="external"/></a><p class="wallet-footnote">Connecting does not send a transaction. A HOOD claim requires a separate wallet confirmation and a network fee. Faucet availability and cooldown are read from the contract.</p>
      </template>
      <template v-if="modalType === 'docs'"><div class="eyebrow">THE HARBAXIS FIELD GUIDE</div><h2 id="dialog-title">Get your bearings.</h2><p class="dialog-lead">A small guide to exploring with confidence.</p><div class="guide-step"><span>01</span><div><h3>Start with a perspective.</h3><p>Filter the three sample pool models by category, search by token, or compare illustrative APY and TVL. These figures are examples, not live markets or expected returns.</p></div></div><div class="guide-step"><span>02</span><div><h3>Make a practice position.</h3><p>Enter an amount, review the details, and save a local preview. Previews stay in this tab’s session and can be removed or restored. No wallet, deposit, or transaction is required.</p></div></div><div class="guide-step"><span>03</span><div><h3>Try the testnet when ready.</h3><p>Connect an EVM wallet and switch to {{ CHAIN_PARAMS.chainName }} (chain ID {{ CHAIN_ID }}). If the HOOD contract is configured, you can request faucet tokens and follow the transaction in the explorer.</p></div></div><div class="guide-contract"><p class="eyebrow">HOOD TEST TOKEN CONTRACT</p><a v-if="tokenConfigured" :href="`${explorerBase}/address/${CONTRACT_ADDRESS}`" target="_blank" rel="noopener noreferrer">{{ CONTRACT_ADDRESS }} <AxisIcon name="external"/></a><p v-else>Not configured for this deployment</p></div><div class="guide-details"><details><summary>How do the tokens differ?</summary><p>HOOD is the Robinhood Commons testnet utility token used by the faucet. PTV is a proposed project token shown only in sample pool models. {{ nativeSymbol }} is the configured network currency. Test tokens have no cash value.</p></details><details><summary>What is available in this release?</summary><p>Pool exploration and saved local previews are available. Wallet balances and faucet claims require a configured deployment and a compatible wallet. Live liquidity deposits, staking, swaps, and governance voting are not implemented.</p></details><details><summary>Why can’t I claim more HOOD?</summary><p>The faucet contract controls its amount, cooldown, supply cap, and paused state. The default is 100 HOOD with a one-day cooldown. The page checks current availability before asking you to confirm a claim.</p></details></div><button class="button button-dark full-width" @click="goTo('Pools')">Explore pools <AxisIcon name="arrow"/></button>
      </template>
    </div></dialog>
    <div v-if="toast" class="toast" role="status" aria-live="polite"><AxisIcon name="check"/><span>{{ toast }}</span><button aria-label="Dismiss notification" @click="toast = ''"><AxisIcon name="close"/></button></div>
  </div>
</template>
