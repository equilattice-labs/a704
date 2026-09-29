<script setup>
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from 'vue'
import FlowIcon from './components/FlowIcon.vue'
import {
  BRAND_MARK_URL,
  BRAND_NAME,
  BRAND_SLUG,
  BRAND_TAGLINE,
  CLUSTER_LABEL,
  SOCIAL_URL,
  TOKEN_EXPLORER_URL,
  TOKEN_MINT,
  TOKEN_SYMBOL,
} from './config'
import { useWallet } from './composables/useWallet'

const {
  connected,
  account,
  shortAccount,
  balance,
  tokenBalance,
  walletCluster,
  correctNetwork,
  isConnecting,
  isRefreshing,
  walletError,
  tokenError,
  tokenNotice,
  tokenConfigured,
  connectWallet,
  disconnect,
  refreshBalances,
} = useWallet()

const pages = ['Overview', 'Pools', 'Positions', 'Governance']
const labels = { Overview: 'Desk', Pools: 'Markets', Positions: 'Positions', Governance: 'Protocol' }
const icons = { Overview: 'activity', Pools: 'layers', Positions: 'portfolio', Governance: 'community' }
const pools = [
  {
    id: 'orl-sol',
    name: `${TOKEN_SYMBOL} / SOL`,
    token: TOKEN_SYMBOL,
    profile: 'Core',
    apr: 18.4,
    tvl: 2.84,
    volume: 184.2,
    fee: '0.30%',
    color: 'mint',
    symbols: [TOKEN_SYMBOL.slice(0, 1), 'S'],
    model: 'Balanced liquidity',
  },
  {
    id: 'sol-usdc',
    name: 'SOL / USDC',
    token: 'SOL',
    profile: 'Stable',
    apr: 9.8,
    tvl: 14.2,
    volume: 902.6,
    fee: '0.05%',
    color: 'blue',
    symbols: ['S', '$'],
    model: 'Stable pair liquidity',
  },
  {
    id: 'orl-usdc',
    name: `${TOKEN_SYMBOL} / USDC`,
    token: TOKEN_SYMBOL,
    profile: 'Experimental',
    apr: 31.6,
    tvl: 0.92,
    volume: 74.8,
    fee: '1.00%',
    color: 'coral',
    symbols: [TOKEN_SYMBOL.slice(0, 1), '$'],
    model: 'Variable liquidity',
  },
]

const activePage = ref('Overview')
const search = ref('')
const filter = ref('All pools')
const sort = ref('featured')
const filteredPools = computed(() => {
  const query = search.value.trim().toLowerCase()
  const rows = pools.filter((pool) =>
    (filter.value === 'All pools' || pool.profile === filter.value)
    && `${pool.name} ${pool.profile}`.toLowerCase().includes(query),
  )
  if (sort.value === 'apr') rows.sort((a, b) => b.apr - a.apr)
  if (sort.value === 'tvl') rows.sort((a, b) => b.tvl - a.tvl)
  return rows
})

const selectedPoolId = ref(pools[0].id)
const selectedPool = computed(() => pools.find((pool) => pool.id === selectedPoolId.value) || pools[0])
const secondaryToken = computed(() => selectedPool.value.name.split(' / ')[1])
const allocation = ref(50)
const allocationLabel = computed(() => `${allocation.value}% ${selectedPool.value.token} / ${100 - allocation.value}% ${secondaryToken.value}`)
const positions = ref([])
const storageKey = 'solana.preview-positions.v1'
const modal = ref('')
const previewStep = ref(1)
const previewAmount = ref('')
const reviewedAmount = ref('')
const amountError = ref('')
const acknowledged = ref(false)
const dialog = ref(null)
const previewInput = ref(null)
const toast = ref('')
let previousFocus = null
let toastTimer

const walletStatus = computed(() => {
  if (!connected.value) return 'Local previews work without a wallet.'
  if (correctNetwork.value === false) return `Wallet reports Solana ${walletCluster.value}; reads are paused.`
  return `Wallet reports Solana ${walletCluster.value}; balances are read-only.`
})

