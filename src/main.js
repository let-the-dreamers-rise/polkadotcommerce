import "./style.css";
import {
  createPublicClient,
  createWalletClient,
  custom,
  formatUnits,
  getAddress,
  http,
  isAddress,
  parseAbi
} from "viem";

const POLKADOT_HUB_TESTNET = {
  id: 420420417,
  name: "Polkadot Hub TestNet",
  nativeCurrency: {
    decimals: 18,
    name: "Paseo",
    symbol: "PAS"
  },
  rpcUrls: {
    default: {
      http: ["https://services.polkadothub-rpc.com/testnet"]
    }
  }
};

const DOT_CHECKOUT_ABI = parseAbi([
  "function getCheckout(uint256 checkoutId) view returns (address merchant, address settlementAsset, uint256 settlementAmount, uint64 expiresAt, bool active, string checkoutRef)",
  "function getAcceptedAssets(uint256 checkoutId) view returns (address[])",
  "function payWithQuote((uint256 checkoutId,address inputAsset,uint256 inputAmount,address settlementAsset,uint256 settlementAmount,address solver,uint64 quoteExpiry,uint64 fillDeadline,bytes32 salt) quote, bytes signature) payable returns (uint256 paymentId)",
  "function fillPayment(uint256 paymentId) payable",
  "function refundExpiredPayment(uint256 paymentId)",
  "function hashQuote((uint256 checkoutId,address inputAsset,uint256 inputAmount,address settlementAsset,uint256 settlementAmount,address solver,uint64 quoteExpiry,uint64 fillDeadline,bytes32 salt) quote) view returns (bytes32)"
]);

const ERC20_ABI = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)"
]);

const zeroAddress = "0x0000000000000000000000000000000000000000";
const targetChainIdHex = `0x${POLKADOT_HUB_TESTNET.id.toString(16)}`;

const sampleAssets = [
  {
    label: "Paseo",
    kind: "Gas rail",
    symbol: "PAS",
    decimals: 18,
    address: zeroAddress,
    note: "Native Polkadot Hub TestNet gas asset"
  },
  {
    label: "Tether Route",
    kind: "Foreign asset",
    symbol: "USDT",
    decimals: 6,
    address: assetIdToPrecompile(1984),
    note: "Example ERC20 precompile using asset ID 1984"
  },
  {
    label: "Merchant Settle",
    kind: "Settlement target",
    symbol: "USDC",
    decimals: 6,
    address: "0x1111111111111111111111111111111111111111",
    note: "Swap this with your chosen Hub testnet settlement asset"
  }
];

const sampleQuote = {
  checkoutId: 1,
  inputAsset: sampleAssets[1].address,
  inputAmount: "105000000",
  settlementAsset: sampleAssets[2].address,
  settlementAmount: "100000000",
  solver: "0x2222222222222222222222222222222222222222",
  quoteExpiry: `${Math.floor(Date.now() / 1000) + 900}`,
  fillDeadline: `${Math.floor(Date.now() / 1000) + 3600}`,
  salt: "0x1c520d341716f4a51f6ea5017d1b0c2d706fce6f34b86f22c54d6f5bb2a5a001"
};

const deploymentSteps = [
  {
    title: "Fund your deployer",
    body:
      "Use a Polkadot Hub TestNet faucet and make sure the wallet in PRIVATE_KEY has enough PAS for deployment and one live transaction."
  },
  {
    title: "Create .env",
    body:
      "Set PRIVATE_KEY, optionally set QUOTE_SIGNER_PRIVATE_KEY, and keep the default RPC as https://services.polkadothub-rpc.com/testnet."
  },
  {
    title: "Deploy contracts",
    body:
      "Run npm run deploy:hub. The script deploys DotCheckout, XcmDispatcher, mock assets, creates checkout #1, and prints demo config JSON."
  },
  {
    title: "Apply the config",
    body:
      "Paste the JSON output into this tab and click Apply Demo Config. The app fills contract address, assets, quote, and signature for you."
  },
  {
    title: "Approve and run",
    body:
      "Connect the payer wallet, approve the input asset, submit payment, then connect the solver wallet and approve the settlement asset before filling."
  }
];

const deploymentCommands = [
  "copy .env.example .env",
  "npm run deploy:hub",
  "paste docs/demo-config.latest.json into the app"
];

const deployChecklist = [
  "MetaMask network added with chain ID 420420417",
  "Demo config pasted into the app",
  "Buyer wallet funded with PAS or supported asset",
  "Solver wallet funded if using cross-asset settlement",
  "Quote signer matches QUOTE_SIGNER_PRIVATE_KEY"
];

const state = {
  account: null,
  walletClient: null,
  contractAddress: "",
  activeTab: "overview",
  assets: [...sampleAssets],
  demoConfig: null,
  publicClient: createPublicClient({
    chain: POLKADOT_HUB_TESTNET,
    transport: http(POLKADOT_HUB_TESTNET.rpcUrls.default.http[0])
  }),
  logItems: [
    "DotCheckout is positioned as commerce infrastructure, not another DeFi primitive.",
    "Polkadot Hub TestNet is preloaded on chain ID 420420417."
  ]
};

/* ── Nav config ── */
const navItems = [
  { id: "overview", label: "Overview",          icon: "◎" },
  { id: "merchant", label: "Merchant View",      icon: "⬡" },
  { id: "route",    label: "Pay & Settle",       icon: "⟁" },
  { id: "deploy",   label: "Operator Setup",     icon: "⌬" }
];

const tabLabels = {
  overview: "Overview",
  merchant: "Merchant View",
  route:    "Pay & Settle",
  deploy:   "Operator Setup"
};

