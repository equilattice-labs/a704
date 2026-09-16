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
const pageIcons = {
  Overview: "grid",
  Pools: "layers",
  Positions: "portfolio",
  Governance: "community",
};
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
    name: "Prelivo / Robin",
    pair: "PTV / RBH",
    token: "PTV",
    profile: "Core",
    apy: 42.8,
    tvl: 18.4,
    color: "lime",
    symbols: ["p", "R"],
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
    name: "Prelivo / ETH",
    pair: "PTV / ETH",
    token: "PTV",
    profile: "Experimental",
    apy: 67.1,
    tvl: 6.8,
    color: "purple",
    symbols: ["p", "Ξ"],
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
  () => activePage.value === "Overview" || activePage.value === "Pools",
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
// Stable storage and pool IDs preserve previews saved before the Prelivo rebrand.
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
  document.title = `${activePage.value} · Prelivo`;
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
    <a class="skip-link" href="#main-content" @click.prevent="skipToContent"
      >Skip to content</a
    >
    <div class="workspace-shell">
      <header class="workspace-header">
        <a
          class="wordmark"
          href="#overview"
          aria-label="Prelivo home"
          @click.prevent="goTo('Overview')"
        >
          <img src="/prelivo-mark.svg" width="36" height="36" alt="" /><span
            >prelivo</span
          ><small>LAB</small>
        </a>
        <nav class="main-nav" aria-label="Main navigation">
          <a
            v-for="page in pages"
            :key="page"
            :href="`#${page.toLowerCase()}`"
            :class="{ active: activePage === page }"
            :aria-current="activePage === page ? 'page' : undefined"
            @click.prevent="selectRoute(page)"
          >
            <FlowIcon :name="pageIcons[page]" /><span>{{ page }}</span
            ><span
              v-if="page === 'Positions' && positions.length"
              class="nav-count"
              >{{ positions.length }}</span
            >
          </a>
        </nav>
        <div class="header-actions">
          <span class="network-label"><i></i> Testnet</span>
          <button
            class="button button-primary connect-button"
            @click="openModal('wallet')"
          >
            <FlowIcon name="wallet" />{{
              connected ? shortAccount : "Connect wallet"
            }}
          </button>
        </div>
      </header>
      <main id="main-content" tabindex="-1">
        <template v-if="activePage === 'Overview'">
          <section class="hero page-width" aria-labelledby="hero-title">
            <div class="hero-copy">
              <div class="eyebrow">
                <span class="small-dot"></span> THE LIQUIDITY PRACTICE LAB
              </div>
              <h1 id="hero-title">Your next move.<br /><em>Rehearsed.</em></h1>
              <p>
                A little curiosity goes a long way. Explore liquidity models and
                build a practice position before you connect a wallet.
              </p>
              <div class="hero-actions">
                <button class="button button-primary" @click="goTo('Pools')">
                  Explore pool models <FlowIcon name="arrow" /></button
                ><button class="text-button" @click="openModal('docs')">
                  Take a quick tour <FlowIcon name="external" />
                </button>
              </div>
              <div class="hero-footnote">
                <FlowIcon name="shield" /> No wallet needed. No assets moved.
              </div>
            </div>
            <div class="model-stage" role="group" aria-label="Interactive model preview">
              <div class="stage-top">
                <span>THE REHEARSAL ROOM</span><span><i></i> SIMULATION</span>
              </div>
              <div class="stage-grid" aria-hidden="true">
                <span class="orbit orbit-one"></span
                ><span class="orbit orbit-two"></span
                ><span class="crosshair">+</span>
              </div>
              <div class="model-window">
                <div class="model-window-top">
                  <span class="model-number"
                    >0{{ spotlightIndex + 1 }} / 03</span
                  ><FlowIcon name="layers" />
                </div>
                <div class="stage-pair" aria-hidden="true">
                  <span>{{ spotlightPool.symbols[0] }}</span
                  ><span class="pair-connector">↔</span
                  ><span>{{ spotlightPool.symbols[1] }}</span>
                </div>
                <h2>{{ spotlightPool.name }}</h2>
                <p>{{ spotlightPool.model }}</p>
                <div class="model-meta">
                  <span>{{ spotlightPool.pair }}</span
                  ><span>{{ spotlightPool.profile }}</span>
                </div>
                <button class="stage-button" @click="openPool(spotlightPool)">
                  Try this model <FlowIcon name="arrow" />
                </button>
              </div>
              <div class="stage-caption">
                <span>Pick a perspective.</span>
                <div
                  class="model-dots"
                  role="group"
                  aria-label="Featured pool model"
                >
                  <button
                    v-for="(pool, index) in pools"
                    :key="pool.id"
                    :aria-label="`Show ${pool.name} model`"
                    :aria-pressed="spotlightIndex === index"
                    @click="spotlightIndex = index"
                  >
                    0{{ index + 1 }}
                  </button>
                </div>
              </div>
            </div>
          </section>
          <section class="journey-bar page-width" aria-label="Getting started">
            <div class="journey-intro">
              <span class="eyebrow">FROM CURIOUS TO FAMILIAR</span
              ><strong>Your practice path</strong
              ><span class="journey-progress"
                >{{ completedSteps }} / 3 steps explored</span
              >
            </div>
            <button class="journey-step" @click="goTo('Pools')">
              <span :class="{ done: exploredPools || positions.length }">{{
                exploredPools || positions.length ? "✓" : "01"
              }}</span>
              <div>
                <strong>Find your model</strong
                ><small>Three ways to explore liquidity</small>
              </div>
              <FlowIcon name="arrow" />
            </button>
            <button
              class="journey-step"
              @click="positions.length ? goTo('Positions') : openPool(pools[0])"
            >
              <span :class="{ done: positions.length }">{{
                positions.length ? "✓" : "02"
              }}</span>
              <div>
                <strong>{{
                  positions.length
                    ? "Revisit your previews"
                    : "Rehearse a position"
                }}</strong
                ><small>{{
                  positions.length
                    ? `${positions.length} saved in this tab`
                    : "Try an amount. Keep the insight."
                }}</small>
              </div>
              <FlowIcon name="arrow" />
            </button>
            <button class="journey-step" @click="openModal('wallet')">
              <span :class="{ done: connected }">{{
                connected ? "✓" : "03"
              }}</span>
              <div>
                <strong>Meet the testnet</strong
                ><small>Connect when you’re ready</small>
              </div>
              <FlowIcon name="arrow" />
            </button>
          </section>
        </template>

        <section
          v-if="showDiscovery"
          class="discovery-section page-width"
          :class="{ 'pools-page': activePage === 'Pools' }"
          aria-labelledby="discovery-title"
        >
          <div class="section-heading">
            <div>
              <div class="eyebrow">THE MODEL LIBRARY / 03</div>
              <component
                :is="activePage === 'Pools' ? 'h1' : 'h2'"
                id="discovery-title"
                >A model for your next what-if.</component
              >
              <p>
                Compare the possibilities. All figures below are illustrative.
              </p>
            </div>
            <span class="data-badge"
              ><span class="small-dot"></span> Example data</span
            >
          </div>
          <div class="pool-workspace">
            <div class="pool-toolbar">
              <div class="filter-tabs" role="group" aria-label="Filter pools">
                <button
                  v-for="item in ['All pools', 'Core', 'Experimental']"
                  :key="item"
                  :class="{ selected: filter === item }"
                  :aria-pressed="filter === item"
                  :aria-label="item"
                  @click="filter = item"
                >
                  {{ item }}<span v-if="item === 'All pools'">03</span>
                </button>
              </div>
              <label class="search-box"
                ><FlowIcon name="search" /><input
                  v-model="search"
                  type="search"
                  placeholder="Find a pool or token"
                  aria-label="Search pools"
              /></label>
              <label class="sort-box"
                ><span class="sr-only">Sort pools</span
                ><select v-model="sort" aria-label="Sort pools">
                  <option value="featured">Featured first</option>
                  <option value="apy">Sample APY</option>
                  <option value="tvl">Sample TVL</option>
                </select></label
              >
            </div>
            <div class="pool-results" role="status" aria-live="polite">
              {{ filteredPools.length }}
              {{ filteredPools.length === 1 ? "model" : "models" }} to
              explore<span>LOCAL SIMULATION · NO DEPOSIT</span>
            </div>
            <div class="pool-table-head" aria-hidden="true">
              <span>POOL / STRATEGY</span><span>PROFILE</span
              ><span>SAMPLE APY</span><span>SAMPLE TVL</span
              ><span>EXPLORE</span>
            </div>
            <div class="pool-grid">
              <article
                v-for="pool in filteredPools"
                :key="pool.id"
                class="pool-card"
                :class="pool.color"
              >
                <div class="pool-identity">
                  <div class="asset-pair" aria-hidden="true">
                    <span>{{ pool.symbols[0] }}</span
                    ><span>{{ pool.symbols[1] }}</span>
                  </div>
                  <div>
                    <h3>{{ pool.name }}</h3>
                    <p class="pool-pair">
                      {{ pool.pair }} <span>· {{ pool.model }}</span>
                    </p>
                  </div>
                </div>
                <span class="tag pool-profile">{{ pool.profile }}</span>
                <div class="pool-number">
                  <span class="mobile-label">Sample APY</span
                  ><strong>{{ pool.apy }}<small>%</small></strong
                  ><span class="metric-caption">Illustrative</span>
                </div>
                <div class="pool-number">
                  <span class="mobile-label">Sample TVL</span
                  ><strong>${{ pool.tvl }}<small>M</small></strong>
                  <div class="metric-bar" aria-hidden="true">
                    <i :style="{ width: pool.width + '%' }"></i>
                  </div>
                </div>
                <button
                  class="pool-preview-button"
                  :aria-label="`Preview ${pool.name} pool`"
                  @click="openPool(pool)"
                >
                  Preview <FlowIcon name="arrow" />
                </button>
              </article>
            </div>
            <div v-if="!filteredPools.length" class="empty-state" role="status">
              <span class="stat-icon"><FlowIcon name="search" /></span>
              <h3>No matching pools.</h3>
              <p>
                Try another name or token, or clear your filters to start again.
              </p>
              <button class="button button-secondary" @click="resetFilters">
                Reset filters <FlowIcon name="refresh" />
              </button>
            </div>
            <div class="pool-disclosure">
              <FlowIcon name="shield" />
              <p>
                APY and TVL are sample figures, not live returns. PTV is a demo
                symbol, separate from HOOD test tokens. Previews move no assets.
              </p>
              <button class="text-button" @click="openModal('docs')">
                Read the guide <FlowIcon name="arrow" />
              </button>
            </div>
          </div>
          <section
            v-if="activePage === 'Pools'"
            class="testnet-section"
            aria-label="Testnet connection"
          >
            <div class="testnet-copy">
              <span class="eyebrow">THE NEXT CHAPTER / OPTIONAL</span>
              <h2>Practice here.<br />Explore out there.</h2>
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

        <section
          v-if="activePage === 'Positions'"
          class="interior-page page-width"
          aria-labelledby="positions-title"
        >
          <div class="section-heading">
            <div>
              <div class="eyebrow">LEARNING, SAVED</div>
              <h1 id="positions-title">Your rehearsal notebook.</h1>
              <p>
                A little record of your exploration. Saved in this tab for this
                session; no assets held.
              </p>
            </div>
            <button class="button button-primary" @click="goTo('Pools')">
              <FlowIcon name="plus" />New preview
            </button>
          </div>
          <div v-if="!positions.length" class="positions-empty">
            <div class="empty-illustration" aria-hidden="true">
              <FlowIcon name="portfolio" /><span>+</span>
            </div>
            <span class="eyebrow">A FRESH PAGE FOR YOUR NEXT IDEA</span>
            <h2>Every position starts<br />with a what-if.</h2>
            <p>
              Pick a pool, try a practice amount, and save a preview. You don’t
              need a wallet to get a feel for the flow.
            </p>
            <button class="button button-primary" @click="goTo('Pools')">
              Find a pool <FlowIcon name="arrow" />
            </button>
          </div>
          <div v-else class="position-grid">
            <article
              v-for="position in positions"
              :key="position.id"
              class="position-card"
            >
              <div class="position-card-top">
                <span class="tag tag-purple">Local preview</span
                ><span>{{ poolFor(position).profile }}</span>
              </div>
              <h2>{{ poolFor(position).name }}</h2>
              <div class="position-amount">
                {{ displayAmount(position.amount) }}
                <small>{{ poolFor(position).token }}</small>
              </div>
              <p>
                Simulation only. No onchain deposit, assets, fees, or accrued
                returns.
              </p>
              <div class="position-card-actions">
                <button
                  class="text-button"
                  @click="openPool(poolFor(position))"
                >
                  Create another <FlowIcon name="plus" /></button
                ><button
                  class="remove-button"
                  :aria-label="`Remove ${poolFor(position).name} preview of ${displayAmount(position.amount)} ${poolFor(position).token}`"
                  @click="removePosition(position)"
                >
                  Remove
                </button>
              </div>
            </article>
          </div>
          <div v-if="undoPosition" class="undo-bar" role="status">
            <span>Preview removed.</span
            ><button class="text-button" @click="undoRemove">
              Undo removal <FlowIcon name="refresh" />
            </button>
          </div>
        </section>
        <section
          v-if="activePage === 'Governance'"
          class="interior-page page-width"
          aria-labelledby="governance-title"
        >
          <div class="section-heading">
            <div>
              <div class="eyebrow">THE COMMUNITY / WHAT COMES NEXT</div>
              <h1 id="governance-title">Built to learn. Room to grow.</h1>
              <p>
                Prelivo is an early testnet workspace. Community governance is
                part of the future design.
              </p>
            </div>
            <span class="tag">In development</span>
          </div>
          <div class="governance-grid">
            <article class="governance-card">
              <span class="stat-icon"><FlowIcon name="community" /></span>
              <h2>Good ideas deserve<br />a place to meet.</h2>
              <p>
                There are no active proposals or voting contracts in this
                release. Test token balances do not grant voting power.
              </p>
              <div class="governance-status">
                <span class="small-dot"></span> Voting is not available yet
              </div>
              <button
                class="button button-secondary"
                @click="openModal('docs')"
              >
                What’s available today <FlowIcon name="arrow" />
              </button>
            </article>
            <article class="governance-card peach-card">
              <span class="eyebrow">IN THE MEANTIME</span>
              <h2>Get to know<br />the possibilities.</h2>
              <p>
                Explore the pool models and build a practice position. A little
                familiarity goes a long way.
              </p>
              <button class="button button-primary" @click="goTo('Pools')">
                Explore pool models <FlowIcon name="arrow" />
              </button>
            </article>
          </div>
        </section>
      </main>
      <footer class="site-footer page-width">
        <span>© 2026 Prelivo</span>
        <div>
          <button @click="openModal('docs')">Guide</button
          ><a :href="EXPLORER_URL" target="_blank" rel="noopener noreferrer"
            >Explorer <FlowIcon name="external" /></a
          ><a
            v-if="SOCIAL_URL"
            :href="SOCIAL_URL"
            target="_blank"
            rel="noopener noreferrer"
            >X <FlowIcon name="external"
          /></a>
        </div>
        <p>
          An independent project on Robinhood Chain Testnet. No affiliation with
          Robinhood. Test tokens have no cash value.
        </p>
      </footer>

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
              POOL EXPLORER /
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
            <h2 id="dialog-title">Your testnet wallet.</h2>
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
            ><div class="eyebrow">THE PRELIVO GUIDE</div>
            <h2 id="dialog-title">A field guide to your first move.</h2>
            <p class="dialog-lead">
              Three small steps from curiosity to a clearer decision.
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
                  pool models. It is not a Prelivo token. {{ nativeSymbol }} is
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
    </div>
    <div v-if="toast" class="toast" role="status" aria-live="polite">
      <FlowIcon name="check" /><span>{{ toast }}</span
      ><button aria-label="Dismiss notification" @click="toast = ''">
        <FlowIcon name="close" />
      </button>
    </div>
  </div>
</template>