function notify(value) {
  clearTimeout(toastTimer)
  toast.value = value
  toastTimer = setTimeout(() => { toast.value = '' }, 4200)
}

function readRoute() {
  const hash = window.location.hash.slice(1).toLowerCase()
  activePage.value = hash === 'staking'
    ? 'Positions'
    : pages.find((page) => page.toLowerCase() === hash) || 'Overview'
  document.title = `${labels[activePage.value]} | ${BRAND_NAME}`
}

function goTo(page) {
  closeModal()
  activePage.value = page
  window.location.hash = page.toLowerCase()
  window.scrollTo({ top: 0, behavior: 'instant' })
  nextTick(() => document.getElementById('main-content')?.focus({ preventScroll: true }))
}

function openModal(type) {
  if (modal.value) return
  previousFocus = document.activeElement
  modal.value = type
  document.body.style.overflow = 'hidden'
  nextTick(() => {
    dialog.value?.showModal()
    if (type === 'pool') previewInput.value?.focus()
  })
}

function closeModal() {
  if (dialog.value?.open) dialog.value.close()
  else modal.value = ''
}

function onDialogClose() {
  document.body.style.overflow = ''
  modal.value = ''
  if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
}

function onBackdrop(event) {
  if (event.target !== dialog.value) return
  const rect = dialog.value.getBoundingClientRect()
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeModal()
}

function selectPool(pool) {
  selectedPoolId.value = pool.id
  allocation.value = pool.id === 'sol-usdc' ? 70 : pool.id === 'orl-usdc' ? 35 : 50
}

function openPool(pool) {
  if (selectedPoolId.value !== pool.id) selectPool(pool)
  previewStep.value = 1
  previewAmount.value = ''
  reviewedAmount.value = ''
  amountError.value = ''
  acknowledged.value = false
  openModal('pool')
}

function validAmount(value) {
  return typeof value === 'string'
    && /^(?:\d+(?:\.\d{1,6})?|\.\d{1,6})$/.test(value.trim())
    && Number(value) > 0
    && Number(value) <= 1000000
}

function reviewPreview() {
  if (!validAmount(previewAmount.value)) {
    amountError.value = 'Enter an amount above 0 with up to 6 decimal places.'
    previewInput.value?.focus()
    return
  }
  amountError.value = ''
  reviewedAmount.value = String(Number(previewAmount.value))
  previewStep.value = 2
}

function loadPositions() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey) || '[]')
    if (Array.isArray(saved)) {
      positions.value = saved
        .filter((position) => position && pools.some((pool) => pool.id === position.poolId) && validAmount(String(position.amount)))
        .slice(0, 100)
    }
  } catch {
    positions.value = []
  }
}

function persistPositions() {
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(positions.value))
  } catch {
    notify('Session storage is unavailable; this preview lasts until refresh.')
  }
}

function savePreview() {
  if (!acknowledged.value) return
  positions.value.unshift({
    id: crypto.randomUUID?.() || `preview-${Date.now()}`,
    poolId: selectedPool.value.id,
    amount: reviewedAmount.value,
    allocation: allocation.value,
    createdAt: Date.now(),
  })
  persistPositions()
  goTo('Positions')
  notify('Preview saved locally. No transaction was sent.')
}

function removePosition(item) {
  positions.value = positions.value.filter((position) => position.id !== item.id)
  persistPositions()
  notify('Preview removed from this session.')
}

function poolFor(item) {
  return pools.find((pool) => pool.id === item.poolId) || pools[0]
}