/* ── Mount Layout ── */
const app = document.querySelector("#app");
app.innerHTML = `
  <div class="app-layout">

    <!-- Sidebar -->
    <aside class="sidebar">
      <div class="sidebar-brand">
        <div class="brand-mark"></div>
        <div class="brand-text">
          <div class="brand-title">DotCheckout</div>
          <div class="brand-sub">Polkadot Hub Commerce</div>
        </div>
      </div>

      <div class="nav-section-label">Navigation</div>
      ${navItems.map(n => `
        <button class="nav-btn${n.id === "overview" ? " active" : ""}" data-tab="${n.id}">
          <span class="nav-icon">${n.icon}</span>
          ${n.label}
        </button>
      `).join("")}

      <div class="sidebar-footer">
        <div class="network-badge">
          <span class="network-dot"></span>
          Hub TestNet — 420420417
        </div>
      </div>
    </aside>

    <!-- Topbar -->
    <header class="topbar">
      <div class="topbar-left">
        <span class="topbar-title" id="topbar-title">Overview</span>
        <div class="topbar-pills">
          <span class="top-pill">Merchant infra</span>
          <span class="top-pill">Exact output</span>
          <span class="top-pill">Hub TestNet</span>
        </div>
      </div>
      <div class="topbar-right">
        <button id="connect-btn" class="primary">Connect Wallet</button>
      </div>
    </header>

    <!-- Main content -->
    <main class="main-content">

      <section class="demo-path-banner mb-md">
        <span class="demo-path-kicker">Live Demo Path</span>
        <strong>Merchant View -> Pay &amp; Settle -> Done</strong>
        <span class="demo-path-copy">Show the merchant target first, run the payment second, keep setup tools out of the main pitch.</span>
      </section>

      <!-- ═══ OVERVIEW ═══ -->
      <section class="tab-panel active" data-panel="overview">

        <div class="hero-shell mb-lg">
          <div class="hero-copy">
            <div class="section-title">Polkadot Hub Commerce Layer</div>
            <h1>Buyer pays with one asset. Merchant receives exactly what they asked for.</h1>
            <p class="lede">
              DotCheckout is a cross-asset checkout demo on Polkadot Hub. Start in Merchant View to
              show the invoice, then use Pay &amp; Settle to approve assets, submit the buyer payment,
              and finish settlement from the solver wallet. Operator Setup is only for deploy and backup config.
            </p>
            <div class="hero-actions">
              <button class="hero-link hero-link-primary" data-jump-tab="merchant">Open Merchant View</button>
              <button class="hero-link" data-jump-tab="route">Open Pay &amp; Settle</button>
            </div>
            <div class="metric-grid">
              <div class="metric-card">
                <span class="metric-value">Customer pays USDT</span>
                <span class="metric-label">checkout asset</span>
              </div>
              <div class="metric-card">
                <span class="metric-value">Merchant gets 100 USDC</span>
                <span class="metric-label">invoice settled</span>
              </div>
              <div class="metric-card">
                <span class="metric-value">No merchant FX risk</span>
                <span class="metric-label">exact settlement</span>
              </div>
            </div>
          </div>

          <div class="hero-stage">
            <article class="stage-card stage-card-primary">
              <span class="stage-chip">Merchant invoice</span>
              <h3>Order #1042: receive 100 USDC</h3>
              <p>Customer checks out with a supported asset. The merchant still settles in the asset they actually want to keep.</p>
              <div class="stage-stack">
                <div class="stage-line"><span>Invoice total</span><strong>100.00 USDC</strong></div>
                <div class="stage-line"><span>Accepted at checkout</span><strong>PAS / USDT / USDC</strong></div>
              </div>
            </article>

            <div class="settlement-engine">
              <div class="engine-shell">
                <div class="engine-grid"></div>
                <div class="engine-ring engine-ring-one"></div>
                <div class="engine-ring engine-ring-two"></div>
                <div class="engine-rail engine-rail-horizontal"></div>
                <div class="engine-rail engine-rail-diagonal"></div>
                <div class="engine-rail engine-rail-diagonal-reverse"></div>
                <div class="engine-pulse pulse-horizontal"></div>
                <div class="engine-pulse pulse-diagonal"></div>
                <div class="engine-pulse pulse-diagonal-reverse"></div>
                <div class="engine-node engine-node-top"><span>Buyer rail</span><strong>USDT</strong></div>
                <div class="engine-node engine-node-left"><span>Gas path</span><strong>PAS</strong></div>
                <div class="engine-node engine-node-right"><span>Merchant</span><strong>USDC</strong></div>
                <div class="engine-node engine-node-bottom"><span>Fallback</span><strong>Refund</strong></div>
                <div class="engine-core">
                  <span class="engine-kicker">Settlement engine</span>
                  <strong>105 USDT -> 100 USDC</strong>
                  <p>Signed quote. Exact merchant output.</p>
                </div>
              </div>
              <div class="engine-caption">
                <div><span>Solver mode</span><strong>Off-chain route intelligence</strong></div>
                <div><span>Merchant guarantee</span><strong>No output-side slippage</strong></div>
              </div>
            </div>

            <article class="stage-card stage-card-route">
              <span class="stage-chip stage-chip-warm">Route theater</span>
              <div class="route-row">
                <div class="route-node"><span>Buyer</span><strong>105 USDT</strong></div>
                <div class="route-arrow"></div>
                <div class="route-node"><span>Solver</span><strong>Signed route</strong></div>
                <div class="route-arrow"></div>
                <div class="route-node route-node-success"><span>Merchant</span><strong>100 USDC</strong></div>
              </div>
            </article>
          </div>
        </div>

        <section class="glass-panel glow start-here-panel mb-md">
          <div class="section-title">Start Here</div>
          <h2>For the live demo, follow these 3 steps</h2>
          <p class="lede">
            This app is easiest to understand when you present it in order. Show the merchant outcome first,
            then run the payment, then keep setup tools out of the main judge flow.
          </p>
          <div class="start-grid">
            <article class="start-card">
              <span class="start-number">01</span>
              <h3>Open Merchant View</h3>
              <p>Show the merchant wants exactly <strong>100 USDC</strong>.</p>
              <button class="hero-link hero-link-primary" data-jump-tab="merchant">Go To Merchant View</button>
            </article>
            <article class="start-card">
              <span class="start-number">02</span>
              <h3>Open Pay &amp; Settle</h3>
              <p>Buyer approves and pays. Solver approves and fills.</p>
              <button class="hero-link" data-jump-tab="route">Go To Pay &amp; Settle</button>
            </article>
            <article class="start-card start-card-warning">
              <span class="start-number">03</span>
              <h3>Ignore Operator Setup Live</h3>
              <p>Use it before the demo starts, not during the main judge walkthrough.</p>
              <button class="hero-link" data-jump-tab="deploy">Open Setup Only If Needed</button>
            </article>
          </div>
        </section>

        <!-- Overview panels -->
        <div class="overview-grid mb-md">
          <div class="glass-panel glow">
            <div class="section-title">What This App Does</div>
            <ul class="bullet-list">
              <li>This is a checkout flow for an order or invoice, not a simple wallet transfer.</li>
              <li>The buyer pays with the asset they already hold.</li>
              <li>The merchant still receives the exact asset and amount they asked for.</li>
              <li>A solver handles the conversion and settlement path between those two sides.</li>
            </ul>
          </div>
          <div class="glass-panel">
            <div class="section-title">How To Navigate</div>
            <ol class="number-list">
              <li><strong>Overview</strong>: understand the product in 10 seconds.</li>
              <li><strong>Merchant View</strong>: show the invoice and exact merchant target of <strong>100 USDC</strong>.</li>
              <li><strong>Pay &amp; Settle</strong>: customer approves and pays, then solver fills settlement.</li>
              <li><strong>Operator Setup</strong>: only for deploy/config, not for the main judge flow.</li>
            </ol>
          </div>
        </div>

        <div class="overview-grid mb-md">
          <div class="glass-panel">
            <div class="section-title">Demo Flow</div>
            <div class="story-list">
              <div class="story-item"><span>01</span><p>Merchant asks to receive <strong>100 USDC</strong>.</p></div>
              <div class="story-item"><span>02</span><p>Customer pays the invoice with <strong>105 USDT</strong>.</p></div>
              <div class="story-item"><span>03</span><p>Solver delivers <strong>100 USDC</strong> to the merchant.</p></div>
              <div class="story-item"><span>04</span><p>Order closes as paid because the merchant gets the exact target output, not a variable swap result.</p></div>
            </div>
          </div>
          <div class="glass-panel">
            <div class="section-title">Supported Rails</div>
            <div id="asset-cards" class="asset-grid"></div>
          </div>
        </div>

        <section class="ticker-band">
          <div id="asset-ticker" class="ticker-track"></div>
        </section>

      </section>

      <!-- ═══ MERCHANT CONSOLE ═══ -->
      <section class="tab-panel" data-panel="merchant">
        <div class="page-header mb-lg">
          <div class="section-title">Merchant View</div>
          <h1>Show the invoice and what the merchant must receive</h1>
          <p class="lede">Use this tab to prove the commerce story: invoice reference, target asset, target amount, and the loaded checkout the customer is paying for.</p>
        </div>

        <div class="cockpit-grid mb-md">
          <div class="glass-panel glow">
            <div class="section-title">Invoice Context</div>
            <p class="lede compact-lede">
              The merchant is selling something specific, not just receiving a random transfer. Load the checkout and show the invoice target before you touch the customer or solver flow.
            </p>
            <div class="highlight-stack">
              <div class="highlight-card">
                <span>Invoice reference</span>
                <strong>dotcheckout-demo-order</strong>
              </div>
              <div class="highlight-card">
                <span>Merchant target</span>
                <strong>100 USDC</strong>
              </div>
              <div class="highlight-card">
                <span>Customer pays</span>
                <strong>105 USDT</strong>
              </div>
            </div>
          </div>

          <div class="glass-panel cockpit">
            <div class="section-title">Merchant Checkout</div>
            <label class="field">
              <span>DotCheckout contract</span>
              <input id="contract-address" placeholder="0x..." />
            </label>
            <div class="actions">
              <button id="load-checkout-btn">Load Checkout #1</button>
              <button id="switch-chain-btn">Switch To Hub TestNet</button>
            </div>
            <div class="status-grid">
              <div>
                <span class="status-label">Wallet</span>
                <div id="wallet-status" class="status-value muted">Not connected</div>
              </div>
              <div>
                <span class="status-label">Network</span>
                <div class="status-value">Polkadot Hub TestNet</div>
              </div>
              <div>
                <span class="status-label">RPC</span>
                <div class="status-value compact">services.polkadothub-rpc.com/testnet</div>
              </div>
              <div>
                <span class="status-label">Contract</span>
                <div id="contract-status" class="status-value muted">Awaiting address</div>
              </div>
            </div>
            <div id="checkout-view" class="checkout-view empty">
              Load checkout data to turn this panel into a live merchant settlement sheet.
            </div>
          </div>
        </div>
      </section>

      <!-- ═══ ROUTE LAB ═══ -->
      <section class="tab-panel" data-panel="route">
        <div class="page-header mb-lg">
          <div class="section-title">Pay &amp; Settle</div>
          <h1>Run the customer payment and solver settlement</h1>
          <p class="lede">This is the action tab. First the customer pays the invoice. Then the solver delivers the merchant’s exact target asset and amount.</p>
        </div>

        <div class="quote-grid mb-md">
          <div class="glass-panel glow">
            <div class="section-title">Payment Data</div>
            <label class="field">
              <span>Quote JSON</span>
              <textarea id="quote-json" rows="10"></textarea>
            </label>
            <label class="field">
              <span>Signature</span>
              <textarea id="quote-signature" rows="4" placeholder="0x..."></textarea>
            </label>
            <div class="actions">
              <button id="sample-quote-btn">Load Sample Quote</button>
              <button id="approve-input-btn">Approve Input Asset</button>
              <button id="approve-settlement-btn">Approve Settlement Asset</button>
              <button id="pay-quote-btn" class="primary">Submit Payment</button>
              <button id="fill-payment-btn">Fill Payment #1</button>
              <button id="refund-payment-btn">Refund Payment #1</button>
            </div>
            <p class="footnote">
              For the live run, generate a real EIP-712 signature with <code>node scripts/signQuote.js</code>.
            </p>
          </div>

          <div class="glass-panel">
            <div class="section-title">Settlement Preview</div>
            <div id="quote-preview" class="quote-preview"></div>
          </div>
        </div>

        <div class="quote-grid mb-md">
          <div class="glass-panel">
            <div class="section-title">Settlement Edge</div>
            <div class="edge-stack">
              <article class="edge-card">
                <span class="edge-kicker">Now</span>
                <h3>ERC20 precompiles</h3>
                <p>Registered assets can be handled like standard ERC20s inside Solidity.</p>
              </article>
              <article class="edge-card">
                <span class="edge-kicker">Next</span>
                <h3>Solver competition</h3>
                <p>Quotes stay off-chain so routers can improve without bloating merchant contracts.</p>
              </article>
              <article class="edge-card">
                <span class="edge-kicker">Then</span>
                <h3>XCM settlement</h3>
                <p>Keep the same checkout UX while expanding final settlement across parachains.</p>
              </article>
            </div>
          </div>
          <div class="glass-panel">
            <div class="section-title">Ops Log</div>
            <div id="log" class="log"></div>
          </div>
        </div>
      </section>

      <!-- ═══ DEPLOY GUIDE ═══ -->
      <section class="tab-panel" data-panel="deploy">
        <div class="page-header mb-lg">
          <div class="section-title">Operator Setup</div>
          <h1>Use this before the demo starts</h1>
          <p class="lede">Judges do not need this tab in the main pitch. This is your operator area for deploy, config, and recovery.</p>
        </div>

        <div class="deploy-grid mb-md">
          <div class="glass-panel glow">
            <div class="section-title">Deploy To Polkadot Hub TestNet</div>
            <div id="deployment-steps" class="deployment-steps"></div>
            <label class="field">
              <span>Paste demo config from deploy script</span>
              <textarea id="frontend-config-json" rows="12" placeholder='{"contractAddress":"0x..."}'></textarea>
            </label>
            <div class="actions">
              <button id="apply-demo-config-btn" class="primary">Apply Demo Config</button>
            </div>
          </div>
          <div class="glass-panel">
            <div class="section-title">Command Sequence</div>
            <div id="deployment-commands" class="command-list"></div>
            <div class="section-title sub-section">Demo Checklist</div>
            <div id="deploy-checklist" class="checklist"></div>
          </div>
        </div>

        <div class="deploy-grid mb-md">
          <div class="glass-panel">
            <div class="section-title">Environment</div>
            <div class="env-grid">
              <div class="env-card">
                <span>RPC URL</span>
                <strong>https://services.polkadothub-rpc.com/testnet</strong>
              </div>
              <div class="env-card">
                <span>Chain ID</span>
                <strong>420420417</strong>
              </div>
              <div class="env-card">
                <span>Native Asset</span>
                <strong>PAS</strong>
              </div>
              <div class="env-card">
                <span>XCM Precompile</span>
                <strong>0x00000000000000000000000000000000000a0000</strong>
              </div>
            </div>
          </div>
          <div class="glass-panel">
            <div class="section-title">Pitch The Deploy Story</div>
            <ul class="bullet-list">
              <li>Show that the same interface can point to local Hardhat or Polkadot Hub TestNet.</li>
              <li>Explain that the current MVP proves the checkout guarantee, while XCM expands settlement reach.</li>
              <li>Use deployed mock assets for a controlled demo if real routed assets are too risky on hackathon day.</li>
            </ul>
          </div>
        </div>
      </section>

    </main>

    <!-- Mobile bottom nav -->
    <nav class="mobile-bottom-nav">
      <div class="mobile-nav-inner">
        ${navItems.map(n => `
          <button class="mobile-nav-btn${n.id === "overview" ? " active" : ""}" data-tab="${n.id}">
            <span class="nav-icon">${n.icon}</span>
            ${n.label.split(" ")[0]}
          </button>
        `).join("")}
      </div>
    </nav>

  </div>
`;

