<script setup>
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from "vue";
import FlowIcon from "./components/FlowIcon.vue";
import { useWallet } from "./composables/useWallet";
import {
  CHAIN_ID,
  CHAIN_PARAMS,
  CONTRACT_ADDRESS,
  EXPLORER_URL,
  SOCIAL_URL,
} from "./config";

const {
  connected,
  account,
  shortAccount,
  balance,
  tokenBalance,
  correctNetwork,
  isConnecting,
  isSwitching,
  isClaiming,
  isRefreshing,
  walletError,
  transactionHash,
  claimStatus,
  claimMessage,
  faucetAmount,
  tokenConfigured,
  connectWallet,
  disconnect,
  switchNetwork,
  refreshBalances,
  claimFaucet,
} = useWallet();
const pages = ["Overview", "Pools", "Positions", "Governance"];
const activePage = ref("Overview");
const exploredPools = ref(false);
const spotlightIndex = ref(0);
const spotlightPool = computed(() => pools[spotlightIndex.value]);
const filter = ref("All pools");
const search = ref("");
const sort = ref("featured");
const pools = [
  {
    id: "harbaxis-robin",
    name: "Zuno / Robin",
    pair: "PTV / RBH",
    token: "PTV",
    profile: "Core",
    apy: 42.8,
    tvl: 18.4,
    color: "lime",
    symbols: ["z", "R"],
    model: "Balanced liquidity",
    width: 92,
  },
  {
    id: "robin-usdc",
    name: "Robin / USDC",
    pair: "RBH / USDC",
    token: "RBH",
    profile: "Core",
    apy: 28.6,
    tvl: 11.2,
    color: "blue",
    symbols: ["R", "$"],
    model: "Stable pair liquidity",
    width: 66,
  },
  {
    id: "harbaxis-eth",
    name: "Zuno / ETH",
    pair: "PTV / ETH",
    token: "PTV",
    profile: "Experimental",
    apy: 67.1,
    tvl: 6.8,
    color: "purple",
    symbols: ["z", "Ξ"],
    model: "Variable liquidity",
    width: 42,
  },
];
const filteredPools = computed(() => {
  const query = search.value.trim().toLowerCase();
  const result = pools.filter(
    (pool) =>
      (filter.value === "All pools" || pool.profile === filter.value) &&
      `${pool.name} ${pool.pair} ${pool.profile}`.toLowerCase().includes(query),
  );
  if (sort.value === "apy") result.sort((a, b) => b.apy - a.apy);
  if (sort.value === "tvl") result.sort((a, b) => b.tvl - a.tvl);
  return result;
});
const showDiscovery = computed(() => activePage.value === "Pools");
const walletBusy = computed(
  () => isConnecting.value || isSwitching.value || isClaiming.value,
);
const claimDisabled = computed(
  () =>
    walletBusy.value ||
    isRefreshing.value ||
    !tokenConfigured.value ||
    !correctNetwork.value,
);
const explorerBase = EXPLORER_URL.replace(/\/$/, "");
const transactionUrl = computed(() =>
  transactionHash.value ? `${explorerBase}/tx/${transactionHash.value}` : "",
);
const nativeSymbol = CHAIN_PARAMS.nativeCurrency.symbol;
const dialog = ref(null);
const modalType = ref("");
const selectedPoolId = ref(pools[0].id);
const selectedPool = computed(
  () => pools.find((pool) => pool.id === selectedPoolId.value) || pools[0],
);
const previewStep = ref(1);
const previewAmount = ref("");
const reviewedAmount = ref("");
const amountError = ref("");
const acknowledged = ref(false);
const reviewHeading = ref(null);
const previewInput = ref(null);
let previousFocus = null;
let previousOverflow = "";
// Stable storage and pool IDs preserve previews saved before the Zuno rebrand.
const storageKey = "harbaxis.preview-positions.v1";
const positions = ref([]);
const completedSteps = computed(
  () =>
    Number(exploredPools.value || positions.value.length > 0) +
    Number(positions.value.length > 0) +
    Number(connected.value),
);
const undoPosition = ref(null);
const toast = ref("");
let toastTimer, undoTimer;