function displayDate(value) {
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function displayAmount(value) {
  return Number(value).toLocaleString('en-US', { maximumFractionDigits: 6 })
}

function resetFilters() {
  filter.value = 'All pools'
  search.value = ''
  sort.value = 'featured'
}

async function connect() {
  if (await connectWallet()) notify('Solana wallet connected.')
}

async function copyAddress() {
  if (!account.value) return
  try {
    await navigator.clipboard.writeText(account.value)
    notify('Wallet address copied.')
  } catch {
    notify('Copy failed. Select the address and copy it manually.')
  }
}

onMounted(() => {
  readRoute()
  loadPositions()
  window.addEventListener('hashchange', readRoute)
})

onBeforeUnmount(() => {
  window.removeEventListener('hashchange', readRoute)
  clearTimeout(toastTimer)
})
</script>

<template>
  <div class="app-shell" :data-brand="BRAND_SLUG">
    <a class="skip-link" href="#main-content" @click.prevent="document.getElementById('main-content')?.focus()">
      Skip to content
    </a>

    <aside class="side-rail">
      <a class="brand" href="#overview" :aria-label="`${BRAND_NAME} home`" @click.prevent="goTo('Overview')">
        <img :src="BRAND_MARK_URL" alt="" width="34" height="34">
        <span>{{ BRAND_NAME }}</span>
      </a>
      <div class="rail-network"><i></i><span>{{ CLUSTER_LABEL }}</span></div>
      <nav class="primary-nav" aria-label="Primary navigation">
        <span class="nav-caption">WORKSPACE</span>
        <a
          v-for="page in pages"
          :key="page"
          :href="'#' + page.toLowerCase()"
          :class="{ active: activePage === page }"
          :aria-current="activePage === page ? 'page' : undefined"
          @click.prevent="goTo(page)"
        >
          <FlowIcon :name="icons[page]" />
          <span>{{ labels[page] }}</span>
          <b v-if="page === 'Positions' && positions.length">{{ positions.length }}</b>
        </a>
      </nav>

      <div class="rail-bottom">
        <div class="rail-mode"><span class="mode-mark"><FlowIcon name="shield" /></span><div><strong>Read-only</strong><small>Practice environment</small></div></div>
        <div class="rail-token"><span class="token-mark">{{ TOKEN_SYMBOL.slice(0, 1) }}</span><div><small>Configured asset</small><strong>{{ TOKEN_SYMBOL }}</strong></div><span class="asset-state"><i></i></span></div>
        <a v-if="SOCIAL_URL" class="rail-social" :href="SOCIAL_URL" target="_blank" rel="noopener noreferrer">Follow on X <FlowIcon name="external" /></a>
      </div>
    </aside>

    <div class="shell-main">
      <header class="site-header">
        <div class="header-context">
          <span class="header-label">8-BIT ROUTE BOARD</span>
          <span class="header-divider">/</span>
          <span class="header-page">{{ labels[activePage] }}</span>
        </div>
        <div class="market-tape" aria-label="Illustrative route rates">
          <span><i class="tape-dot mint"></i>{{ TOKEN_SYMBOL }} / SOL <b>18.4%</b></span>
          <span><i class="tape-dot blue"></i>SOL / USDC <b>9.8%</b></span>
          <span><i class="tape-dot coral"></i>{{ TOKEN_SYMBOL }} / USDC <b>31.6%</b></span>
        </div>
        <div class="header-actions">
          <span class="network-pill"><i></i>{{ CLUSTER_LABEL }}</span>
          <button class="wallet-button" @click="openModal('wallet')">
            <FlowIcon name="wallet" />
            <span>{{ connected ? shortAccount : 'Connect wallet' }}</span>
          </button>
        </div>
      </header>

      <main id="main-content" class="main-content" tabindex="-1">
        <section v-if="activePage === 'Overview'" class="desk-view">
          <div class="workspace-intro">
            <div>
              <span class="eyebrow">LEVEL SELECT <b class="eyebrow-separator">/</b> {{ CLUSTER_LABEL }}</span>
              <h1>Route board</h1>
              <p>{{ BRAND_TAGLINE }} <span class="copy-divider">·</span> Sample routes and local quest previews.</p>
            </div>
            <div class="intro-actions">
              <span class="demo-badge"><i></i> DEMO DATA</span>
              <button class="guide-button" aria-label="Open guide" title="Open guide" @click="openModal('docs')"><FlowIcon name="book" /></button>
            </div>
          </div>

          <div class="market-stats" aria-label="Sample market summary">
            <div><span>Tracked routes</span><strong>{{ pools.length }}</strong><small>sample pairs</small></div>
            <div><span>Combined TVL</span><strong>$18.0M</strong><small>illustrative</small></div>
            <div><span>24h volume</span><strong>$1.16B</strong><small>illustrative</small></div>
            <div class="stat-highlight"><span>Highest sample APR</span><strong>31.6%</strong><small>{{ TOKEN_SYMBOL }} / USDC</small></div>
          </div>

          <div class="trading-workspace">
            <section class="market-board" aria-labelledby="market-board-title">
              <div class="panel-heading">
                <div><span class="eyebrow">WORLD MAP</span><h2 id="market-board-title">Markets</h2></div>
                <button class="link-button" @click="goTo('Pools')">Full market list <FlowIcon name="arrow" /></button>
              </div>
              <div class="market-controls">
                <div class="segmented" aria-label="Filter market routes">
                  <button v-for="option in ['All pools', 'Core', 'Stable', 'Experimental']" :key="option" :class="{ selected: filter === option }" :aria-pressed="filter === option" @click="filter = option">{{ option }}</button>
                </div>
                <label class="search-box"><FlowIcon name="search" /><input v-model="search" type="search" placeholder="Search markets" aria-label="Search market routes"></label>
              </div>

              <div class="route-table" role="group" aria-label="Available markets">
                <button
                  v-for="pool in filteredPools"
                  :key="pool.id"
                  class="route-item"
                  :class="{ selected: selectedPool.id === pool.id }"
                  :aria-pressed="selectedPool.id === pool.id"
                  @click="selectPool(pool)"
                >
                  <span :class="['coin-stack', pool.color]" aria-hidden="true"><i>{{ pool.symbols[0] }}</i><i>{{ pool.symbols[1] }}</i></span>
                  <span class="pair-copy"><strong>{{ pool.name }}</strong><small>{{ pool.profile }} · {{ pool.fee }} fee</small></span>
                  <span class="route-metric"><small>APR</small><b>{{ pool.apr }}%</b></span>
                  <span class="route-metric"><small>TVL</small><b>${{ pool.tvl }}M</b></span>
                  <FlowIcon name="chevron" />
                </button>
                <div v-if="!filteredPools.length" class="empty-inline">No matching markets. <button class="link-button" @click="resetFilters">Reset filters</button></div>
              </div>

              <div class="selected-market">
                <div class="selected-market-heading">
                  <div><span class="eyebrow">SELECTED MARKET</span><h3>{{ selectedPool.name }}</h3></div>
                  <span class="route-badge">{{ selectedPool.profile }}</span>
                </div>
                <div class="chart-readout"><span>Illustrative route activity</span><b>{{ selectedPool.apr }}% sample APR</b></div>
                <div class="sparkline" aria-hidden="true">
                  <i v-for="n in 32" :key="n" :style="{ height: (18 + ((n * 19 + selectedPool.apr * 4) % 72)) + '%' }"></i>
                  <span class="chart-cursor"></span>
                </div>
                <div class="route-facts"><span><small>Pool model</small><strong>{{ selectedPool.model }}</strong></span><span><small>Fee tier</small><strong>{{ selectedPool.fee }}</strong></span><span><small>Data state</small><strong>Illustrative</strong></span></div>
              </div>
            </section>

            <aside class="builder-panel" aria-labelledby="builder-title">
              <div class="panel-heading">
                <div><span class="eyebrow">POWER-UP LAB</span><h2 id="builder-title">Position builder</h2></div>
                <span class="local-badge">NO SIGNATURE</span>
              </div>
              <div class="builder-pair">
                <span :class="['coin-stack large', selectedPool.color]" aria-hidden="true"><i>{{ selectedPool.symbols[0] }}</i><i>{{ selectedPool.symbols[1] }}</i></span>
                <div><strong>{{ selectedPool.name }}</strong><small>{{ selectedPool.model }}</small></div>
                <button class="icon-button" aria-label="Browse markets" title="Browse markets" @click="goTo('Pools')"><FlowIcon name="chevron" /></button>
              </div>
              <div class="allocation-tool">
                <div class="allocation-header"><label for="allocation-range">Allocation split</label><strong>{{ allocationLabel }}</strong></div>
                <div class="mix-wheel" :style="{ '--mix': allocation + '%' }"><strong>{{ allocation }}%</strong><small>{{ selectedPool.token }}</small></div>
                <input id="allocation-range" v-model.number="allocation" aria-label="Allocation split" type="range" min="10" max="90" step="5">
                <div class="mix-legend"><span><i class="dot mint"></i>{{ selectedPool.token }} <b>{{ allocation }}%</b></span><span><i class="dot coral"></i>{{ secondaryToken }} <b>{{ 100 - allocation }}%</b></span></div>
              </div>
              <div class="quote-row"><span><small>Sample APR</small><b>{{ selectedPool.apr }}%</b></span><span><small>Sample TVL</small><b>${{ selectedPool.tvl }}M</b></span><span><small>Fee</small><b>{{ selectedPool.fee }}</b></span></div>
              <button class="primary-button full" @click="openPool(selectedPool)">Preview position <FlowIcon name="arrow" /></button>
              <p class="action-note"><FlowIcon name="shield" /> Preview only. No funds move.</p>
            </aside>
          </div>

          <div class="disclosure"><FlowIcon name="info" /><span>Market figures are interface fixtures. Wallet access is optional and reads SOL plus {{ TOKEN_SYMBOL }} from {{ CLUSTER_LABEL }}.</span><button class="link-button" @click="openModal('wallet')">Wallet details <FlowIcon name="arrow" /></button></div>
        </section>

        <section v-else-if="activePage === 'Pools'" class="page-view">
          <div class="view-heading"><div><span class="eyebrow">WORLD MAP</span><h1>Markets</h1><p>Compare sample pairs and open a local quest preview.</p></div><span class="count-badge">{{ filteredPools.length }} routes</span></div>
          <div class="pool-toolbar">
            <div class="segmented" aria-label="Filter market routes"><button v-for="option in ['All pools', 'Core', 'Stable', 'Experimental']" :key="option" :class="{ selected: filter === option }" :aria-pressed="filter === option" @click="filter = option">{{ option }}</button></div>
            <label class="search-box"><FlowIcon name="search" /><input v-model="search" type="search" placeholder="Search pairs" aria-label="Search pools"></label>
            <label class="sort-control"><span>Sort</span><select v-model="sort" aria-label="Sort pools"><option value="featured">Featured</option><option value="apr">Sample APR</option><option value="tvl">Sample TVL</option></select></label>
          </div>
          <div class="pool-grid">
            <article v-for="pool in filteredPools" :key="pool.id" class="pool-card" :class="[pool.color, { selected: selectedPool.id === pool.id }]">
              <button class="pool-card-select" :aria-pressed="selectedPool.id === pool.id" @click="selectPool(pool)">
                <span class="pool-card-top"><span :class="['coin-stack', pool.color]" aria-hidden="true"><i>{{ pool.symbols[0] }}</i><i>{{ pool.symbols[1] }}</i></span><span class="route-badge">{{ pool.profile }}</span></span>
                <span class="pool-name">{{ pool.name }}</span>
                <span class="pool-description">{{ pool.model }} · {{ pool.fee }} fee</span>
                <span class="mini-chart" aria-hidden="true"><i v-for="n in 20" :key="n" :style="{ height: (22 + ((n * 17 + pool.apr * 3) % 68)) + '%' }"></i></span>
                <span class="card-metrics"><span><small>Sample APR</small><b>{{ pool.apr }}%</b></span><span><small>Sample TVL</small><b>${{ pool.tvl }}M</b></span><span><small>24h volume</small><b>${{ pool.volume }}M</b></span></span>
              </button>
              <button class="secondary-button" @click="openPool(pool)">Preview route <FlowIcon name="arrow" /></button>
            </article>
          </div>
          <div v-if="!filteredPools.length" class="empty-state"><FlowIcon name="search" /><h2>No routes found</h2><p>Try another pair or reset the filters.</p><button class="secondary-button" @click="resetFilters">Reset filters</button></div>
          <p class="disclosure"><FlowIcon name="info" /><span>All liquidity, volume and rate figures on this screen are illustrative and are not live market data.</span></p>
        </section>

        <section v-else-if="activePage === 'Positions'" class="page-view">
          <div class="view-heading"><div><span class="eyebrow">QUEST LOG</span><h1>Positions</h1><p>Saved previews live in this browser tab only.</p></div><button class="primary-button" @click="goTo('Pools')"><FlowIcon name="plus" /> New preview</button></div>
          <div class="ledger-summary"><span class="summary-icon"><FlowIcon name="portfolio" /></span><div><small>Saved previews</small><strong>{{ String(positions.length).padStart(2, '0') }}</strong></div><span class="local-badge">SESSION ONLY</span></div>
          <div v-if="!positions.length" class="empty-state"><span class="empty-icon"><FlowIcon name="layers" /></span><h2>No saved previews</h2><p>Select a route, set an amount and save it for this session.</p><button class="primary-button" @click="goTo('Pools')">Open markets <FlowIcon name="arrow" /></button></div>
          <div v-else class="position-list">
            <div class="position-list-head"><span>Route / created</span><span>Amount</span><span>Mix</span><span>Status</span><span></span></div>
            <article v-for="position in positions" :key="position.id" class="position-row">
              <div class="position-name"><span :class="['coin-single', poolFor(position).color]">{{ poolFor(position).symbols[0] }}</span><div><strong>{{ poolFor(position).name }}</strong><small>{{ poolFor(position).profile }} · {{ displayDate(position.createdAt) }}</small></div></div>
              <b>{{ displayAmount(position.amount) }} <small>{{ poolFor(position).token }}</small></b>
              <b>{{ position.allocation || 50 }} / {{ 100 - (position.allocation || 50) }}</b>
              <span class="preview-status"><i></i> Preview</span>
              <button class="icon-button" :aria-label="'Remove ' + poolFor(position).name + ' preview'" title="Remove preview" @click="removePosition(position)"><FlowIcon name="trash" /></button>
            </article>
          </div>
          <p class="disclosure centered"><FlowIcon name="shield" /> Simulation only: no deposits, fees or accrued returns.</p>
        </section>

        <section v-else class="page-view">
          <div class="view-heading"><div><span class="eyebrow">PROTOCOL HUB</span><h1>Protocol</h1><p>Token, wallet and program availability on the selected Solana cluster.</p></div><span class="count-badge muted">Programs pending</span></div>
          <div class="protocol-grid">
            <section class="protocol-card">
              <div class="protocol-mark"><FlowIcon name="community" /></div><span class="eyebrow">TOKEN + PROGRAM</span>
              <h2>{{ tokenConfigured ? `${TOKEN_SYMBOL} mint configured.` : 'Mint pending.' }}<br>Governance paused.</h2>
              <p>{{ tokenConfigured ? `The ${TOKEN_SYMBOL} SPL Token mint is configured on ${CLUSTER_LABEL}. Pool and voting programs are not deployed.` : 'No Solana token mint, pool program, or voting account is configured in this workspace.' }}</p>
              <div class="protocol-status" :class="{ configured: tokenConfigured }"><i></i>{{ tokenConfigured ? `${TOKEN_SYMBOL} mint on ${CLUSTER_LABEL}` : 'Waiting for deployment inputs' }}</div>
              <p v-if="tokenConfigured" class="explorer-link"><a :href="TOKEN_EXPLORER_URL" target="_blank" rel="noopener noreferrer">View {{ TOKEN_SYMBOL }} mint on Explorer <FlowIcon name="external" /></a></p>
            </section>
            <section class="roadmap-card">
              <div class="panel-heading"><div><span class="eyebrow">AVAILABILITY</span><h2>Network capabilities</h2></div></div>
              <ol>
                <li><span class="road-node"><FlowIcon name="check" /></span><div><span class="route-badge success">AVAILABLE</span><h3>Compare and simulate</h3><p>Browse illustrative routes and save local previews without a wallet.</p><button class="link-button" @click="goTo('Pools')">Open markets <FlowIcon name="arrow" /></button></div></li>
                <li><span class="road-node"><FlowIcon name="check" /></span><div><span class="route-badge info">OPTIONAL</span><h3>Read a Solana wallet</h3><p>Connect an injected wallet to read native SOL and {{ TOKEN_SYMBOL }} balances from the configured RPC.</p><button class="link-button" @click="openModal('wallet')">Manage wallet <FlowIcon name="arrow" /></button></div></li>
                <li class="future"><span class="road-node"><FlowIcon name="clock" /></span><div><span class="route-badge">WAITING</span><h3>Pools, swaps, governance</h3><p>These actions stay disabled until programs and a verified data source are deployed.</p></div></li>
              </ol>
            </section>
          </div>
        </section>
      </main>

      <footer class="site-footer"><span><b>{{ BRAND_NAME }}</b><span class="footer-divider">·</span>{{ BRAND_TAGLINE }}</span><span>{{ CLUSTER_LABEL }} · read-only workspace</span></footer>
    </div>

    <nav class="mobile-nav" aria-label="Mobile navigation">
      <a v-for="page in pages" :key="page" :href="'#' + page.toLowerCase()" :class="{ active: activePage === page }" :aria-current="activePage === page ? 'page' : undefined" @click.prevent="goTo(page)">
        <FlowIcon :name="icons[page]" /><span>{{ labels[page] }}</span><b v-if="page === 'Positions' && positions.length">{{ positions.length }}</b>
      </a>
    </nav>

    <dialog
      ref="dialog"
      class="app-dialog"
      :aria-labelledby="modal === 'pool' ? (previewStep === 1 ? 'preview-title' : 'review-title') : modal === 'wallet' ? 'wallet-title' : 'guide-title'"
      @close="onDialogClose"
      @click="onBackdrop"
    >
      <div v-if="modal === 'pool'" class="dialog-body">
        <button class="dialog-close icon-button" aria-label="Close preview" title="Close preview" @click="closeModal"><FlowIcon name="close" /></button>
        <div class="dialog-kicker"><span class="route-badge">LOCAL PREVIEW</span><span>STEP {{ previewStep }} / 2</span></div>
        <template v-if="previewStep === 1">
          <h2 id="preview-title">Build a {{ selectedPool.name }} position</h2><p class="dialog-lead">No wallet signature or asset movement is possible here.</p>
          <label class="field-label" for="preview-amount">Practice amount</label>
          <div class="amount-input"><input id="preview-amount" ref="previewInput" v-model="previewAmount" inputmode="decimal" placeholder="0.00" @keydown.enter.prevent="reviewPreview"><span>{{ selectedPool.token }}</span></div>
          <p v-if="amountError" class="form-error" role="alert">{{ amountError }}</p>
          <div class="quick-amounts"><button v-for="amount in ['25', '100', '250']" :key="amount" type="button" @click="previewAmount = amount">{{ amount }} {{ selectedPool.token }}</button></div>
          <div class="dialog-summary"><span>Route <b>{{ selectedPool.name }}</b></span><span>Mix <b>{{ allocationLabel }}</b></span><span>Sample APR <b class="positive-text">{{ selectedPool.apr }}%</b></span></div>
          <button class="primary-button full" @click="reviewPreview">Review position <FlowIcon name="arrow" /></button>
        </template>
        <template v-else>
          <h2 id="review-title">Review before saving</h2><p class="dialog-lead">The position will be stored in this browser tab only.</p>
          <div class="review-amount"><small>Practice amount</small><strong>{{ displayAmount(reviewedAmount) }} {{ selectedPool.token }}</strong></div>
          <div class="dialog-summary"><span>Route <b>{{ selectedPool.name }}</b></span><span>Allocation <b>{{ allocationLabel }}</b></span><span>State <b>Simulation</b></span></div>
          <label class="check-label"><input v-model="acknowledged" type="checkbox"><span>I understand this preview does not deposit funds or execute a swap.</span></label>
          <button class="primary-button full" :disabled="!acknowledged" @click="savePreview">Save local preview <FlowIcon name="check" /></button>
          <button class="back-button" @click="previewStep = 1">Back to amount</button>
        </template>
      </div>

      <div v-else-if="modal === 'wallet'" class="dialog-body">
        <button class="dialog-close icon-button" aria-label="Close wallet" title="Close wallet" @click="closeModal"><FlowIcon name="close" /></button>
        <div class="dialog-kicker"><span class="route-badge">WALLET READER</span><span>{{ CLUSTER_LABEL }}</span></div>
        <h2 id="wallet-title">{{ connected ? 'Wallet connected' : 'Connect to read balances' }}</h2>
        <p class="dialog-lead">{{ BRAND_NAME }} reads balances from an injected Solana wallet and never requests a signature in this workspace.</p>
        <div class="wallet-card"><FlowIcon name="wallet" /><div><strong>{{ connected ? shortAccount : 'No wallet connected' }}</strong><small>{{ walletStatus }}</small></div><i :class="{ connected }"></i></div>
        <button v-if="connected" class="wallet-address" :aria-label="'Copy wallet address ' + account" @click="copyAddress">{{ account }}</button>
        <div v-if="connected" class="balance-grid"><span><small>SOL balance</small><b>{{ isRefreshing ? 'Refreshing...' : balance ?? '—' }}</b></span><span><small>{{ TOKEN_SYMBOL }} balance</small><b>{{ tokenBalance ?? '—' }}</b></span></div>
        <p v-if="walletError" class="form-error" role="alert">{{ walletError }}</p>
        <p v-if="tokenError || tokenNotice" class="token-notice" role="status">{{ tokenError || tokenNotice }}</p>
        <div class="dialog-actions">
          <button v-if="!connected" class="primary-button full" :disabled="isConnecting" @click="connect">{{ isConnecting ? 'Connecting...' : 'Connect wallet' }} <FlowIcon name="wallet" /></button>
          <template v-else><button class="secondary-button" :disabled="isRefreshing" @click="refreshBalances"><FlowIcon name="refresh" /> {{ isRefreshing ? 'Refreshing...' : 'Refresh' }}</button><button class="secondary-button" @click="disconnect">Disconnect</button></template>
        </div>
        <div v-if="tokenConfigured" class="mint-note"><strong>{{ TOKEN_SYMBOL }} mint configured</strong><small>{{ TOKEN_MINT }}</small><a :href="TOKEN_EXPLORER_URL" target="_blank" rel="noopener noreferrer">Open Explorer <FlowIcon name="external" /></a></div>
      </div>

      <div v-else class="dialog-body">
        <button class="dialog-close icon-button" aria-label="Close guide" title="Close guide" @click="closeModal"><FlowIcon name="close" /></button>
        <div class="dialog-kicker"><span class="route-badge">QUICK GUIDE</span><span>01 / 03</span></div>
        <h2 id="guide-title">Market workspace</h2>
        <p class="dialog-lead">{{ BRAND_NAME }} is a {{ CLUSTER_LABEL }} interface for comparing sample pools and saving local practice positions.</p>
        <div class="guide-list"><div><b>01</b><p><strong>Pick a pair.</strong> Route figures are illustrative and marked as sample data.</p></div><div><b>02</b><p><strong>Set a mix.</strong> Enter a practice amount and review the split.</p></div><div><b>03</b><p><strong>Save locally.</strong> No deposit, swap, governance or live pool program is available.</p></div></div>
        <button class="primary-button full" @click="closeModal">Close guide <FlowIcon name="check" /></button>
      </div>
    </dialog>

    <div v-if="toast" class="toast" role="status"><FlowIcon name="check" /> {{ toast }}</div>
  </div>
</template>