/* ── Init renders ── */
document.querySelector("#quote-json").value = JSON.stringify(sampleQuote, null, 2);

renderAssetTicker();
renderAssetCards();
renderQuotePreview();
renderLog();
renderDeployment();
bindNav();
setConnectButtonState();
setupWalletEvents();
syncInjectedWallet();
loadLatestDemoConfig();

/* ── Event listeners ── */
document.querySelector("#connect-btn").addEventListener("click", connectWallet);
document.querySelector("#switch-chain-btn").addEventListener("click", switchToPolkadotHub);
document.querySelector("#load-checkout-btn").addEventListener("click", loadCheckout);
document.querySelector("#sample-quote-btn").addEventListener("click", () => {
  document.querySelector("#quote-json").value = JSON.stringify(sampleQuote, null, 2);
  renderQuotePreview();
  pushLog("Loaded the sample quote for the Pay & Settle demo.");
});
document.querySelector("#approve-input-btn").addEventListener("click", () => approveQuoteAsset("input"));
document.querySelector("#approve-settlement-btn").addEventListener("click", () => approveQuoteAsset("settlement"));
document.querySelector("#pay-quote-btn").addEventListener("click", payQuote);
document.querySelector("#fill-payment-btn").addEventListener("click", () => fillPayment(1n));
document.querySelector("#refund-payment-btn").addEventListener("click", () => refundPayment(1n));
document.querySelector("#quote-json").addEventListener("input", renderQuotePreview);
document.querySelector("#apply-demo-config-btn").addEventListener("click", applyDemoConfig);

