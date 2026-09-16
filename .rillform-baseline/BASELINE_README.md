# Harbaxis reconstructed performance baseline

This fixture uses the App.vue, CSS, configuration, wallet composable, AxisIcon, HTML entry, package metadata and public assets archived immediately before the Rillform rebrand. The unchanged main.js and signature-compatible frontend ABI are copied from the current website. It is not the older Depthena baseline.

Built inside website/.rillform-baseline using the same installed Vite, Vue and ethers dependencies as Rillform, then relocated here. No .env file was copied or read for this fixture. envDir is explicitly the fixture, so the frontend uses the archived public configuration defaults (zero token address). Source hashes and origins are recorded in source-manifest.json.

This reconstructs a baseline from archived source rather than recovering the exact originally shipped build. Compare local unthrottled Chromium navigation samples directionally, not as production Core Web Vitals or measured user latency. Neither run connects a wallet or sends a transaction.
