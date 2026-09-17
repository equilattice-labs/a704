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
    name: "Fluxenote / Robin",
    pair: "PTV / RBH",
    token: "PTV",
    profile: "Core",
    apy: 42.8,
    tvl: 18.4,
    color: "lime",
    symbols: ["f", "R"],
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
    name: "Fluxenote / ETH",
    pair: "PTV / ETH",
    token: "PTV",
    profile: "Experimental",
    apy: 67.1,
    tvl: 6.8,
    color: "purple",
    symbols: ["f", "Ξ"],
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
const showDiscovery = computed(
  () => activePage.value === "Pools",
);
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
// Stable storage and pool IDs preserve previews saved before the Fluxenote rebrand.
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
  document.title = `${activePage.value} · Fluxenote`;
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
</script>

<template>
  <div class="app-shell">
    <a class="skip-link" href="#main-content" @click.prevent="skipToContent">Skip to content</a>
    <header class="site-header page-width">
      <a class="wordmark" href="#overview" aria-label="Fluxenote home" @click.prevent="goTo('Overview')">
        <img src="/fluxenote-mark.svg" width="38" height="38" alt="" />
        <span>fluxenote</span>
      </a>
      <nav class="main-nav" aria-label="Main navigation">
        <a v-for="page in pages" :key="page" :href="`#${page.toLowerCase()}`" :aria-current="activePage === page ? 'page' : undefined" :class="{ active: activePage === page }" @click.prevent="selectRoute(page)">{{ page }}<span v-if="page === 'Positions' && positions.length" class="nav-count">{{ positions.length }}</span></a>
      </nav>
      <button class="button button-outline connect-button" @click="openModal('wallet')"><span class="connection-dot" :class="{ connected }"></span>{{ connected ? shortAccount : 'Connect wallet' }}<FlowIcon name="arrow" /></button>
    </header>

    <main id="main-content" tabindex="-1">
      <section v-if="activePage === 'Overview'" class="overview-page page-width" aria-labelledby="hero-title">
        <div class="edition-line"><span>A LITTLE CURIOSITY GOES A LONG WAY</span><span><i class="small-dot"></i> AN INDEPENDENT TESTNET STUDIO</span></div>
        <div class="hero-layout">
          <div class="hero-copy">
            <h1 id="hero-title">Room to try. <br />Space to <br /><em>understand.</em></h1>
            <p>Get a feel for liquidity. Explore a pool, try an amount, and turn a little curiosity into a clearer picture.</p>
            <div class="hero-actions"><button class="button button-primary" @click="openPool(spotlightPool)">Try a pool model <FlowIcon name="arrow" /></button><button class="text-button" @click="openModal('docs')">Read the field guide <FlowIcon name="book" /></button></div>
            <span class="hero-footnote"><FlowIcon name="shield" /> A local simulation. Begin without a wallet.</span>
          </div>
          <section class="pool-observatory" aria-label="Interactive model preview">
            <div class="observatory-top"><span>IN THE POOL</span><span>FIG. 0{{ spotlightIndex + 1 }} / 03</span></div>
            <div class="pool-art" :class="`art-${spotlightIndex}`" aria-hidden="true">
              <svg class="contour-art" viewBox="0 0 560 490" fill="none">
                <defs><pattern id="paper-lines" width="7" height="7" patternUnits="userSpaceOnUse"><path d="M0 7L7 0" stroke="currentColor" stroke-width=".6" opacity=".12"/></pattern></defs>
                <path d="M50 372H519M89 426H485" stroke="currentColor" opacity=".2"/>
                <circle cx="280" cy="235" r="188" fill="url(#paper-lines)" stroke="currentColor" stroke-width="1" opacity=".38"/>
                <path class="contour-fill" d="M100 253C62 151 144 59 251 62C351 65 334 137 420 164C531 199 489 340 410 370C330 400 309 447 214 405C133 369 132 338 100 253Z"/>
                <g class="contour-lines" stroke="currentColor" stroke-width="1.25">
                  <path d="M100 253C62 151 144 59 251 62C351 65 334 137 420 164C531 199 489 340 410 370C330 400 309 447 214 405C133 369 132 338 100 253Z"/>
                  <path d="M116 251C81 160 151 77 248 80C339 83 326 151 405 179C504 214 465 328 399 352C321 381 306 425 223 387C149 354 146 328 116 251Z"/>
                  <path d="M133 248C102 170 160 96 246 98C326 101 319 167 389 195C477 229 442 316 387 336C312 363 302 403 231 369C166 339 162 318 133 248Z"/>
                  <path d="M150 246C122 180 169 115 243 117C314 119 311 183 374 210C449 243 419 304 375 319C302 345 299 381 240 351C183 323 177 307 150 246Z"/>
                  <path d="M167 244C143 190 178 134 241 136C301 138 304 199 358 226C421 256 396 292 363 303C293 327 296 359 248 333C201 308 193 297 167 244Z"/>
                  <path d="M185 241C164 199 187 153 238 154C289 156 296 215 342 241C392 269 373 280 351 287C284 309 292 337 257 315C217 292 208 287 185 241Z"/>
                  <path d="M203 238C184 209 197 173 237 174C276 175 289 230 326 256C362 281 350 267 340 271C275 292 289 314 265 296C236 277 226 276 203 238Z"/>
                </g>
                <ellipse cx="266" cy="237" rx="43" ry="63" transform="rotate(-29 266 237)" class="pool-core"/>
                <circle cx="421" cy="126" r="38" class="sun-disc"/>
                <path d="M421 78V64M421 188V174M469 126H483M359 126H373" stroke="currentColor" opacity=".45"/>
                <circle cx="153" cy="349" r="6" fill="currentColor"/>
                <path d="M153 349L91 399H45" stroke="currentColor" stroke-width="1"/>
                <path d="M352 257L450 290H518" stroke="currentColor" stroke-width="1"/>
                <text x="46" y="416" font-size="10" fill="currentColor" letter-spacing="2">{{ spotlightPool.symbols[0] }} / ASSET 01</text>
                <text x="457" y="309" font-size="10" fill="currentColor" letter-spacing="1">ASSET 02</text>
              </svg>
              <span class="art-caption">A STUDY IN BALANCE</span>
            </div>
            <div class="model-tabs" role="group" aria-label="Featured pool model"><button v-for="(pool, index) in pools" :key="pool.id" :aria-label="`Show ${pool.name} model`" :aria-pressed="spotlightIndex === index" @click="spotlightIndex = index"><span>0{{ index + 1 }}</span>{{ pool.model.replace(' liquidity', '') }}</button></div>
            <div class="observatory-details"><div class="model-description"><span class="eyebrow">{{ spotlightPool.profile }} MODEL</span><h2>{{ spotlightPool.name }}</h2><span>{{ spotlightPool.pair }}</span></div><div class="model-metric"><span>Sample APY</span><strong>{{ spotlightPool.apy }}<small>%</small></strong></div><div class="model-metric"><span>Sample TVL</span><strong>${{ spotlightPool.tvl }}<small>M</small></strong></div></div>
            <p class="model-disclaimer">Illustrative figures. No deposits, transactions, or real returns.</p>
          </section>
        </div>
        <div class="studio-facts" role="group" aria-label="Studio summary"><span><b>03</b> Models to explore</span><button @click="goTo('Positions')"><b>{{ String(positions.length).padStart(2, '0') }}</b> Previews in your notebook <FlowIcon name="arrow" /></button><span><i class="small-dot"></i> Local simulation / no wallet required</span></div>
        <section class="learning-path" aria-labelledby="path-title">
          <div class="path-heading"><div><span class="eyebrow">SMALL STEPS. MORE UNDERSTANDING.</span><h2 id="path-title">Find your own flow.</h2></div><span>{{ completedSteps }} / 3 steps explored</span></div>
          <div class="journey-progress" role="progressbar" :aria-valuenow="completedSteps" :aria-valuemin="0" :aria-valuemax="3" aria-label="Practice path progress"><span :style="{ width: `${completedSteps / 3 * 100}%` }"></span></div>
          <div class="journey-steps">
            <button class="journey-step" @click="goTo('Pools')"><span class="step-number" :class="{ done: exploredPools || positions.length }">{{ exploredPools || positions.length ? '✓' : '01' }}</span><div><h3>Look a little closer.</h3><p>Compare three example pairs, two profiles, and their illustrative APY and TVL.</p><strong>Explore the models <FlowIcon name="arrow" /></strong></div></button>
            <button class="journey-step" @click="positions.length ? goTo('Positions') : openPool(pools[0])"><span class="step-number" :class="{ done: positions.length }">{{ positions.length ? '✓' : '02' }}</span><div><h3>Give an idea some space.</h3><p>Try an amount and save a practice position. Review, remove, or restore it in this tab.</p><strong>{{ positions.length ? 'Open your notebook' : 'Save your first preview' }} <FlowIcon name="arrow" /></strong></div></button>
            <button class="journey-step" @click="openModal('wallet')"><span class="step-number" :class="{ done: connected }">{{ connected ? '✓' : '03' }}</span><div><h3>Go a step further.</h3><p>When you’re ready, connect an EVM wallet to explore balances and the HOOD testnet faucet.</p><strong>{{ connected ? 'Manage your wallet' : 'Explore the testnet' }} <FlowIcon name="arrow" /></strong></div></button>
          </div>
        </section>
      </section>

      <section v-if="showDiscovery" class="pools-page page-width" aria-labelledby="discovery-title">
        <div class="section-heading"><div><span class="eyebrow">THE MODEL COLLECTION / 03</span><h1 id="discovery-title">A few ways <br /><em>to find your balance.</em></h1><p>Start with a comparison. Three liquidity models, two different profiles, and room to explore. All figures are illustrative.</p></div><span class="data-badge"><i class="small-dot"></i> EXAMPLE DATA</span></div>
        <div class="pool-toolbar"><div class="filter-tabs" role="group" aria-label="Filter pools"><button v-for="item in ['All pools', 'Core', 'Experimental']" :key="item" :class="{ selected: filter === item }" :aria-pressed="filter === item" :aria-label="item" @click="filter = item">{{ item }}<span v-if="item === 'All pools'">03</span></button></div><label class="search-box"><FlowIcon name="search" /><input v-model="search" type="search" placeholder="Find a pool or token" aria-label="Search pools" /></label><label class="sort-box"><span class="sr-only">Sort pools</span><select v-model="sort" aria-label="Sort pools"><option value="featured">Featured first</option><option value="apy">Sample APY</option><option value="tvl">Sample TVL</option></select></label></div>
        <div class="pool-results" role="status" aria-live="polite"><span>{{ filteredPools.length }} {{ filteredPools.length === 1 ? 'model' : 'models' }} to explore</span><span>LOCAL SIMULATION / NO DEPOSIT</span></div>
        <div class="pool-table"><div class="pool-table-head" aria-hidden="true"><span>POOL &amp; LIQUIDITY MODEL</span><span>PROFILE</span><span>SAMPLE APY</span><span>SAMPLE TVL</span><span>MAKE IT YOURS</span></div><article v-for="(pool, index) in filteredPools" :key="pool.id" class="pool-row" :class="pool.color"><div class="pool-identity"><span class="pool-index">0{{ pools.indexOf(pool) + 1 }}</span><div><h2>{{ pool.name }}</h2><p>{{ pool.pair }} <span>· {{ pool.model }}</span></p></div></div><span class="tag pool-profile">{{ pool.profile }}</span><div class="pool-number"><span class="mobile-label">Sample APY</span><strong>{{ pool.apy }}<small>%</small></strong><span class="metric-caption">Illustrative</span></div><div class="pool-number"><span class="mobile-label">Sample TVL</span><strong>${{ pool.tvl }}<small>M</small></strong><span class="metric-caption">Illustrative</span></div><button class="pool-preview-button" :aria-label="`Preview ${pool.name} pool`" @click="openPool(pool)">Try model <FlowIcon name="arrow" /></button></article></div>
        <div v-if="!filteredPools.length" class="empty-state" role="status"><FlowIcon name="search" /><h2>No models in view.</h2><p>Try another name or token, or clear your filters to start again.</p><button class="button button-outline" @click="resetFilters">Reset filters <FlowIcon name="refresh" /></button></div>
        <div class="pool-disclosure"><FlowIcon name="shield" /><p>APY and TVL are sample figures, not live returns. PTV is a demo symbol, separate from HOOD test tokens. Previews move no assets.</p><button class="text-button" @click="openModal('docs')">Read the guide <FlowIcon name="arrow" /></button></div>
                  <section
            v-if="activePage === 'Pools'"
            class="testnet-section"
            aria-label="Testnet connection"
          >
            <div class="testnet-copy">
              <span class="eyebrow">TESTNET / OPTIONAL</span>
              <h2>Ready for the <br />next environment?</h2>
              <p>
                Use your EVM wallet to explore HOOD test tokens on Robinhood
                Chain Testnet. Your practice positions stay separate.
              </p>
              <span class="tag">TEST TOKENS HAVE NO CASH VALUE</span>
            </div>
            <aside class="testnet-panel" aria-label="Your testnet wallet">
              <div class="panel-top">
                <span class="eyebrow">YOUR WALLET</span
                ><FlowIcon name="wallet" />
              </div>
              <template v-if="!connected"
                ><h3>Ready to connect?</h3>
                <p>
                  Connect to read balances and access the configured HOOD
                  faucet.
                </p>
                <button
                  class="button button-primary full-width"
                  :disabled="walletBusy"
                  @click="connectWallet"
                >
                  {{ isConnecting ? "Connecting…" : "Connect wallet" }}
                  <FlowIcon name="arrow" /></button></template
              ><template v-else
                ><div class="connection-state">
                  <span class="small-dot"></span
                  >{{
                    correctNetwork
                      ? "Connected to testnet"
                      : "Network switch needed"
                  }}
                </div>
                <h3>{{ shortAccount }}</h3>
                <div class="balance-line">
                  <span>Network balance</span
                  ><b>{{ balance ?? "—" }} {{ nativeSymbol }}</b>
                </div>
                <div class="balance-line">
                  <span>Test token balance</span
                  ><b>{{ tokenBalance ?? "—" }} HOOD</b>
                </div>
                <button
                  v-if="!correctNetwork"
                  class="button button-primary full-width"
                  :disabled="walletBusy"
                  @click="switchNetwork"
                >
                  {{ isSwitching ? "Switching…" : "Switch to testnet" }}</button
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
                </button>
                <p v-if="!tokenConfigured" class="field-hint">
                  The faucet contract has not been configured for this
                  deployment.
                </p>
                <button
                  class="text-button full-width"
                  @click="openModal('wallet')"
                >
                  Manage wallet <FlowIcon name="external" /></button
              ></template>
              <p
                v-if="walletError"
                class="inline-message light-error"
                role="alert"
              >
                {{ walletError }}
              </p>
              <p
                v-if="claimMessage"
                class="inline-message"
                :class="
                  claimStatus === 'error' ? 'light-error' : 'light-message'
                "
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
            </aside>
          </section>
      </section>

      <section v-if="activePage === 'Positions'" class="interior-page page-width" aria-labelledby="positions-title">
        <div class="section-heading"><div><span class="eyebrow">YOUR NOTEBOOK / THIS SESSION</span><h1 id="positions-title">Ideas worth <br /><em>coming back to.</em></h1><p>Your practice positions, all in one place. Saved in this browser tab for this session; no assets are held.</p></div><button class="button button-primary" @click="goTo('Pools')">New preview <FlowIcon name="plus" /></button></div>
        <div v-if="!positions.length" class="positions-empty"><div class="notebook-art" aria-hidden="true"><span>FIELD NOTES</span><div></div><div></div><div></div><div></div><b>01</b></div><div><span class="eyebrow">A FRESH PAGE</span><h2>Every idea starts <br />with a little <em>practice.</em></h2><p>Pick a pool, try a practice amount, and save a preview. Your notebook will be here when you want to reflect. No wallet required.</p><button class="button button-primary" @click="goTo('Pools')">Find a pool <FlowIcon name="arrow" /></button></div></div>
        <div v-else class="notebook-list"><article v-for="(position, index) in positions" :key="position.id" class="position-entry"><span class="entry-number">{{ String(index + 1).padStart(2, '0') }}</span><div class="entry-description"><span class="eyebrow">{{ poolFor(position).profile }} / LOCAL PREVIEW</span><h2>{{ poolFor(position).name }}</h2><p>Simulation only. No onchain deposit, assets, fees, or accrued returns.</p></div><div class="position-amount">{{ displayAmount(position.amount) }}<small>{{ poolFor(position).token }}</small></div><div class="position-card-actions"><button class="text-button" @click="openPool(poolFor(position))">Create another <FlowIcon name="plus" /></button><button class="remove-button" :aria-label="`Remove ${poolFor(position).name} preview of ${displayAmount(position.amount)} ${poolFor(position).token}`" @click="removePosition(position)">Remove</button></div></article></div>
        <div v-if="undoPosition" class="undo-bar" role="status"><span>Preview removed.</span><button class="text-button" @click="undoRemove">Undo removal <FlowIcon name="refresh" /></button></div>
        <p class="notebook-footnote"><FlowIcon name="book" /> Your previews stay in this tab’s session. Closing the tab ends the session.</p>
      </section>

      <section v-if="activePage === 'Governance'" class="interior-page page-width" aria-labelledby="governance-title">
        <div class="section-heading"><div><span class="eyebrow">A NOTE ON WHAT COMES NEXT</span><h1 id="governance-title">A shared future. <br /><em>Still taking shape.</em></h1><p>Fluxenote is an early testnet studio. Community governance is part of the future design, with space to learn along the way.</p></div><span class="tag">In development</span></div>
        <div class="governance-layout"><div class="governance-letter"><span class="letter-mark" aria-hidden="true">*</span><h2>Understanding comes <br />before participation.</h2><p>Good decisions begin with familiarity. For now, this is a place to explore liquidity models and build your understanding, one practice position at a time.</p><button class="text-button" @click="openModal('docs')">What’s available today <FlowIcon name="arrow" /></button></div><ol class="roadmap-list"><li><span>01</span><div><span class="eyebrow">AVAILABLE TODAY</span><h3>A place to practice.</h3><p>Explore three pool models, compare sample figures, and keep local previews in your notebook.</p></div></li><li><span>02</span><div><span class="eyebrow">AN OPTIONAL NEXT STEP</span><h3>A connection to the testnet.</h3><p>Connect a compatible wallet for balances and configured faucet claims. Test tokens have no cash value.</p></div></li><li class="future-step"><span>03</span><div><span class="eyebrow">IN DEVELOPMENT</span><h3>A voice in what’s next.</h3><p>There are no active proposals or voting contracts in this release. Test token balances do not grant voting power.</p><span class="governance-status"><i class="small-dot"></i> Voting is not available yet</span></div></li></ol></div>
        <div class="governance-invitation"><h2>For now, follow your curiosity.</h2><button class="button button-primary" @click="goTo('Pools')">Explore pool models <FlowIcon name="arrow" /></button></div>
      </section>
    </main>

    <footer class="site-footer page-width"><div class="footer-top"><a href="#overview" class="footer-brand" @click.prevent="goTo('Overview')">fluxenote<span>Make room for understanding.</span></a><div class="footer-links"><button @click="openModal('docs')">Field guide <FlowIcon name="arrow" /></button><a :href="EXPLORER_URL" target="_blank" rel="noopener noreferrer">Explorer <FlowIcon name="external" /></a><a v-if="SOCIAL_URL" :href="SOCIAL_URL" target="_blank" rel="noopener noreferrer">Follow on X <FlowIcon name="external" /></a></div></div><div class="footer-bottom"><p>An independent project on Robinhood Chain Testnet. No affiliation with Robinhood. Test tokens have no cash value.</p><span>© 2026 Fluxenote</span></div></footer>
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
            ><div class="eyebrow">
              A PRACTICE POSITION /
              {{ previewStep === 1 ? "01 SET AMOUNT" : "02 REVIEW PREVIEW" }}
            </div>
            <h2 v-if="previewStep === 1" id="dialog-title">
              {{ selectedPool.name }}
            </h2>
            <h2
              v-else
              id="dialog-title"
              ref="reviewHeading"
              class="review-heading"
              tabindex="-1"
            >
              Review your practice position.
            </h2>
            <p class="dialog-lead">
              {{
                previewStep === 1
                  ? "Build a practice position and get a feel for the flow."
                  : `${selectedPool.name} · ${selectedPool.model}`
              }}
            </p>
            <span class="tag">SIMULATION</span>
            <div class="dialog-notice">
              <FlowIcon name="shield" />
              <p>
                This is a local preview. No transaction will be sent, no assets
                will move, and no yield will accrue.
              </p>
            </div>
            <form
              v-if="previewStep === 1"
              novalidate
              @submit.prevent="reviewPreview"
            >
              <label class="field-label" for="preview-amount"
                >Amount to preview</label
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
                places{{
                  selectedPool.token === "PTV"
                    ? " · PTV is a legacy demo symbol"
                    : ""
                }}
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
                </button>
              </div>
              <div class="review-lines">
                <div>
                  <span>Sample APY</span
                  ><b>{{ selectedPool.apy }}% <small>illustrative</small></b>
                </div>
                <div>
                  <span>Model</span><b>{{ selectedPool.model }}</b>
                </div>
                <div><span>Network fee</span><b>None · local preview</b></div>
              </div>
              <button class="button button-primary full-width" type="submit">
                Review preview <FlowIcon name="arrow" />
              </button>
            </form>
            <template v-else
              ><div class="review-amount">
                {{ displayAmount(reviewedAmount) }}
                <span>{{ selectedPool.token }}</span>
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
                class="text-button dark-text back-button"
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
            ><div class="eyebrow">YOUR TESTNET CONNECTION</div>
            <h2 id="dialog-title">A window to the testnet.</h2>
            <p class="dialog-lead">
              Connect an EVM wallet to read your balances and request test
              tokens.
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
                      : "Switch to Robinhood Chain Testnet"
                    : "Connect when you’re ready."
                }}</span>
              </div>
              <span v-if="connected" class="small-dot"></span>
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
                  class="text-button dark-text"
                  :disabled="walletBusy || isRefreshing"
                  @click="refreshBalances"
                >
                  <FlowIcon name="refresh" />{{
                    isRefreshing ? "Refreshing…" : "Refresh balances"
                  }}</button
                ><button
                  class="text-button dark-text"
                  :disabled="walletBusy"
                  @click="disconnectWallet"
                >
                  Disconnect
                </button>
              </div></template
            >
            <button
              v-else
              class="button button-primary full-width"
              :disabled="walletBusy"
              @click="connectWallet"
            >
              {{ isConnecting ? "Waiting for wallet…" : "Connect EVM wallet" }}
              <FlowIcon name="arrow" />
            </button>
            <p
              v-if="walletError"
              class="inline-message light-error"
              role="alert"
            >
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
              separate wallet confirmation and a network fee. Faucet
              availability and cooldown are read from the contract.
            </p>
          </template>
          <template v-if="modalType === 'docs'"
            ><div class="eyebrow">THE FLUXENOTE FIELD GUIDE</div>
            <h2 id="dialog-title">A field guide to finding your feet.</h2>
            <p class="dialog-lead">
              Understand the models, save a preview, and explore the testnet when ready.
            </p>
            <div class="guide-step">
              <span>01</span>
              <div>
                <h3>Explore a pool model.</h3>
                <p>
                  Filter the three sample pool models by category, search by
                  token, or compare illustrative APY and TVL. These figures are
                  examples, not live markets or expected returns.
                </p>
              </div>
            </div>
            <div class="guide-step">
              <span>02</span>
              <div>
                <h3>Make a practice position.</h3>
                <p>
                  Enter an amount, review the details, and save a local preview.
                  Previews stay in this tab’s session and can be removed or
                  restored. No wallet, deposit, or transaction is required.
                </p>
              </div>
            </div>
            <div class="guide-step">
              <span>03</span>
              <div>
                <h3>Try the testnet when ready.</h3>
                <p>
                  Connect an EVM wallet and switch to
                  {{ CHAIN_PARAMS.chainName }} (chain ID {{ CHAIN_ID }}). If the
                  HOOD contract is configured, you can request faucet tokens and
                  follow the transaction in the explorer.
                </p>
              </div>
            </div>
            <div class="guide-contract">
              <p class="eyebrow">HOOD TEST TOKEN CONTRACT</p>
              <a
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
                  HOOD is the Robinhood Commons testnet utility token used by
                  the faucet. PTV is a legacy demo symbol shown only in sample
                  pool models. It is not a Fluxenote token. {{ nativeSymbol }} is
                  the configured network currency. Test tokens have no cash
                  value.
                </p>
              </details>
              <details>
                <summary>What is available in this release?</summary>
                <p>
                  Pool exploration and saved local previews are available.
                  Wallet balances and faucet claims require a configured
                  deployment and a compatible wallet. Live liquidity deposits,
                  staking, swaps, and governance voting are not implemented.
                </p>
              </details>
              <details>
                <summary>Why can’t I claim more HOOD?</summary>
                <p>
                  The faucet contract controls its amount, cooldown, supply cap,
                  and paused state. The default is 100 HOOD with a one-day
                  cooldown. The page checks current availability before asking
                  you to confirm a claim.
                </p>
              </details>
            </div>
            <button
              class="button button-primary full-width"
              @click="goTo('Pools')"
            >
              Explore pools <FlowIcon name="arrow" />
            </button>
          </template>
        </div>
      </dialog>
    <div v-if="toast" class="toast" role="status" aria-live="polite"><FlowIcon name="check" /><span>{{ toast }}</span><button aria-label="Dismiss notification" @click="toast = ''"><FlowIcon name="close" /></button></div>
  </div>
</template>