for (const button of document.querySelectorAll("[data-jump-tab]")) {
  button.addEventListener("click", () => activateTab(button.dataset.jumpTab));
}

/* ════════════════════════════════════════════════
   ── Blockchain Logic (untouched core) ──
   ════════════════════════════════════════════════ */

async function connectWallet() {
  const provider = getInjectedProvider();

  if (!provider) {
    pushLog("No injected wallet found. Install MetaMask before the live demo.");
    return;
  }

  try {
    const accounts = await provider.request({
      method: "eth_requestAccounts"
    });

    if (!accounts || accounts.length === 0) {
      pushLog("Wallet returned no accounts.");
      return;
    }

    const walletClient = createWalletClient({
      chain: POLKADOT_HUB_TESTNET,
      transport: custom(provider)
    });
    const account = getAddress(accounts[0]);

    await ensurePolkadotHubNetwork(provider);

    state.account = account;
    state.walletClient = walletClient;
    setWalletStatus(shorten(account));
    setConnectButtonState(account);
    pushLog(`Wallet connected: ${account}`);
  } catch (error) {
    pushLog(`Wallet connection failed: ${error.shortMessage || error.message}`);
  }
}

async function switchToPolkadotHub() {
  const provider = getInjectedProvider();

  if (!provider) {
    pushLog("No injected wallet found for network switching.");
    return;
  }

  try {
    await ensurePolkadotHubNetwork(provider);
    pushLog("Requested wallet switch to Polkadot Hub TestNet.");
  } catch (error) {
    pushLog(`Network switch failed: ${error.shortMessage || error.message}`);
  }
}