function notify(message) {
  clearTimeout(toastTimer);
  toast.value = message;
  toastTimer = setTimeout(() => {
    toast.value = "";
  }, 4800);
}
function readRoute() {
  if (dialog.value?.open) {
    previousFocus = null;
    closeModal();
  }
  const hash = window.location.hash.slice(1).toLowerCase();
  activePage.value =
    hash === "staking"
      ? "Positions"
      : pages.find((page) => page.toLowerCase() === hash) || "Overview";
  if (activePage.value === "Pools") exploredPools.value = true;
  document.title = `${activePage.value} · Zuno`;
}
function goTo(page) {
  previousFocus = null;
  closeModal();
  activePage.value = page;
  if (page === "Pools") exploredPools.value = true;
  window.location.hash = page.toLowerCase();
  window.scrollTo({ top: 0, behavior: "instant" });
  nextTick(() =>
    document.getElementById("main-content")?.focus({ preventScroll: true }),
  );
}
function skipToContent() {
  document.getElementById("main-content")?.focus();
}
function selectRoute(page) {
  goTo(page);
}
function resetFilters() {
  filter.value = "All pools";
  search.value = "";
  sort.value = "featured";
}
async function openModal(type) {
  if (modalType.value || dialog.value?.open) return;
  previousFocus = document.activeElement;
  modalType.value = type;
  previousOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  await nextTick();
  dialog.value?.showModal();
  if (type === "pool") previewInput.value?.focus();
}
function openPool(pool) {
  exploredPools.value = true;
  selectedPoolId.value = pool.id;
  previewStep.value = 1;
  previewAmount.value = "";
  reviewedAmount.value = "";
  amountError.value = "";
  acknowledged.value = false;
  openModal("pool");
}
function closeModal() {
  if (dialog.value?.open) dialog.value.close();
}
function onDialogClose() {
  document.body.style.overflow = previousOverflow;
  modalType.value = "";
  if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
}
function onDialogBackdrop(event) {
  if (event.target !== dialog.value) return;
  const rect = dialog.value.getBoundingClientRect();
  if (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  )
    closeModal();
}
function onDialogKeydown(event) {
  if (event.key !== "Tab" || !dialog.value?.open) return;
  const modal = dialog.value;
  const focusable = [
    ...modal.querySelectorAll(
      "a[href], button, input, select, textarea, summary, [tabindex]",
    ),
  ].filter(
    (element) =>
      element.tabIndex >= 0 &&
      !element.matches(":disabled") &&
      !element.closest("[inert], [hidden]") &&
      element.getClientRects().length > 0 &&
      getComputedStyle(element).visibility !== "hidden",
  );
  if (!focusable.length) {
    event.preventDefault();
    modal.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  // Review headings use tabindex=-1, so Tab should enter the active form cycle.
  if (
    !focusable.includes(active) ||
    (event.shiftKey ? active === first : active === last)
  ) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  }
}
function validAmount(value) {
  return (
    typeof value === "string" &&
    /^(?:\d+(?:\.\d{1,6})?|\.\d{1,6})$/.test(value.trim()) &&
    Number(value) > 0 &&
    Number(value) <= 1000000
  );
}
async function reviewPreview() {
  if (!validAmount(previewAmount.value)) {
    amountError.value =
      "Enter an amount above 0 and up to 1,000,000, with no more than 6 decimal places.";
    previewInput.value?.focus();
    return;
  }
  amountError.value = "";
  reviewedAmount.value = String(Number(previewAmount.value));
  acknowledged.value = false;
  previewStep.value = 2;
  await nextTick();
  reviewHeading.value?.focus();
}
function persistPositions() {
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(positions.value));
    return true;
  } catch {
    notify(
      "Your preview is available here. This browser could not save it for reloads.",
    );
    return false;
  }
}
function loadPositions() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey) || "[]");
    if (!Array.isArray(saved)) return;
    const seen = new Set();
    positions.value = saved
      .filter((position) => {
        if (
          !position ||
          typeof position.id !== "string" ||
          position.id.length > 100 ||
          seen.has(position.id) ||
          !pools.some((pool) => pool.id === position.poolId) ||
          !validAmount(position.amount) ||
          typeof position.createdAt !== "number" ||
          !Number.isFinite(position.createdAt)
        )
          return false;
        seen.add(position.id);
        return true;
      })
      .slice(0, 100)
      .map(({ id, poolId, amount, createdAt }) => ({
        id,
        poolId,
        amount,
        createdAt,
      }));
  } catch {
    positions.value = [];
  }
}
function savePreview() {
  if (!acknowledged.value || !validAmount(reviewedAmount.value)) return;
  acknowledged.value = false;
  positions.value.unshift({
    id:
      globalThis.crypto?.randomUUID?.() ||
      `preview-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    poolId: selectedPool.value.id,
    amount: reviewedAmount.value,
    createdAt: Date.now(),
  });
  positions.value = positions.value.slice(0, 100);
  const persisted = persistPositions();
  goTo("Positions");
  if (persisted)
    notify(
      "Preview saved in this tab. No assets moved and no transaction was sent.",
    );
}
function poolFor(position) {
  return pools.find((pool) => pool.id === position.poolId) || pools[0];
}
function displayAmount(value) {
  return Number(value).toLocaleString("en-US", { maximumFractionDigits: 6 });
}
function removePosition(position) {
  clearTimeout(undoTimer);
  undoPosition.value = {
    position,
    index: positions.value.findIndex((item) => item.id === position.id),
  };
  positions.value = positions.value.filter((item) => item.id !== position.id);
  persistPositions();
  undoTimer = setTimeout(() => {
    undoPosition.value = null;
  }, 8000);
}
function undoRemove() {
  if (!undoPosition.value) return;
  clearTimeout(undoTimer);
  positions.value.splice(
    undoPosition.value.index,
    0,
    undoPosition.value.position,
  );
  undoPosition.value = null;
  persistPositions();
  notify("Preview restored.");
}
function disconnectWallet() {
  disconnect();
  notify("Wallet disconnected from this page.");
}
onMounted(() => {
  readRoute();
  loadPositions();
  window.addEventListener("hashchange", readRoute);
});
onBeforeUnmount(() => {
  window.removeEventListener("hashchange", readRoute);
  clearTimeout(toastTimer);
  clearTimeout(undoTimer);
  if (dialog.value?.open) document.body.style.overflow = previousOverflow;
});

const navIcons = {
  Overview: "grid",
  Pools: "layers",
  Positions: "portfolio",
  Governance: "community",
};
const allocation = ref(50);
const secondaryToken = computed(() => spotlightPool.value.pair.split(" / ")[1]);
const allocationLabel = computed(
  () =>
    `${allocation.value}% ${spotlightPool.value.token}, ${100 - allocation.value}% ${secondaryToken.value}`,
);
function selectModel(index) {
  spotlightIndex.value = index;
  allocation.value = [50, 70, 35][index];
  exploredPools.value = true;
}
function displayDate(value) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
</script>
<template>
  <div class="app-shell">
    <a class="skip-link" href="#main-content" @click.prevent="skipToContent"
      >Skip to content</a
    >
    <header class="app-header">
      <div class="header-inner">
        <a class="wordmark" href="#overview" aria-label="Zuno home" @click.prevent="goTo('Overview')">
          <img src="/zuno-mark.svg" alt="" width="34" height="34" /><span>zuno<span class="wordmark-dot">.</span></span>
        </a>
        <nav class="main-nav" aria-label="Main navigation">
          <a v-for="page in pages" :key="page" :href="`#${page.toLowerCase()}`" :aria-label="page"
            :aria-current="activePage === page ? 'page' : undefined" :class="{ active: activePage === page }" @click.prevent="selectRoute(page)">
            <FlowIcon :name="navIcons[page]" /><span>{{ page }}</span>
            <span v-if="page === 'Positions' && positions.length" class="nav-count">{{ positions.length }}</span>
          </a>
        </nav>
        <div class="header-actions">
          <span class="network-badge"><span class="status-dot"></span> Robinhood Testnet</span>
          <button class="button button-wallet" @click="openModal('wallet')"><FlowIcon name="wallet" />{{ connected ? shortAccount : 'Connect wallet' }}</button>
        </div>
      </div>
    </header>
    <div class="workspace">
      <main id="main-content" tabindex="-1">
        <section v-if="activePage === 'Overview'" class="overview-page" aria-labelledby="hero-title">
          <div class="market-strip">
            <span><i class="status-dot"></i> THE LIQUIDITY PLAYGROUND</span>
            <span class="strip-disclosure">Sample pools. Real curiosity.</span>
            <button class="text-button" @click="openModal('docs')">Getting started <FlowIcon name="arrow" /></button>
          </div>
          <div class="overview-grid">
            <div class="overview-left">
              <section class="hero-card">
                <div class="hero-copy">
                  <span class="hero-label"><span class="status-dot"></span> A LITTLE CURIOSITY. ZERO CAPITAL.</span>
                  <h1 id="hero-title">Find your<br /><em>flow.</em><span class="hero-asterisk" aria-hidden="true">✳</span></h1>
                  <p>Your next DeFi move starts here.<br />Explore pools. Play with the mix.</p>
                  <button class="button button-dark" @click="goTo('Pools')">Explore pools <FlowIcon name="arrow" /></button>
                </div>
                <div class="coin-scene" aria-hidden="true">
                  <div class="orbit orbit-one"></div><div class="orbit orbit-two"></div>
                  <span class="coin-spark spark-one">✦</span><span class="coin-spark spark-two">✦</span>
                  <div class="hero-coin coin-eth"><span>Ξ</span></div>
                  <div class="hero-coin coin-z"><span>z</span></div>
                  <div class="hero-coin coin-dollar"><span>$</span></div>
                  <span class="scene-label">STAY CURIOUS ↗</span>
                </div>
                <div class="hero-bottom"><span><FlowIcon name="shield" /> No wallet needed to explore</span><span>BUILT FOR YOUR NEXT MOVE ↗</span></div>
              </section>
              <div class="overview-stats">
                <div><span>Pool models</span><strong>03<span class="stat-detail">to explore</span></strong></div>
                <div><span>Your previews</span><strong>{{ String(positions.length).padStart(2, '0') }}<span class="stat-detail">this session</span></strong></div>
                <div><span>Capital needed</span><strong>$0<span class="stat-detail">just curiosity</span></strong></div>
              </div>
            </div>
            <section class="model-launcher" aria-label="Select a pool model">
              <div class="panel-heading"><h2>Make your first move</h2><span class="tag tag-green">SIMULATE</span></div>
              <div class="model-options" role="group" aria-label="Pool model">
                <button v-for="(pool, index) in pools" :key="pool.id" :aria-pressed="spotlightIndex === index"
                  :class="['model-option', { selected: spotlightIndex === index }]" @click="selectModel(index)">
                  <span :class="['model-token', pool.color]">{{ pool.symbols[1] }}</span>
                  <span><strong>{{ pool.name }}</strong><small>{{ pool.pair }}</small></span>
                  <span class="selection-dot"><FlowIcon v-if="spotlightIndex === index" name="check" /></span>
                </button>
              </div>
              <div class="mix-box">
                <div class="mix-caption"><span>Explore the mix</span><span>Illustrative allocation</span></div>
                <div class="mix-content">
                  <div class="mix-ring" :style="{ '--mix': `${allocation}%` }" role="img" :aria-label="`Illustrative allocation: ${allocationLabel}`"><span><FlowIcon name="layers" /></span></div>
                  <div class="allocation-controls">
                    <div class="allocation-labels"><label for="allocation-range"><i class="legend-dot green"></i>{{ spotlightPool.token }}<strong>{{ allocation }}%</strong></label>
                      <span><i class="legend-dot violet"></i>{{ secondaryToken }}<strong>{{ 100 - allocation }}%</strong></span></div>
                    <input id="allocation-range" v-model.number="allocation" type="range" min="10" max="90" step="5" :aria-valuetext="allocationLabel" aria-label="Illustrative first asset allocation" :style="{ '--allocation': `${allocation}%` }" />
                    <div class="range-caption"><span>Drag to rebalance</span><button @click="allocation = 50" aria-label="Reset allocation to 50 percent">Reset <FlowIcon name="refresh" /></button></div>
                  </div>
                </div>
              </div>
              <div class="model-sample"><div><span>Sample APY</span><strong>{{ spotlightPool.apy }}<small>%</small></strong></div><div><span>Sample TVL</span><strong><small>$</small>{{ spotlightPool.tvl }}<small>M</small></strong></div></div>
              <button class="button button-primary full-width launch-button" @click="openPool(spotlightPool)">Create preview <FlowIcon name="arrow" /></button>
              <p class="launch-caption">Simulation only. No deposit or real returns.</p>
            </section>
          </div>
          <section class="featured-section" aria-labelledby="featured-title">
            <div class="section-label"><div><h2 id="featured-title">A pool for every perspective<span class="heading-dot">.</span></h2><p>Three ways to explore liquidity. All figures are illustrative.</p></div><button class="text-button" @click="goTo('Pools')">View all pools <FlowIcon name="arrow" /></button></div>
            <div class="featured-table">
              <div class="featured-head" aria-hidden="true"><span>POOL / PAIR</span><span>PROFILE</span><span>SAMPLE APY</span><span>SAMPLE TVL</span><span>EXPLORE</span></div>
              <button v-for="pool in pools" :key="pool.id" class="featured-row" :aria-label="`Preview ${pool.name} pool`" @click="openPool(pool)">
                <span class="featured-identity"><span :class="['token-pair', pool.color]"><span>{{ pool.symbols[0] }}</span><span>{{ pool.symbols[1] }}</span></span><span><strong>{{ pool.name }}</strong><small>{{ pool.pair }}</small></span></span>
                <span class="featured-profile"><span class="tag">{{ pool.profile }}</span></span>
                <span class="featured-apy"><small class="mobile-metric-label">Sample APY</small>{{ pool.apy }}<small>%</small></span>
                <span class="featured-tvl">${{ pool.tvl }}M</span>
                <span class="row-action"><FlowIcon name="arrow" /></span>
              </button>
            </div>
          </section>
          <div class="testnet-banner"><div class="banner-icon"><FlowIcon name="globe" /></div><div><h3>A little more on-chain?</h3><p>Connect to Robinhood Chain Testnet and try the HOOD faucet.</p></div><button class="button button-secondary" @click="openModal('wallet')">Try the testnet <FlowIcon name="arrow" /></button></div>
          <p class="visual-footnote">The mix changes the illustration; previews save your pool and practice amount. PTV is a demo symbol, separate from HOOD test tokens.</p>
        </section>

        <section
          v-if="showDiscovery"
          class="pools-page"
          aria-labelledby="discovery-title"
        >
          <div class="page-heading">
            <div>
              <p class="eyebrow">
                <span class="tiny-rule"></span> EXPLORE / POOLS
              </p>
              <h1 id="discovery-title">Pick your pool.</h1>
              <p>
                Compare the inputs. Explore a pool. Save a practice position.
              </p>
            </div>
            <span class="tag tag-blue">03 MODELS / EXAMPLE DATA</span>
          </div>
          <div class="pool-toolbar">
            <div class="filter-tabs" role="group" aria-label="Filter pools">
              <button
                v-for="item in ['All pools', 'Core', 'Experimental']"
                :key="item"
                :class="{ selected: filter === item }"
                :aria-pressed="filter === item"
                @click="filter = item"
              >
                {{ item
                }}<span>{{
                  item === "All pools" ? "3" : item === "Core" ? "2" : "1"
                }}</span>
              </button>
            </div>
            <label class="search-box"
              ><FlowIcon name="search" /><input
                v-model="search"
                type="search"
                placeholder="Search pools or tokens"
                aria-label="Search pools" /></label
            ><label class="sort-box"
              ><FlowIcon name="sort" /><select
                v-model="sort"
                aria-label="Sort pools"
              >
                <option value="featured">Featured first</option>
                <option value="apy">Sample APY</option>
                <option value="tvl">Sample TVL</option>
              </select></label
            >
          </div>
          <div class="pool-results" role="status" aria-live="polite">
            <span
              >{{ filteredPools.length }}
              {{
                filteredPools.length === 1 ? "model" : "models"
              }}
              available</span
            ><span>LOCAL SIMULATIONS</span>
          </div>
          <div class="pool-grid">
            <article
              v-for="pool in filteredPools"
              :key="pool.id"
              :class="['pool-card', pool.color]"
            >
              <div class="pool-card-top">
                <div class="token-pair">
                  <span>{{ pool.symbols[0] }}</span
                  ><span>{{ pool.symbols[1] }}</span>
                </div>
                <span class="tag">{{ pool.profile }}</span>
              </div>
              <h2>{{ pool.name }}</h2>
              <p class="pool-pair">
                {{ pool.pair }} <span>·</span> {{ pool.model }}
              </p>
              <div class="mini-chart" aria-hidden="true">
                <span
                  v-for="bar in 18"
                  :key="bar"
                  :style="{
                    height: `${23 + ((bar * 13 + pool.apy) % 53) + bar * 1.3}%`,
                  }"
                ></span>
              </div>
              <div class="pool-metrics">
                <div>
                  <span>Sample APY</span
                  ><strong>{{ pool.apy }}<small>%</small></strong>
                </div>
                <div>
                  <span>Sample TVL</span
                  ><strong>${{ pool.tvl }}<small>M</small></strong>
                </div>
              </div>
              <button
                class="button button-secondary full-width"
                :aria-label="`Preview ${pool.name} pool`"
                @click="openPool(pool)"
              >
                Preview model <FlowIcon name="arrow" /></button
              ><span class="pool-card-footnote"
                >Illustrative figures · No deposit required</span
              >
            </article>
          </div>
          <div v-if="!filteredPools.length" class="empty-state">
            <span class="empty-icon"><FlowIcon name="search" /></span>
            <h2>No matching models</h2>
            <p>Try a different token or reset your filters.</p>
            <button class="button button-secondary" @click="resetFilters">
              Reset filters <FlowIcon name="refresh" />
            </button>
          </div>
          <div class="info-strip">
            <FlowIcon name="info" />
            <p>
              APY and TVL are illustrative. PTV is a demo symbol, separate from
              HOOD test tokens. Previews move no assets.
            </p>
            <button class="text-button" @click="openModal('docs')">
              Read the guide <FlowIcon name="arrow" />
            </button>
          </div>
          <section class="testnet-section" aria-label="Testnet connection">
            <div class="testnet-copy">
              <span class="eyebrow">NEXT ENVIRONMENT / OPTIONAL</span>
              <h2>Take a step onto the testnet.</h2>
              <p>
                Read wallet balances and request HOOD test tokens on Robinhood
                Chain Testnet. Your local previews stay separate.
              </p>
              <span class="tag">TEST TOKENS HAVE NO CASH VALUE</span>
            </div>
            <div class="testnet-panel">
              <span class="wallet-panel-icon"><FlowIcon name="wallet" /></span>
              <div>
                <h3>
                  {{ connected ? shortAccount : "Your wallet, when ready." }}
                </h3>
                <p>
                  {{
                    connected
                      ? correctNetwork
                        ? "Connected to Robinhood Chain Testnet"
                        : "Switch networks to access test tokens"
                      : "Connect an EVM wallet to get started."
                  }}
                </p>
                <div v-if="connected" class="testnet-balance">
                  <span>{{ balance ?? "—" }} {{ nativeSymbol }}</span
                  ><span>{{ tokenBalance ?? "—" }} HOOD</span>
                </div>
                <button
                  class="button button-secondary"
                  @click="openModal('wallet')"
                >
                  {{ connected ? "Manage wallet" : "Connect wallet" }}
                  <FlowIcon name="arrow" />
                </button>
              </div>
            </div>
          </section>
        </section>

        <section
          v-if="activePage === 'Positions'"
          class="positions-page"
          aria-labelledby="positions-title"
        >
          <div class="page-heading">
            <div>
              <p class="eyebrow">
                <span class="tiny-rule"></span> YOUR SESSION
              </p>
              <h1 id="positions-title">Your positions.</h1>
              <p>
                A collection of practice positions. Saved in this tab, ready to
                revisit.
              </p>
            </div>
            <button class="button button-primary" @click="goTo('Pools')">
              <FlowIcon name="plus" /> New preview
            </button>
          </div>
          <div class="position-summary">
            <span class="stat-icon purple"><FlowIcon name="portfolio" /></span>
            <div>
              <span>Saved positions</span
              ><strong>{{ String(positions.length).padStart(2, "0") }}</strong>
            </div>
            <span class="tag">LOCAL SESSION</span>
          </div>
          <div v-if="!positions.length" class="empty-state position-empty">
            <div class="empty-stack" aria-hidden="true">
              <div></div>
              <div></div>
              <div><FlowIcon name="plus" /><span>YOUR FIRST PREVIEW</span></div>
            </div>
            <h2>Your first move is waiting.</h2>
            <p>
              Choose a model and try an amount. Your first practice position is
              a few clicks away.
            </p>
            <button class="button button-primary" @click="goTo('Pools')">
              Explore pool models <FlowIcon name="arrow" /></button
            ><span class="empty-caption">No wallet or real assets needed</span>
          </div>
          <div v-else class="positions-ledger">
            <div class="ledger-head" aria-hidden="true">
              <span>MODEL / CREATED</span><span>PRACTICE AMOUNT</span
              ><span>STATUS</span><span>ACTIONS</span>
            </div>
            <article
              v-for="position in positions"
              :key="position.id"
              class="position-entry"
            >
              <div class="entry-identity">
                <span :class="['entry-icon', poolFor(position).color]"
                  ><FlowIcon name="layers"
                /></span>
                <div>
                  <h2>{{ poolFor(position).name }}</h2>
                  <p>
                    {{ poolFor(position).profile }}
                    <span>· {{ displayDate(position.createdAt) }}</span>
                  </p>
                </div>
              </div>
              <div class="position-amount">
                {{ displayAmount(position.amount)
                }}<span>{{ poolFor(position).token }}</span>
              </div>
              <span class="position-status"
                ><i class="status-dot"></i> Preview</span
              >
              <div class="position-actions">
                <button
                  class="square-button"
                  :aria-label="`Create another ${poolFor(position).name} preview`"
                  @click="openPool(poolFor(position))"
                >
                  <FlowIcon name="plus" /></button
                ><button
                  class="square-button remove-button"
                  :aria-label="`Remove ${poolFor(position).name} preview of ${displayAmount(position.amount)} ${poolFor(position).token}`"
                  @click="removePosition(position)"
                >
                  <FlowIcon name="trash" />
                </button>
              </div>
            </article>
          </div>
          <div v-if="undoPosition" class="undo-bar" role="status">
            <span><FlowIcon name="trash" /> Preview removed.</span
            ><button class="text-button" @click="undoRemove">
              Undo removal <FlowIcon name="refresh" />
            </button>
          </div>
          <p class="session-note">
            <FlowIcon name="shield" /> Simulation only: no deposits, fees, or
            accrued returns. Closing this tab ends your saved session.
          </p>
        </section>

        <section
          v-if="activePage === 'Governance'"
          class="governance-page"
          aria-labelledby="governance-title"
        >
          <div class="page-heading">
            <div>
              <p class="eyebrow">
                <span class="tiny-rule"></span> PROJECT DIRECTION
              </p>
              <h1 id="governance-title">Build understanding. Then a voice.</h1>
              <p>
                Community governance is part of the future design of Zuno.
              </p>
            </div>
            <span class="tag tag-purple">IN DEVELOPMENT</span>
          </div>
          <div class="governance-layout">
            <section class="governance-status-panel">
              <div class="governance-glyph" aria-hidden="true">
                <FlowIcon name="community" />
              </div>
              <span class="eyebrow">GOVERNANCE STATUS</span>
              <h2>The foundation<br />comes first.</h2>
              <p>
                Zuno is a playground for learning how liquidity works.
                There are no active proposals or voting contracts in this
                release.
              </p>
              <div class="governance-status">
                <span class="status-dot"></span> Voting is not available yet
              </div>
              <p class="muted-note">
                Test token balances do not grant voting power.
              </p>
            </section>
            <section class="roadmap-panel" aria-labelledby="roadmap-title">
              <div class="panel-heading">
                <div>
                  <span class="eyebrow">CAPABILITY MAP</span>
                  <h2 id="roadmap-title">Where things stand.</h2>
                </div>
              </div>
              <ol class="roadmap-list">
                <li>
                  <span class="roadmap-node"><FlowIcon name="check" /></span>
                  <div>
                    <span class="tag tag-green">AVAILABLE</span>
                    <h3>Explore &amp; simulate</h3>
                    <p>
                      Compare three pool models and save local practice
                      positions. Start without a wallet.
                    </p>
                    <button class="text-button" @click="goTo('Pools')">
                      Open model library <FlowIcon name="arrow" />
                    </button>
                  </div>
                </li>
                <li>
                  <span class="roadmap-node"><FlowIcon name="check" /></span>
                  <div>
                    <span class="tag tag-blue">OPTIONAL</span>
                    <h3>Connect to the testnet</h3>
                    <p>
                      Read wallet balances and access the configured HOOD faucet
                      with a compatible EVM wallet.
                    </p>
                    <button class="text-button" @click="openModal('wallet')">
                      Manage connection <FlowIcon name="arrow" />
                    </button>
                  </div>
                </li>
                <li class="future-step">
                  <span class="roadmap-node"><FlowIcon name="clock" /></span>
                  <div>
                    <span class="tag">IN DEVELOPMENT</span>
                    <h3>Community participation</h3>
                    <p>
                      Proposals, voting mechanics, and participation rules are
                      still being designed. No launch date is announced.
                    </p>
                  </div>
                </li>
              </ol>
            </section>
          </div>
          <div class="info-strip">
            <FlowIcon name="book" />
            <p>
              Get familiar with the current capabilities before taking the next
              step.
            </p>
            <button class="text-button" @click="openModal('docs')">
              Open the guide <FlowIcon name="arrow" />
            </button>
          </div>
        </section>
      </main>
      <footer class="site-footer">
        <div>
          <span class="footer-brand">zuno</span
          ><span>Find your flow.</span>
        </div>
        <div class="footer-links">
          <button @click="openModal('docs')">
            Guide <FlowIcon name="external" /></button
          ><a
            v-if="SOCIAL_URL"
            :href="SOCIAL_URL"
            target="_blank"
            rel="noopener noreferrer"
            >Follow on X <FlowIcon name="external" /></a
          ><span>© 2026</span>
        </div>
        <p>
          Independent project on Robinhood Chain Testnet. No affiliation with
          Robinhood. Test tokens have no cash value.
        </p>
      </footer>
    </div>

    <dialog
      ref="dialog"
      class="app-dialog"
      :class="{ 'guide-dialog': modalType === 'docs' }"
      aria-labelledby="dialog-title"
      @click="onDialogBackdrop"
      @keydown="onDialogKeydown"
      @close="onDialogClose"
    >
      <div class="dialog-inner">
        <button
          class="dialog-close square-button"
          aria-label="Close dialog"
          @click="closeModal"
        >
          <FlowIcon name="close" />
        </button>
        <template v-if="modalType === 'pool'"
          ><div class="dialog-kicker">
            <span class="dialog-icon"><FlowIcon name="layers" /></span
            ><span>LOCAL SIMULATION</span
            ><span class="dialog-step">{{ previewStep }} / 2</span>
          </div>
          <h2 v-if="previewStep === 1" id="dialog-title">
            {{ selectedPool.name }}
          </h2>
          <h2 v-else id="dialog-title" ref="reviewHeading" tabindex="-1">
            Ready to save?
          </h2>
          <p class="dialog-lead">
            {{
              previewStep === 1
                ? "Set a practice amount and explore the details."
                : `${selectedPool.name} · ${selectedPool.model}`
            }}
          </p>
          <div class="step-track" aria-hidden="true">
            <span class="complete">01 <b>Set amount</b></span
            ><i></i
            ><span :class="{ complete: previewStep === 2 }"
              >02 <b>Review & save</b></span
            >
          </div>
          <div class="dialog-notice">
            <FlowIcon name="shield" />
            <p>
              A local preview. No assets move, no transaction is sent, and no
              yield accrues.
            </p>
          </div>
          <form
            v-if="previewStep === 1"
            novalidate
            @submit.prevent="reviewPreview"
          >
            <label class="field-label" for="preview-amount"
              >Practice amount</label
            >
            <div class="amount-input">
              <input
                id="preview-amount"
                ref="previewInput"
                v-model="previewAmount"
                type="text"
                inputmode="decimal"
                autocomplete="off"
                maxlength="30"
                placeholder="0.00"
                :aria-invalid="Boolean(amountError)"
                :aria-describedby="
                  amountError ? 'amount-hint amount-error' : 'amount-hint'
                "
                @input="amountError = ''"
              /><span>{{ selectedPool.token }}</span>
            </div>
            <p id="amount-hint" class="field-hint">
              Up to 1,000,000 {{ selectedPool.token }} · Maximum 6 decimal
              places
            </p>
            <p
              v-if="amountError"
              id="amount-error"
              class="form-error"
              role="alert"
            >
              {{ amountError }}
            </p>
            <div
              class="quick-amounts"
              role="group"
              aria-label="Set practice amount"
            >
              <button
                v-for="amount in ['100', '500', '1000']"
                :key="amount"
                type="button"
                @click="
                  previewAmount = amount;
                  amountError = '';
                "
              >
                {{ Number(amount).toLocaleString() }}
                <span>{{ selectedPool.token }}</span>
              </button>
            </div>
            <div class="review-lines">
              <div>
                <span>Model</span><b>{{ selectedPool.model }}</b>
              </div>
              <div>
                <span>Sample APY</span
                ><b>{{ selectedPool.apy }}% <small>illustrative</small></b>
              </div>
              <div><span>Network fee</span><b>None · local preview</b></div>
            </div>
            <button class="button button-primary full-width" type="submit">
              Review preview <FlowIcon name="arrow" />
            </button>
          </form>
          <template v-else
            ><div class="review-amount">
              <span>PRACTICE AMOUNT</span
              ><strong
                >{{ displayAmount(reviewedAmount) }}
                <small>{{ selectedPool.token }}</small></strong
              >
            </div>
            <div class="review-lines">
              <div>
                <span>Pool</span><b>{{ selectedPool.name }}</b>
              </div>
              <div>
                <span>Sample APY</span
                ><b>{{ selectedPool.apy }}% · not a forecast</b>
              </div>
              <div>
                <span>Saved to</span><b>This tab’s practice positions</b>
              </div>
              <div><span>Network transaction</span><b>None</b></div>
            </div>
            <label class="check-label"
              ><input v-model="acknowledged" type="checkbox" /><span
                >I understand this is a simulation with no real deposit or
                returns.</span
              ></label
            ><button
              class="button button-primary full-width"
              :disabled="!acknowledged"
              @click="savePreview"
            >
              Save preview position <FlowIcon name="check" /></button
            ><button
              class="text-button back-button"
              @click="
                previewStep = 1;
                nextTick(() => previewInput?.focus());
              "
            >
              Back to amount
            </button></template
          >
        </template>
        <template v-if="modalType === 'wallet'"
          ><div class="dialog-kicker">
            <span class="dialog-icon"><FlowIcon name="wallet" /></span
            ><span>TESTNET CONNECTION</span>
          </div>
          <h2 id="dialog-title">Your gateway to testnet.</h2>
          <p class="dialog-lead">
            Connect an EVM wallet to read balances and request HOOD test tokens.
          </p>
          <div class="wallet-status-card">
            <FlowIcon name="wallet" />
            <div>
              <strong>{{
                connected ? shortAccount : "No wallet connected"
              }}</strong
              ><span>{{
                connected
                  ? correctNetwork
                    ? CHAIN_PARAMS.chainName
                    : "Network switch required"
                  : "Your local previews work without a wallet."
              }}</span>
            </div>
            <span v-if="connected" class="status-dot"></span>
          </div>
          <template v-if="connected"
            ><p class="wallet-address">{{ account }}</p>
            <div class="review-lines">
              <div>
                <span>Network balance</span
                ><b>{{ balance ?? "—" }} {{ nativeSymbol }}</b>
              </div>
              <div>
                <span>Test token balance</span
                ><b>{{ tokenBalance ?? "—" }} HOOD</b>
              </div>
            </div>
            <button
              v-if="!correctNetwork"
              class="button button-primary full-width"
              :disabled="walletBusy"
              @click="switchNetwork"
            >
              {{ isSwitching ? "Switching network…" : "Switch to testnet" }}
              <FlowIcon name="arrow" /></button
            ><button
              v-else
              class="button button-primary full-width"
              :disabled="claimDisabled"
              @click="claimFaucet"
            >
              {{
                isClaiming
                  ? "Claim in progress…"
                  : !tokenConfigured
                    ? "Faucet unavailable"
                    : `Claim ${faucetAmount ?? "test"} HOOD`
              }}
              <FlowIcon name="arrow" />
            </button>
            <p v-if="!tokenConfigured" class="field-hint">
              The faucet contract is not configured for this deployment.
            </p>
            <div class="wallet-controls">
              <button
                class="text-button"
                :disabled="walletBusy || isRefreshing"
                @click="refreshBalances"
              >
                <FlowIcon name="refresh" />{{
                  isRefreshing ? "Refreshing…" : "Refresh balances"
                }}</button
              ><button
                class="text-button"
                :disabled="walletBusy"
                @click="disconnectWallet"
              >
                Disconnect
              </button>
            </div></template
          ><button
            v-else
            class="button button-primary full-width"
            :disabled="walletBusy"
            @click="connectWallet"
          >
            {{ isConnecting ? "Waiting for wallet…" : "Connect EVM wallet" }}
            <FlowIcon name="arrow" />
          </button>
          <p v-if="walletError" class="inline-message light-error" role="alert">
            {{ walletError }}
          </p>
          <p
            v-if="claimMessage"
            class="inline-message"
            :class="claimStatus === 'error' ? 'light-error' : 'light-message'"
            role="status"
          >
            {{ claimMessage }}
          </p>
          <a
            v-if="transactionUrl"
            class="transaction-link"
            :href="transactionUrl"
            target="_blank"
            rel="noopener noreferrer"
            >View transaction <FlowIcon name="external"
          /></a>
          <p class="wallet-footnote">
            Connecting does not send a transaction. A HOOD claim requires a
            separate wallet confirmation and a network fee. Faucet availability
            and cooldown are read from the contract.
          </p></template
        >
        <template v-if="modalType === 'docs'"
          ><div class="dialog-kicker">
            <span class="dialog-icon"><FlowIcon name="book" /></span
            ><span>ZUNO / QUICK START</span>
          </div>
          <h2 id="dialog-title">From first look to first preview.</h2>
          <p class="dialog-lead">
            Everything you need to navigate the workspace.
          </p>
          <div class="guide-step">
            <span>01</span>
            <div>
              <h3>Choose a model</h3>
              <p>
                Explore three example pool models. Filter by profile, search by
                token, or compare sample APY and TVL. All figures are
                illustrative, not live markets or expected returns.
              </p>
            </div>
          </div>
          <div class="guide-step">
            <span>02</span>
            <div>
              <h3>Save a practice position</h3>
              <p>
                Enter an amount, review the details, then save. Previews stay in
                this tab’s session and can be removed or restored. No wallet or
                transaction is required.
              </p>
            </div>
          </div>
          <div class="guide-step">
            <span>03</span>
            <div>
              <h3>Explore the testnet</h3>
              <p>
                Connect an EVM wallet to {{ CHAIN_PARAMS.chainName }} (chain ID
                {{ CHAIN_ID }}). When the HOOD contract is configured, request
                faucet tokens and follow the transaction in the explorer.
              </p>
            </div>
          </div>
          <div class="guide-contract">
            <span class="eyebrow">HOOD TEST TOKEN CONTRACT</span
            ><a
              v-if="tokenConfigured"
              :href="`${explorerBase}/address/${CONTRACT_ADDRESS}`"
              target="_blank"
              rel="noopener noreferrer"
              >{{ CONTRACT_ADDRESS }} <FlowIcon name="external"
            /></a>
            <p v-else>Not configured for this deployment</p>
          </div>
          <div class="guide-details">
            <details>
              <summary>How do the tokens differ?</summary>
              <p>
                HOOD is the Robinhood Commons testnet utility token used by the
                faucet. PTV is a legacy demo symbol in sample pools; it is not a
                Zuno token. {{ nativeSymbol }} is the configured network
                currency. Test tokens have no cash value.
              </p>
            </details>
            <details>
              <summary>What can I do in this release?</summary>
              <p>
                Explore pools and save local previews. Wallet balances and
                faucet claims require a configured deployment and a compatible
                wallet. Live liquidity deposits, staking, swaps, and governance
                voting are not implemented.
              </p>
            </details>
            <details>
              <summary>Why can’t I claim more HOOD?</summary>
              <p>
                The faucet contract controls its amount, cooldown, supply cap,
                and paused state. The default is 100 HOOD with a one-day
                cooldown. Current availability is checked before you are asked
                to confirm a claim.
              </p>
            </details>
          </div>
          <button
            class="button button-primary full-width"
            @click="goTo('Pools')"
          >
            Explore pool models <FlowIcon name="arrow" /></button
        ></template>
      </div>
    </dialog>
    <div v-if="toast" class="toast" role="status" aria-live="polite">
      <FlowIcon name="check" /><span>{{ toast }}</span
      ><button
        class="square-button"
        aria-label="Dismiss notification"
        @click="toast = ''"
      >
        <FlowIcon name="close" />
      </button>
    </div>
  </div>
</template>