async function ensurePolkadotHubNetwork(provider) {
  const currentChainId = await provider.request({ method: "eth_chainId" });
  if (currentChainId === targetChainIdHex) {
    return;
  }

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: targetChainIdHex }]
    });
  } catch (error) {
    const shouldAddChain =
      error?.code === 4902 ||
      `${error?.message || ""}`.toLowerCase().includes("unknown chain") ||
      `${error?.message || ""}`.toLowerCase().includes("unrecognized chain");

    if (!shouldAddChain) {
      throw error;
    }

    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: targetChainIdHex,
          chainName: POLKADOT_HUB_TESTNET.name,
          nativeCurrency: POLKADOT_HUB_TESTNET.nativeCurrency,
          rpcUrls: POLKADOT_HUB_TESTNET.rpcUrls.default.http
        }
      ]
    });
  }
}

function setupWalletEvents() {
  const provider = getInjectedProvider();
  if (!provider || typeof provider.on !== "function") {
    return;
  }

  provider.on("accountsChanged", (accounts) => {
    if (!accounts || accounts.length === 0) {
      state.account = null;
      state.walletClient = null;
      setWalletStatus("Not connected");
      setConnectButtonState();
      pushLog("Wallet disconnected.");
      return;
    }

    const account = getAddress(accounts[0]);
    state.account = account;
    state.walletClient = createWalletClient({
      chain: POLKADOT_HUB_TESTNET,
      transport: custom(provider)
    });
    setWalletStatus(shorten(account));
    setConnectButtonState(account);
    pushLog(`Active wallet changed: ${account}`);
  });

  provider.on("chainChanged", (chainIdHex) => {
    pushLog(`Wallet network changed to ${chainIdHex}.`);
  });
}

async function syncInjectedWallet() {
  const provider = getInjectedProvider();
  if (!provider) {
    return;
  }

  try {
    const accounts = await provider.request({ method: "eth_accounts" });
    if (!accounts || accounts.length === 0) {
      setWalletStatus("Not connected");
      setConnectButtonState();
      return;
    }

    const account = getAddress(accounts[0]);
    state.account = account;
    state.walletClient = createWalletClient({
      chain: POLKADOT_HUB_TESTNET,
      transport: custom(provider)
    });
    setWalletStatus(shorten(account));
    setConnectButtonState(account);
    pushLog(`Detected connected wallet: ${account}`);
  } catch (error) {
    setConnectButtonState();
  }
}

async function loadLatestDemoConfig() {
  try {
    const candidatePaths = ["/demo-config.latest.json", "/docs/demo-config.latest.json"];

    for (const candidatePath of candidatePaths) {
      const response = await fetch(candidatePath, { cache: "no-store" });
      if (!response.ok) {
        continue;
      }

      const config = await response.json();
      document.querySelector("#frontend-config-json").value = JSON.stringify(config, null, 2);
      applyDemoConfig({ silent: true });
      pushLog("Loaded the latest demo config automatically.");
      return;
    }
  } catch (error) {
    // Ignore missing local config on first boot or clean environments.
  }
}

async function loadCheckout() {
  const addressValue = document.querySelector("#contract-address").value.trim();
  if (!isAddress(addressValue)) {
    pushLog("Enter a valid DotCheckout contract address before loading checkout data.");
    return;
  }

  state.contractAddress = getAddress(addressValue);
  setContractStatus(shorten(state.contractAddress));

  try {
    const checkout = await state.publicClient.readContract({
      address: state.contractAddress,
      abi: DOT_CHECKOUT_ABI,
      functionName: "getCheckout",
      args: [1n]
    });

    const acceptedAssets = await state.publicClient.readContract({
      address: state.contractAddress,
      abi: DOT_CHECKOUT_ABI,
      functionName: "getAcceptedAssets",
      args: [1n]
    });

    renderCheckout(checkout, acceptedAssets);
    pushLog("Loaded checkout #1 from the live contract.");
  } catch (error) {
    setContractStatus("Load failed");
    pushLog(`Checkout load failed: ${error.shortMessage || error.message}`);
  }
}

async function payQuote() {
  if (!state.walletClient || !state.account) {
    pushLog("Connect a wallet before submitting a quote.");
    return;
  }

  if (!isAddress(state.contractAddress || document.querySelector("#contract-address").value.trim())) {
    pushLog("Set a valid contract address before submitting.");
    return;
  }

  try {
    const quote = JSON.parse(document.querySelector("#quote-json").value);
    const signature = document.querySelector("#quote-signature").value.trim();

    if (!signature) {
      pushLog("Paste a real EIP-712 signature before sending the payment.");
      return;
    }

    const normalizedQuote = normalizeQuote(quote);
    const value = normalizedQuote.inputAsset === zeroAddress ? normalizedQuote.inputAmount : 0n;

    const hash = await state.walletClient.writeContract({
      account: state.account,
      address: getAddress(state.contractAddress || document.querySelector("#contract-address").value.trim()),
      abi: DOT_CHECKOUT_ABI,
      functionName: "payWithQuote",
      args: [normalizedQuote, signature],
      value
    });

    pushLog(`Submitted payWithQuote. Tx: ${hash}`);
  } catch (error) {
    pushLog(`Quote submission failed: ${error.shortMessage || error.message}`);
  }
}

async function approveQuoteAsset(role) {
  if (!state.walletClient || !state.account) {
    pushLog("Connect a wallet before approving ERC20 assets.");
    return;
  }

  const contractAddressValue = state.contractAddress || document.querySelector("#contract-address").value.trim();
  if (!isAddress(contractAddressValue)) {
    pushLog("Load or paste a valid DotCheckout contract address before approving.");
    return;
  }

  try {
    const normalizedQuote = normalizeQuote(JSON.parse(document.querySelector("#quote-json").value));
    const assetAddress = role === "input" ? normalizedQuote.inputAsset : normalizedQuote.settlementAsset;
    const amount = role === "input" ? normalizedQuote.inputAmount : normalizedQuote.settlementAmount;

    if (assetAddress === zeroAddress) {
      pushLog(`No approval needed for the ${role} asset because it is native PAS.`);
      return;
    }

    const hash = await state.walletClient.writeContract({
      account: state.account,
      address: assetAddress,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [getAddress(contractAddressValue), amount]
    });

    pushLog(`Approved ${role} asset for DotCheckout. Tx: ${hash}`);
  } catch (error) {
    pushLog(`Asset approval failed: ${error.shortMessage || error.message}`);
  }
}

async function fillPayment(paymentId) {
  if (!state.walletClient || !state.account || !state.contractAddress) {
    pushLog("Connect the solver wallet and load the contract before filling.");
    return;
  }

  try {
    const hash = await state.walletClient.writeContract({
      account: state.account,
      address: state.contractAddress,
      abi: DOT_CHECKOUT_ABI,
      functionName: "fillPayment",
      args: [paymentId]
    });
    pushLog(`Submitted fillPayment(${paymentId}). Tx: ${hash}`);
  } catch (error) {
    pushLog(`fillPayment failed: ${error.shortMessage || error.message}`);
  }
}

async function refundPayment(paymentId) {
  if (!state.walletClient || !state.account || !state.contractAddress) {
    pushLog("Connect a wallet and load the contract before refunding.");
    return;
  }

  try {
    const hash = await state.walletClient.writeContract({
      account: state.account,
      address: state.contractAddress,
      abi: DOT_CHECKOUT_ABI,
      functionName: "refundExpiredPayment",
      args: [paymentId]
    });
    pushLog(`Submitted refundExpiredPayment(${paymentId}). Tx: ${hash}`);
  } catch (error) {
    pushLog(`Refund failed: ${error.shortMessage || error.message}`);
  }
}

/* ════════════════════════════════════════════════
   ── Navigation & Tabs ──
   ════════════════════════════════════════════════ */

function bindNav() {
  /* Sidebar nav */
  for (const button of document.querySelectorAll(".nav-btn[data-tab]")) {
    button.addEventListener("click", () => activateTab(button.dataset.tab));
  }
  /* Mobile bottom nav */
  for (const button of document.querySelectorAll(".mobile-nav-btn[data-tab]")) {
    button.addEventListener("click", () => activateTab(button.dataset.tab));
  }
}

function applyDemoConfig(options = {}) {
  const raw = document.querySelector("#frontend-config-json").value.trim();
  if (!raw) {
    if (!options.silent) {
      pushLog("Paste the deploy output JSON before applying demo config.");
    }
    return;
  }

  try {
    const config = JSON.parse(raw);
    state.demoConfig = config;

    if (Array.isArray(config.assets) && config.assets.length > 0) {
      state.assets = config.assets.map(normalizeAssetConfig);
      renderAssetTicker();
      renderAssetCards();
    }

    if (config.contractAddress && isAddress(config.contractAddress)) {
      state.contractAddress = getAddress(config.contractAddress);
      document.querySelector("#contract-address").value = state.contractAddress;
      setContractStatus(shorten(state.contractAddress));
    }

    if (config.quote) {
      document.querySelector("#quote-json").value = JSON.stringify(config.quote, null, 2);
      renderQuotePreview();
    }

    if (config.signature) {
      document.querySelector("#quote-signature").value = config.signature;
    }

    if (!options.silent) {
      pushLog("Applied demo config from deploy output.");
    }
    activateTab("merchant");
  } catch (error) {
    if (!options.silent) {
      pushLog(`Demo config parse failed: ${error.message}`);
    }
  }
}

function activateTab(tabId) {
  state.activeTab = tabId;

  /* Sidebar nav */
  for (const button of document.querySelectorAll(".nav-btn[data-tab]")) {
    button.classList.toggle("active", button.dataset.tab === tabId);
  }
  /* Mobile bottom nav */
  for (const button of document.querySelectorAll(".mobile-nav-btn[data-tab]")) {
    button.classList.toggle("active", button.dataset.tab === tabId);
  }
  /* Panels */
  for (const panel of document.querySelectorAll(".tab-panel")) {
    panel.classList.toggle("active", panel.dataset.panel === tabId);
  }
  /* Topbar */
  const title = document.querySelector("#topbar-title");
  if (title) title.textContent = tabLabels[tabId] || tabId;
}

/* ════════════════════════════════════════════════
   ── Render Functions ──
   ════════════════════════════════════════════════ */

function renderAssetTicker() {
  const track = document.querySelector("#asset-ticker");
  const items = [...state.assets, ...state.assets, ...state.assets];

  track.innerHTML = items
    .map(
      (asset) => `
        <div class="ticker-item">
          <span class="ticker-symbol">${asset.symbol}</span>
          <span class="ticker-copy">${asset.kind}</span>
          <span class="ticker-address">${shorten(asset.address)}</span>
        </div>
      `
    )
    .join("");
}

function renderAssetCards() {
  const container = document.querySelector("#asset-cards");
  container.innerHTML = state.assets
    .map(
      (asset, index) => `
        <article class="asset-card tone-${(index % 3) + 1}">
          <div class="asset-top">
            <span class="asset-badge">${asset.kind}</span>
            <strong>${asset.symbol}</strong>
          </div>
          <h3>${asset.label}</h3>
          <code>${asset.address}</code>
          <p>${asset.note}</p>
        </article>
      `
    )
    .join("");
}

function renderDeployment() {
  document.querySelector("#deployment-steps").innerHTML = deploymentSteps
    .map(
      (step, index) => `
        <article class="deploy-step">
          <span class="deploy-index">0${index + 1}</span>
          <div>
            <h3>${step.title}</h3>
            <p>${step.body}</p>
          </div>
        </article>
      `
    )
    .join("");

  document.querySelector("#deployment-commands").innerHTML = deploymentCommands
    .map((command) => `<div class="command-item"><code>${command}</code></div>`)
    .join("");

  document.querySelector("#deploy-checklist").innerHTML = deployChecklist
    .map((item) => `<div class="check-item"><span></span><p>${item}</p></div>`)
    .join("");
}

function renderCheckout(checkout, acceptedAssets) {
  const [merchant, settlementAsset, settlementAmount, expiresAt, active, checkoutRef] = checkout;
  const settlementMeta = getAssetMeta(settlementAsset);
  const view = document.querySelector("#checkout-view");
  view.classList.remove("empty");
  view.innerHTML = `
    <div class="checkout-header">
      <div>
        <div class="checkout-pill ${active ? "live" : "paused"}">${active ? "Live checkout" : "Paused checkout"}</div>
        <h3>Checkout #1</h3>
      </div>
      <div class="checkout-target">
        <span class="status-label">Target output</span>
        <div class="status-value">${formatAssetAmount(settlementAmount, settlementAsset)}</div>
      </div>
    </div>
    <div class="checkout-grid">
      <div class="checkout-card">
        <span class="status-label">Merchant</span>
        <div class="status-value compact">${merchant}</div>
      </div>
      <div class="checkout-card">
        <span class="status-label">Settlement Rail</span>
        <div class="status-value">${settlementMeta.symbol}</div>
        <div class="status-meta compact">${settlementAsset}</div>
      </div>
      <div class="checkout-card">
        <span class="status-label">Reference</span>
        <div class="status-value">${checkoutRef}</div>
      </div>
      <div class="checkout-card">
        <span class="status-label">Expires</span>
        <div class="status-value">${new Date(Number(expiresAt) * 1000).toLocaleString()}</div>
      </div>
    </div>
    <div class="accepted-assets">
      ${acceptedAssets
        .map((asset) => {
          const meta = getAssetMeta(asset);
          return `<span class="chip">${meta.symbol} <small>${shorten(asset)}</small></span>`;
        })
        .join("")}
    </div>
  `;
}

function renderLog() {
  document.querySelector("#log").innerHTML = state.logItems
    .slice()
    .reverse()
    .map((item, index) => `<div class="log-line"><span class="log-index">0${index + 1}</span><p>${item}</p></div>`)
    .join("");
}

function pushLog(message) {
  state.logItems.push(message);
  if (state.logItems.length > 10) {
    state.logItems.shift();
  }
  renderLog();
}

function renderQuotePreview() {
  const preview = document.querySelector("#quote-preview");
  const raw = document.querySelector("#quote-json").value.trim();

  if (!raw) {
    preview.innerHTML = `<p class="muted">Paste a solver quote to preview the route here.</p>`;
    return;
  }

  try {
    const normalizedQuote = normalizeQuote(JSON.parse(raw));
    const inputMeta = getAssetMeta(normalizedQuote.inputAsset);
    const settlementMeta = getAssetMeta(normalizedQuote.settlementAsset);

    preview.innerHTML = `
      <div class="preview-header">
        <span class="section-title">Route Summary</span>
        <h3>${formatAssetAmount(normalizedQuote.inputAmount, normalizedQuote.inputAsset)} -> ${formatAssetAmount(normalizedQuote.settlementAmount, normalizedQuote.settlementAsset)}</h3>
      </div>
      <div class="preview-route-row">
        <div class="preview-node">
          <span>Input</span>
          <strong>${inputMeta.symbol}</strong>
          <p>${shorten(normalizedQuote.inputAsset)}</p>
        </div>
        <div class="preview-node">
          <span>Solver</span>
          <strong>${shorten(normalizedQuote.solver)}</strong>
          <p>fills exact output</p>
        </div>
        <div class="preview-node preview-node-success">
          <span>Output</span>
          <strong>${settlementMeta.symbol}</strong>
          <p>${shorten(normalizedQuote.settlementAsset)}</p>
        </div>
      </div>
      <div class="preview-metrics">
        <div><span>Checkout</span><strong>#${normalizedQuote.checkoutId.toString()}</strong></div>
        <div><span>Quote expires</span><strong>${formatTimestamp(normalizedQuote.quoteExpiry)}</strong></div>
        <div><span>Fill deadline</span><strong>${formatTimestamp(normalizedQuote.fillDeadline)}</strong></div>
        <div><span>Salt</span><strong>${shorten(normalizedQuote.salt)}</strong></div>
      </div>
    `;
  } catch (error) {
    preview.innerHTML = `<p class="muted">Quote preview unavailable: ${error.message}</p>`;
  }
}

/* ════════════════════════════════════════════════
   ── Utilities (untouched) ──
   ════════════════════════════════════════════════ */

function assetIdToPrecompile(assetId) {
  const assetHex = Number(assetId).toString(16).padStart(8, "0");
  return `0x${assetHex}00000000000000000000000001200000`;
}

function setWalletStatus(value) {
  const wallet = document.querySelector("#wallet-status");
  wallet.textContent = value;
  wallet.classList.toggle("muted", value === "Not connected");
}

function setConnectButtonState(account) {
  const button = document.querySelector("#connect-btn");
  if (!button) {
    return;
  }

  if (!account) {
    button.textContent = "Connect Wallet";
    button.title = "Connect Wallet";
    return;
  }

  const shortAccount = shorten(account);
  button.textContent = `Connected ${shortAccount}`;
  button.title = account;
}

function setContractStatus(value) {
  const contract = document.querySelector("#contract-status");
  contract.textContent = value;
  contract.classList.toggle("muted", value === "Awaiting address");
}

function getAssetMeta(address) {
  const match = state.assets.find((asset) => canonicalAddress(asset.address) === canonicalAddress(address));

  return (
    match || {
      label: "Unknown Asset",
      kind: "Detected asset",
      symbol: "ASSET",
      decimals: 18,
      address
    }
  );
}

function formatAssetAmount(amount, assetAddress) {
  const asset = getAssetMeta(assetAddress);
  return `${formatUnits(amount, asset.decimals)} ${asset.symbol}`;
}

function formatTimestamp(value) {
  return new Date(Number(value) * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function canonicalAddress(address) {
  return address.toLowerCase();
}

function normalizeAssetConfig(asset) {
  return {
    label: asset.label || "Configured Asset",
    kind: asset.kind || "Configured rail",
    symbol: asset.symbol || "ASSET",
    decimals: Number(asset.decimals || 18),
    address:
      canonicalAddress(asset.address || zeroAddress) === canonicalAddress(zeroAddress)
        ? zeroAddress
        : getAddress(asset.address),
    note: asset.note || "Injected from deploy config"
  };
}

function getInjectedProvider() {
  if (!window.ethereum) {
    return null;
  }

  if (Array.isArray(window.ethereum.providers) && window.ethereum.providers.length > 0) {
    return window.ethereum.providers.find((provider) => provider.isMetaMask) || window.ethereum.providers[0];
  }

  return window.ethereum;
}

function normalizeQuote(quote) {
  return {
    checkoutId: BigInt(quote.checkoutId),
    inputAsset: getAddress(quote.inputAsset),
    inputAmount: BigInt(quote.inputAmount),
    settlementAsset: getAddress(quote.settlementAsset),
    settlementAmount: BigInt(quote.settlementAmount),
    solver: getAddress(quote.solver),
    quoteExpiry: BigInt(quote.quoteExpiry),
    fillDeadline: BigInt(quote.fillDeadline),
    salt: quote.salt
  };
}

function shorten(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
