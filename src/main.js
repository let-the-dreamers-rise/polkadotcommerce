import "./style.css";
import {
  createPublicClient,
  createWalletClient,
  custom,
  decodeEventLog,
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
  "function getPayment(uint256 paymentId) view returns (uint256 checkoutId, address merchant, address payer, address inputAsset, uint256 inputAmount, address settlementAsset, uint256 settlementAmount, address solver, uint64 fillDeadline, uint8 state)",
  "function payWithQuote((uint256 checkoutId,address inputAsset,uint256 inputAmount,address settlementAsset,uint256 settlementAmount,address solver,uint64 quoteExpiry,uint64 fillDeadline,bytes32 salt) quote, bytes signature) payable returns (uint256 paymentId)",
  "function fillPayment(uint256 paymentId) payable",
  "function refundExpiredPayment(uint256 paymentId)",
  "function hashQuote((uint256 checkoutId,address inputAsset,uint256 inputAmount,address settlementAsset,uint256 settlementAmount,address solver,uint64 quoteExpiry,uint64 fillDeadline,bytes32 salt) quote) view returns (bytes32)",
  "event QuoteAccepted(uint256 indexed paymentId, uint256 indexed checkoutId, bytes32 indexed quoteDigest, address payer, address inputAsset, uint256 inputAmount, address solver)"
]);

const ERC20_ABI = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)"
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
    label: "Supplier Dollar",
    kind: "Settlement target",
    symbol: "USDC",
    decimals: 6,
    address: "0x1111111111111111111111111111111111111111",
    note: "Swap this with your chosen Hub testnet supplier settlement asset"
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
    title: "Fund the operator wallet",
    body:
      "Use a Polkadot Hub TestNet faucet and make sure the wallet in PRIVATE_KEY has enough PAS for deployment and a full live Portico run."
  },
  {
    title: "Create .env",
    body:
      "Set PRIVATE_KEY, QUOTE_SIGNER_PRIVATE_KEY, and the buyer or desk demo wallets while keeping the default Hub RPC."
  },
  {
    title: "Deploy Portico",
    body:
      "Run npm run deploy:hub. The script deploys the DotCheckout settlement engine, XcmDispatcher, mock assets, creates invoice #1, and prints Portico demo config JSON."
  },
  {
    title: "Apply the config",
    body:
      "Paste the JSON output into this tab and click Apply Demo Config. Portico fills the contract address, invoice quote, signature, and role wallets for you."
  },
  {
    title: "Run the invoice",
    body:
      "Connect the buyer wallet, approve the buyer asset, submit the pay-in, then connect the desk wallet and approve the settlement asset before settling."
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
  "Buyer wallet funded with PAS and the buyer-side asset",
  "Desk wallet funded with PAS and settlement liquidity",
  "Quote signer matches QUOTE_SIGNER_PRIVATE_KEY"
];

const state = {
  account: null,
  walletClient: null,
  contractAddress: "",
  activeTab: "overview",
  assets: [...sampleAssets],
  demoConfig: null,
  checkoutSnapshot: null,
  lastPaymentId: 1n,
  journey: {
    stage: "invoice_ready",
    payerHash: "",
    solverHash: "",
    refundHash: "",
    updatedAt: null
  },
  publicClient: createPublicClient({
    chain: POLKADOT_HUB_TESTNET,
    transport: http(POLKADOT_HUB_TESTNET.rpcUrls.default.http[0])
  }),
  logItems: [
    "Portico turns supplier settlement into a product experience instead of a DeFi rail demo.",
    "Polkadot Hub TestNet is preloaded on chain ID 420420417."
  ]
};

/* ── Nav config ── */
const navItems = [
  { id: "overview", label: "Overview",          icon: "◎" },
  { id: "merchant", label: "Supplier Desk",      icon: "⬡" },
  { id: "route",    label: "Buyer Pay-In",       icon: "⟁" },
  { id: "deploy",   label: "Treasury Desk",      icon: "⌬" }
];

const tabLabels = {
  overview: "Overview",
  merchant: "Supplier Desk",
  route:    "Buyer Pay-In",
  deploy:   "Treasury Desk"
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
          <div class="brand-title">Portico</div>
          <div class="brand-sub">APAC Supplier Settlement</div>
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
          <span class="top-pill">B2B invoicing</span>
          <span class="top-pill">Stable settlement</span>
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
        <strong>Supplier Desk -> Buyer Pay-In -> Done</strong>
        <span class="demo-path-copy">Show the supplier invoice first, run the buyer pay-in second, keep treasury tools out of the main pitch.</span>
      </section>

      <!-- ═══ OVERVIEW ═══ -->
      <section class="tab-panel active" data-panel="overview">

        <div class="hero-shell mb-lg">
          <div class="hero-copy">
            <div class="section-title">Cross-Border Supplier Settlement</div>
            <h1>Buyers pay with what they hold. Suppliers settle in what they invoice.</h1>
            <p class="lede">
              Portico is a supplier-settlement protocol for APAC trade. A supplier invoices in
              <strong>100 USDC</strong>, the buyer pays in <strong>USDT</strong>, and a settlement desk makes
              sure the supplier still lands on the exact stablecoin amount they priced in.
            </p>
            <div class="hero-actions">
              <button class="hero-link hero-link-primary" data-jump-tab="merchant">Open Supplier Desk</button>
              <button class="hero-link" data-jump-tab="route">Open Buyer Pay-In</button>
            </div>
            <div class="metric-grid">
              <div class="metric-card">
                <span class="metric-value">Buyer pays USDT</span>
                <span class="metric-label">buyer-side asset</span>
              </div>
              <div class="metric-card">
                <span class="metric-value">Supplier gets 100 USDC</span>
                <span class="metric-label">invoice settlement</span>
              </div>
              <div class="metric-card">
                <span class="metric-value">Invoice closes settled</span>
                <span class="metric-label">trade result</span>
              </div>
            </div>
          </div>

          <div class="hero-stage">
            <article class="stage-card stage-card-primary">
              <span class="stage-chip">Supplier invoice</span>
              <h3>Invoice INV-1042: settle 100 USDC</h3>
              <p>The supplier does not care what asset the buyer starts with. They care that the invoice settles in the stablecoin they actually priced in.</p>
              <div class="stage-stack">
                <div class="stage-line"><span>Invoice total</span><strong>100.00 USDC</strong></div>
                <div class="stage-line"><span>Accepted buyer rails</span><strong>PAS / USDT / USDC</strong></div>
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
                <div class="engine-node engine-node-right"><span>Supplier</span><strong>USDC</strong></div>
                <div class="engine-node engine-node-bottom"><span>Fallback</span><strong>Refund</strong></div>
                <div class="engine-core">
                  <span class="engine-kicker">Settlement desk</span>
                  <strong>105 USDT -> 100 USDC</strong>
                  <p>Signed quote. Exact supplier output.</p>
                </div>
              </div>
              <div class="engine-caption">
                <div><span>Desk mode</span><strong>Off-chain route intelligence</strong></div>
                <div><span>Supplier guarantee</span><strong>No output-side slippage</strong></div>
              </div>
            </div>

            <article class="stage-card stage-card-route">
              <span class="stage-chip stage-chip-warm">Settlement path</span>
              <div class="route-row">
                <div class="route-node"><span>Buyer</span><strong>105 USDT</strong></div>
                <div class="route-arrow"></div>
                <div class="route-node"><span>Desk</span><strong>Signed route</strong></div>
                <div class="route-arrow"></div>
                <div class="route-node route-node-success"><span>Supplier</span><strong>100 USDC</strong></div>
              </div>
            </article>
          </div>
        </div>

        <section class="glass-panel glow start-here-panel mb-md">
          <div class="section-title">Start Here</div>
          <h2>For the live demo, follow these 3 steps</h2>
          <p class="lede">
            This app lands fastest when you present the supplier story in order. Show the supplier outcome first,
            run the buyer pay-in second, and keep the treasury tools off-stage.
          </p>
          <div class="start-grid">
            <article class="start-card">
              <span class="start-number">01</span>
              <h3>Open Supplier Desk</h3>
              <p>Show the supplier invoice wants exactly <strong>100 USDC</strong>.</p>
              <button class="hero-link hero-link-primary" data-jump-tab="merchant">Go To Supplier Desk</button>
            </article>
            <article class="start-card">
              <span class="start-number">02</span>
              <h3>Open Buyer Pay-In</h3>
              <p>Buyer approves and pays. The settlement desk approves and settles.</p>
              <button class="hero-link" data-jump-tab="route">Go To Buyer Pay-In</button>
            </article>
            <article class="start-card start-card-warning">
              <span class="start-number">03</span>
              <h3>Ignore Treasury Desk Live</h3>
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
              <li>This closes a supplier invoice with exact settlement; it is not a generic send-money screen.</li>
              <li>The buyer pays with the asset they already hold.</li>
              <li>The supplier still receives the exact asset and amount they invoiced.</li>
              <li>The final business outcome is <strong>invoice settled</strong>, not merely <strong>tokens moved</strong>.</li>
              <li>A settlement desk handles routing and settlement so the supplier treasury never has to.</li>
            </ul>
          </div>
          <div class="glass-panel">
            <div class="section-title">How To Navigate</div>
            <ol class="number-list">
              <li><strong>Overview</strong>: understand the product in 10 seconds.</li>
              <li><strong>Supplier Desk</strong>: show the invoice and exact supplier target of <strong>100 USDC</strong>.</li>
              <li><strong>Buyer Pay-In</strong>: buyer approves and pays, then the desk settles the invoice.</li>
              <li><strong>Treasury Desk</strong>: only for deploy or config, not for the main judge flow.</li>
            </ol>
          </div>
        </div>

        <div class="overview-grid mb-md">
          <div class="glass-panel">
            <div class="section-title">Demo Flow</div>
            <div class="story-list">
              <div class="story-item"><span>01</span><p>Supplier issues invoice <strong>INV-1042</strong> for exactly <strong>100 USDC</strong>.</p></div>
              <div class="story-item"><span>02</span><p>Buyer funds that invoice with <strong>105 USDT</strong>.</p></div>
              <div class="story-item"><span>03</span><p>The Portico desk delivers <strong>100 USDC</strong> to the supplier.</p></div>
              <div class="story-item"><span>04</span><p>The invoice closes as settled because the supplier gets the exact target output, not a variable swap result.</p></div>
            </div>
          </div>
          <div class="glass-panel">
            <div class="section-title">Supported Rails</div>
            <div id="asset-cards" class="asset-grid"></div>
          </div>
        </div>

        <div class="overview-grid mb-md">
          <div class="glass-panel glow">
            <div class="section-title">Why This Beats Other Settlement Apps</div>
            <ul class="bullet-list">
              <li>Remittance demos move value between wallets. Portico starts with a supplier invoice and ends with a trade payable marked settled.</li>
              <li>Subscription and streaming products optimize recurring flows. Portico optimizes a single high-friction B2B settlement moment.</li>
              <li>Intent and omni-pay demos often lead with routing complexity. Portico leads with supplier certainty and hides routing behind a desk.</li>
              <li>Many trade apps describe infrastructure. Portico lets judges feel the product in two tabs.</li>
            </ul>
          </div>
          <div class="glass-panel">
            <div class="section-title">Judge Soundbites</div>
            <ul class="bullet-list">
              <li><strong>Others move value. We close supplier invoices.</strong></li>
              <li><strong>The buyer pays with what they hold. The supplier settles in what they invoiced.</strong></li>
              <li><strong>The supplier treasury never manages conversion risk at the moment of payment.</strong></li>
              <li><strong>Polkadot Hub becomes useful when asset complexity disappears behind commerce UX.</strong></li>
            </ul>
          </div>
        </div>

        <section class="ticker-band">
          <div id="asset-ticker" class="ticker-track"></div>
        </section>

      </section>

      <!-- ═══ MERCHANT CONSOLE ═══ -->
      <section class="tab-panel" data-panel="merchant">
        <div class="page-header mb-lg">
          <div class="section-title">Supplier Desk</div>
          <h1>Show the invoice and what the supplier must settle in</h1>
          <p class="lede">Use this tab to prove the supplier story: invoice reference, target asset, target amount, and the live settlement request the buyer is funding.</p>
        </div>

        <div class="cockpit-grid mb-md">
          <div class="glass-panel glow">
            <div class="section-title">Invoice Context</div>
            <p class="lede compact-lede">
              The supplier already issued something specific, not a random transfer request. Load the invoice and show the exact settlement target before you touch the buyer or desk flow.
            </p>
            <div class="highlight-stack">
              <div class="highlight-card">
                <span>Invoice reference</span>
                <strong>INV-1042</strong>
              </div>
              <div class="highlight-card">
                <span>Supplier target</span>
                <strong>100 USDC</strong>
              </div>
              <div class="highlight-card">
                <span>Buyer remits</span>
                <strong>105 USDT</strong>
              </div>
            </div>
          </div>

          <div class="glass-panel cockpit">
            <div class="section-title">Supplier Settlement Engine</div>
            <label class="field">
              <span>Portico settlement contract</span>
              <input id="contract-address" placeholder="0x..." />
            </label>
            <div class="actions">
              <button id="load-checkout-btn">Load Invoice #1</button>
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
              Load invoice data to turn this panel into a live supplier settlement sheet.
            </div>
          </div>
        </div>

        <div class="cockpit-grid mb-md">
          <div class="glass-panel glow">
            <div class="section-title">Supplier Invoice</div>
            <div id="merchant-invoice-stage" class="merchant-invoice-stage"></div>
          </div>
          <div class="glass-panel">
            <div class="section-title">Settlement Lifecycle</div>
            <div id="merchant-journey" class="merchant-journey"></div>
          </div>
        </div>
      </section>

      <!-- ═══ ROUTE LAB ═══ -->
      <section class="tab-panel" data-panel="route">
        <div class="page-header mb-lg">
          <div class="section-title">Buyer Pay-In</div>
          <h1>Run the buyer pay-in and desk settlement</h1>
          <p class="lede">This is the action tab. First the buyer funds the invoice. Then the desk delivers the supplier’s exact target asset and amount.</p>
        </div>

        <div class="quote-grid mb-md">
          <div class="glass-panel glow">
            <div class="section-title">Settlement Data</div>
            <div id="route-roles" class="route-roles"></div>
            <label class="field">
              <span>Quote JSON</span>
              <textarea id="quote-json" rows="10"></textarea>
            </label>
            <label class="field">
              <span>Signature</span>
              <textarea id="quote-signature" rows="4" placeholder="0x..."></textarea>
            </label>
            <div class="actions">
              <button id="sample-quote-btn">Reload Demo Quote</button>
              <button id="approve-input-btn">Approve Buyer Asset</button>
              <button id="approve-settlement-btn">Approve Desk Asset</button>
              <button id="pay-quote-btn" class="primary">Submit Buyer Pay-In</button>
              <button id="fill-payment-btn">Settle Invoice #1</button>
              <button id="refund-payment-btn">Refund Invoice #1</button>
            </div>
            <div id="action-feedback" class="action-feedback action-feedback-info">
              <strong>Ready</strong>
              <p>Connect the buyer wallet to approve and submit the pay-in. Then switch to the desk wallet to approve settlement and settle the invoice.</p>
            </div>
            <p class="footnote">
              For the live run, generate a real EIP-712 settlement quote with <code>node scripts/signQuote.js</code>.
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
                <h3>Desk competition</h3>
                <p>Quotes stay off-chain so settlement desks can improve routing without bloating supplier contracts.</p>
              </article>
              <article class="edge-card">
                <span class="edge-kicker">Then</span>
                <h3>XCM settlement</h3>
                <p>Keep the same invoice UX while expanding final settlement across parachains.</p>
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
          <div class="section-title">Treasury Desk</div>
          <h1>Use this before the demo starts</h1>
          <p class="lede">Judges do not need this tab in the main pitch. This is your operator area for deploy, config, and recovery.</p>
        </div>

        <div class="deploy-grid mb-md">
          <div class="glass-panel glow">
            <div class="section-title">Deploy Portico To Polkadot Hub TestNet</div>
            <div id="deployment-steps" class="deployment-steps"></div>
            <label class="field">
              <span>Paste Portico demo config from the deploy script</span>
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
              <li>Explain that the current MVP proves the supplier settlement guarantee, while XCM expands settlement reach.</li>
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
renderMerchantExperience();
renderRouteRoles();
renderQuotePreview();
renderLog();
renderDeployment();
refreshPaymentActionLabels();
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
  const quoteToLoad = state.demoConfig?.quote || sampleQuote;
  document.querySelector("#quote-json").value = JSON.stringify(quoteToLoad, null, 2);
  if (state.demoConfig?.signature) {
    document.querySelector("#quote-signature").value = state.demoConfig.signature;
  }
  setJourneyStage("invoice_ready", {
    payerHash: "",
    solverHash: "",
    refundHash: ""
  });
  renderRouteRoles();
  renderQuotePreview();
  setActionFeedback(
    state.demoConfig?.quote
      ? "Reloaded the live demo quote. Use the buyer wallet for buyer-asset approval and pay-in, then switch to the desk wallet."
      : "Loaded the local sample quote. Apply live demo config if you want the deployed testnet flow.",
    "info",
    "Quote Ready"
  );
  pushLog(
    state.demoConfig?.quote
      ? "Reloaded the live demo quote from the current config."
      : "Loaded the local sample quote for the Buyer Pay-In demo."
  );
});
document.querySelector("#approve-input-btn").addEventListener("click", () => approveQuoteAsset("input"));
document.querySelector("#approve-settlement-btn").addEventListener("click", () => approveQuoteAsset("settlement"));
document.querySelector("#pay-quote-btn").addEventListener("click", payQuote);
document.querySelector("#fill-payment-btn").addEventListener("click", () => fillPayment(getActivePaymentId()));
document.querySelector("#refund-payment-btn").addEventListener("click", () => refundPayment(getActivePaymentId()));
document.querySelector("#quote-json").addEventListener("input", () => {
  renderRouteRoles();
  renderMerchantExperience();
  renderQuotePreview();
});
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
    setActionFeedback("No injected wallet was found in this browser. Open the app in MetaMask-enabled Chrome or Brave.", "danger", "Wallet Missing");
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
    renderRouteRoles();
    setActionFeedback(`Connected ${shorten(account)}. Check the role cards to confirm whether this wallet is the buyer, desk, or supplier wallet.`, "info", "Wallet Connected");
    pushLog(`Wallet connected: ${account}`);
  } catch (error) {
    setActionFeedback(`Wallet connection failed: ${error.shortMessage || error.message}`, "danger");
    pushLog(`Wallet connection failed: ${error.shortMessage || error.message}`);
  }
}

async function switchToPolkadotHub() {
  const provider = getInjectedProvider();

  if (!provider) {
    setActionFeedback("No injected wallet was found for network switching.", "danger", "Wallet Missing");
    pushLog("No injected wallet found for network switching.");
    return;
  }

  try {
    await ensurePolkadotHubNetwork(provider);
    setActionFeedback("Requested a wallet switch to Polkadot Hub TestNet. Confirm in MetaMask if a popup appears.", "info", "Switch Network");
    pushLog("Requested wallet switch to Polkadot Hub TestNet.");
  } catch (error) {
    setActionFeedback(`Network switch failed: ${error.shortMessage || error.message}`, "danger", "Switch Failed");
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
      renderRouteRoles();
      setActionFeedback("Wallet disconnected. Reconnect the buyer or desk wallet before using the action buttons.", "warning", "Wallet Needed");
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
    renderRouteRoles();
    setActionFeedback(`Switched to ${shorten(account)}. Use the matching buyer or desk action flow for this wallet role.`, "info", "Wallet Switched");
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
    renderRouteRoles();
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
    setActionFeedback("Paste a valid Portico settlement contract address before loading the live invoice.", "danger", "Contract Needed");
    pushLog("Enter a valid Portico settlement contract address before loading invoice data.");
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
    renderMerchantExperience();
    setActionFeedback("Invoice #1 loaded from the live contract. You can now show the supplier target before running the buyer pay-in.", "success", "Invoice Loaded");
    pushLog("Loaded invoice #1 from the live contract.");
  } catch (error) {
    setContractStatus("Load failed");
    setActionFeedback(`Invoice load failed: ${error.shortMessage || error.message}`, "danger", "Load Failed");
    pushLog(`Invoice load failed: ${error.shortMessage || error.message}`);
  }
}

async function payQuote() {
  if (!state.walletClient || !state.account) {
    setActionFeedback("Connect the buyer wallet before submitting the invoice pay-in.", "danger", "Buyer Wallet Needed");
    pushLog("Connect a wallet before submitting the invoice quote.");
    return;
  }

  if (!isAddress(state.contractAddress || document.querySelector("#contract-address").value.trim())) {
    setActionFeedback("Set a valid Portico settlement contract address before submitting the buyer pay-in.", "danger", "Contract Needed");
    pushLog("Set a valid contract address before submitting.");
    return;
  }

  try {
    const quote = JSON.parse(document.querySelector("#quote-json").value);
    const signature = document.querySelector("#quote-signature").value.trim();
    const expectedBuyer = state.demoConfig?.demoActors?.payer;

    if (!signature) {
      setActionFeedback("Paste a real EIP-712 signature before sending the buyer pay-in.", "danger", "Signature Needed");
      pushLog("Paste a real EIP-712 signature before sending the payment.");
      return;
    }

    if (
      expectedBuyer &&
      canonicalAddress(state.account) !== canonicalAddress(expectedBuyer)
    ) {
      setActionFeedback(`Connect the buyer wallet ${shorten(expectedBuyer)} before submitting the invoice pay-in.`, "danger", "Wrong Wallet");
      pushLog(`Connect the buyer wallet ${shorten(expectedBuyer)} before submitting the pay-in.`);
      return;
    }

    const normalizedQuote = normalizeQuote(quote);
    const timing = getQuoteTimingState(normalizedQuote);

    if (timing.isQuoteExpired) {
      setActionFeedback("This quote is already expired. Regenerate it with node scripts/signQuote.js before submitting the buyer pay-in.", "danger", "Quote Expired");
      pushLog("This quote is already expired. Regenerate it with node scripts/signQuote.js before submitting.");
      return;
    }

    const value = normalizedQuote.inputAsset === zeroAddress ? normalizedQuote.inputAmount : 0n;

    const hash = await state.walletClient.writeContract({
      account: state.account,
      address: getAddress(state.contractAddress || document.querySelector("#contract-address").value.trim()),
      abi: DOT_CHECKOUT_ABI,
      functionName: "payWithQuote",
      args: [normalizedQuote, signature],
      value
    });

    setJourneyStage("payment_pending", { payerHash: hash });
    setActionFeedback(`Buyer pay-in submitted. Waiting for the transaction to confirm on Hub. Tx: ${shorten(hash)}`, "info", "Pay-In Submitted");
    pushLog(`Submitted payWithQuote. Tx: ${hash}`);
    const receipt = await state.publicClient.waitForTransactionReceipt({ hash });
    const discoveredPaymentId = getPaymentIdFromReceipt(receipt);
    if (discoveredPaymentId) {
      state.lastPaymentId = discoveredPaymentId;
      refreshPaymentActionLabels();
      pushLog(`Detected payment id #${discoveredPaymentId.toString()} from the on-chain receipt.`);
    }
    setJourneyStage("customer_paid", { payerHash: hash });
    setActionFeedback("Buyer pay-in confirmed. The invoice is now funded and waiting for desk settlement.", "success", "Buyer Pay-In Confirmed");
    pushLog("Buyer pay-in confirmed. Invoice INV-1042 is now awaiting desk settlement.");
  } catch (error) {
    setActionFeedback(`Buyer pay-in failed: ${error.shortMessage || error.message}`, "danger", "Pay-In Failed");
    pushLog(`Quote submission failed: ${error.shortMessage || error.message}`);
  }
}

async function approveQuoteAsset(role) {
  if (!state.walletClient || !state.account) {
    setActionFeedback(`Connect the ${role === "input" ? "buyer" : "desk"} wallet before approving assets.`, "danger", "Wallet Needed");
    pushLog("Connect a wallet before approving ERC20 assets.");
    return;
  }

  const contractAddressValue = state.contractAddress || document.querySelector("#contract-address").value.trim();
  if (!isAddress(contractAddressValue)) {
    setActionFeedback("Load or paste a valid Portico settlement contract address before approving assets.", "danger", "Contract Needed");
    pushLog("Load or paste a valid Portico settlement contract address before approving.");
    return;
  }

  try {
    const normalizedQuote = normalizeQuote(JSON.parse(document.querySelector("#quote-json").value));
    const assetAddress = role === "input" ? normalizedQuote.inputAsset : normalizedQuote.settlementAsset;
    const amount = role === "input" ? normalizedQuote.inputAmount : normalizedQuote.settlementAmount;
    const expectedAccount =
      role === "input" ? state.demoConfig?.demoActors?.payer : state.demoConfig?.demoActors?.solver;

    if (
      expectedAccount &&
      canonicalAddress(state.account) !== canonicalAddress(expectedAccount)
    ) {
      const roleLabel = role === "input" ? "buyer" : "desk";
      setActionFeedback(
        `Connect the ${roleLabel} wallet ${shorten(expectedAccount)} before approving the ${roleLabel} asset.`,
        "danger",
        "Wrong Wallet"
      );
      pushLog(
        `Connect the ${roleLabel} wallet ${shorten(expectedAccount)} before approving the ${roleLabel} asset.`
      );
      return;
    }

    if (assetAddress === zeroAddress) {
      setActionFeedback(`No approval is needed because the ${role === "input" ? "buyer" : "desk"} asset is native PAS.`, "success", "No Approval Needed");
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

    setActionFeedback(`Approval submitted. Waiting for the ${role === "input" ? "buyer" : "desk"} asset approval to confirm. Tx: ${shorten(hash)}`, "info", "Approval Submitted");
    await state.publicClient.waitForTransactionReceipt({ hash });
    setActionFeedback(`${role === "input" ? "Buyer" : "Desk"} asset approved. You can now continue to the next Portico action.`, "success", "Approval Confirmed");
    pushLog(`Approved the ${role === "input" ? "buyer" : "desk"} asset for Portico. Tx: ${hash}`);
  } catch (error) {
    setActionFeedback(`Asset approval failed: ${error.shortMessage || error.message}`, "danger", "Approval Failed");
    pushLog(`Asset approval failed: ${error.shortMessage || error.message}`);
  }
}

async function fillPayment(paymentId) {
  if (!state.walletClient || !state.account || !state.contractAddress) {
    setActionFeedback("Connect the desk wallet and load the contract before settling the invoice.", "danger", "Desk Wallet Needed");
    pushLog("Connect the desk wallet and load the contract before settling.");
    return;
  }

  try {
    const currentQuote = getCurrentQuoteOrNull();
    if (currentQuote && getQuoteTimingState(currentQuote).isFillExpired) {
      setActionFeedback("The settlement window has already passed. Use Refund Invoice or sign a fresh quote instead.", "danger", "Settlement Window Closed");
      pushLog("The fill deadline has already passed. Use Refund Invoice or sign a fresh quote instead.");
      return;
    }

    const payment = await getPaymentSnapshot(paymentId);
    const paymentState = Number(payment.state);
    if (paymentState === 0) {
      setActionFeedback(`Invoice payment #${paymentId.toString()} does not exist yet. Submit the buyer pay-in first.`, "danger", "Pay-In Needed");
      pushLog(`Invoice payment #${paymentId.toString()} does not exist yet. Submit the buyer pay-in first.`);
      return;
    }
    if (paymentState === 2) {
      setActionFeedback(`Invoice #${paymentId.toString()} is already settled.`, "success", "Already Settled");
      pushLog(`Payment #${paymentId.toString()} is already settled.`);
      return;
    }
    if (paymentState === 3) {
      setActionFeedback(`Invoice #${paymentId.toString()} was already refunded.`, "warning", "Already Refunded");
      pushLog(`Payment #${paymentId.toString()} was already refunded.`);
      return;
    }
    if (canonicalAddress(payment.solver) !== canonicalAddress(state.account)) {
      setActionFeedback(`Connect the desk wallet ${shorten(payment.solver)} before settling invoice #${paymentId.toString()}.`, "danger", "Wrong Wallet");
      pushLog(`Connect the desk wallet ${shorten(payment.solver)} before settling invoice #${paymentId.toString()}.`);
      return;
    }

    if (payment.settlementAsset !== zeroAddress) {
      const allowance = await state.publicClient.readContract({
        address: payment.settlementAsset,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [state.account, state.contractAddress]
      });

      if (allowance < payment.settlementAmount) {
        setActionFeedback(
          `Approve the desk asset first. Desk allowance is ${formatAssetAmount(allowance, payment.settlementAsset)} but ${formatAssetAmount(payment.settlementAmount, payment.settlementAsset)} is required.`,
          "danger",
          "Approval Needed"
        );
        pushLog(
          `Approve the desk asset first. Desk allowance is ${formatAssetAmount(allowance, payment.settlementAsset)} but ${formatAssetAmount(payment.settlementAmount, payment.settlementAsset)} is required.`
        );
        return;
      }

      const balance = await state.publicClient.readContract({
        address: payment.settlementAsset,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [state.account]
      });

      if (balance < payment.settlementAmount) {
        setActionFeedback(
          `Desk wallet is underfunded. It has ${formatAssetAmount(balance, payment.settlementAsset)} but needs ${formatAssetAmount(payment.settlementAmount, payment.settlementAsset)} to settle the invoice.`,
          "danger",
          "Desk Underfunded"
        );
        pushLog(
          `Desk wallet is underfunded. It has ${formatAssetAmount(balance, payment.settlementAsset)} but needs ${formatAssetAmount(payment.settlementAmount, payment.settlementAsset)} to settle the invoice.`
        );
        return;
      }
    }

    const hash = await state.walletClient.writeContract({
      account: state.account,
      address: state.contractAddress,
      abi: DOT_CHECKOUT_ABI,
      functionName: "fillPayment",
      args: [paymentId]
    });
    setJourneyStage("settlement_pending", { solverHash: hash });
    setActionFeedback(`Desk settlement submitted for invoice #${paymentId.toString()}. Waiting for confirmation. Tx: ${shorten(hash)}`, "info", "Settlement Submitted");
    pushLog(`Submitted fillPayment(${paymentId}). Tx: ${hash}`);
    await state.publicClient.waitForTransactionReceipt({ hash });
    setJourneyStage("settled", { solverHash: hash });
    setActionFeedback("Settlement confirmed. Supplier invoice INV-1042 is paid and the supplier received exact output.", "success", "Invoice Settled");
    pushLog("Settlement confirmed. Invoice INV-1042 is paid and the supplier received exact output.");
    activateTab("merchant");
  } catch (error) {
    setActionFeedback(`Invoice settlement failed: ${error.shortMessage || error.message}`, "danger", "Settlement Failed");
    pushLog(`fillPayment failed: ${error.shortMessage || error.message}`);
  }
}

async function refundPayment(paymentId) {
  if (!state.walletClient || !state.account || !state.contractAddress) {
    setActionFeedback("Connect the buyer or supplier wallet and load the contract before refunding.", "danger", "Refund Blocked");
    pushLog("Connect a wallet and load the contract before refunding.");
    return;
  }

  try {
    const payment = await getPaymentSnapshot(paymentId);
    const paymentState = Number(payment.state);
    if (paymentState === 0) {
      setActionFeedback(`Invoice payment #${paymentId.toString()} does not exist yet.`, "danger", "Refund Blocked");
      pushLog(`Payment #${paymentId.toString()} does not exist yet.`);
      return;
    }
    if (paymentState === 2) {
      setActionFeedback(`Invoice #${paymentId.toString()} is already settled, so there is nothing to refund.`, "warning", "Already Settled");
      pushLog(`Payment #${paymentId.toString()} is already settled, so there is nothing to refund.`);
      return;
    }
    if (paymentState === 3) {
      setActionFeedback(`Invoice #${paymentId.toString()} was already refunded.`, "warning", "Already Refunded");
      pushLog(`Payment #${paymentId.toString()} was already refunded.`);
      return;
    }

    if (currentUnixTimestamp() <= Number(payment.fillDeadline)) {
      setActionFeedback(
        `Refund is locked until ${new Date(Number(payment.fillDeadline) * 1000).toLocaleString()}. The settlement window is still active.`,
        "warning",
        "Window Still Open"
      );
      pushLog(
        `Refund is locked until ${new Date(Number(payment.fillDeadline) * 1000).toLocaleString()}. The settlement window is still active.`
      );
      return;
    }

    if (
      canonicalAddress(state.account) !== canonicalAddress(payment.payer) &&
      canonicalAddress(state.account) !== canonicalAddress(payment.merchant)
    ) {
      setActionFeedback(
        `Refund requires the buyer wallet ${shorten(payment.payer)} or supplier wallet ${shorten(payment.merchant)}.`,
        "danger",
        "Wrong Wallet"
      );
      pushLog(
        `Refund requires the buyer wallet ${shorten(payment.payer)} or supplier wallet ${shorten(payment.merchant)}.`
      );
      return;
    }

    const hash = await state.walletClient.writeContract({
      account: state.account,
      address: state.contractAddress,
      abi: DOT_CHECKOUT_ABI,
      functionName: "refundExpiredPayment",
      args: [paymentId]
    });
    setJourneyStage("refund_pending", { refundHash: hash });
    setActionFeedback(`Refund submitted for invoice #${paymentId.toString()}. Waiting for confirmation. Tx: ${shorten(hash)}`, "info", "Refund Submitted");
    pushLog(`Submitted refundExpiredPayment(${paymentId}). Tx: ${hash}`);
    await state.publicClient.waitForTransactionReceipt({ hash });
    setJourneyStage("refunded", { refundHash: hash });
    setActionFeedback("Refund confirmed. The buyer recovered funds because settlement did not complete in time.", "success", "Refund Confirmed");
    pushLog("Refund confirmed. Buyer recovered funds because the settlement window expired.");
  } catch (error) {
    setActionFeedback(`Refund failed: ${error.shortMessage || error.message}`, "danger", "Refund Failed");
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
    }

    if (config.signature) {
      document.querySelector("#quote-signature").value = config.signature;
    }

    if (config.checkoutId) {
      state.lastPaymentId = 1n;
      refreshPaymentActionLabels();
    }

    setJourneyStage("invoice_ready", {
      payerHash: "",
      solverHash: "",
      refundHash: ""
    });
    renderRouteRoles();
    renderMerchantExperience();
    renderQuotePreview();
    setActionFeedback(
      `Demo config loaded. Buyer wallet: ${config.demoActors?.payer ? shorten(config.demoActors.payer) : "not set"}. Desk wallet: ${config.demoActors?.solver ? shorten(config.demoActors.solver) : "not set"}. Supplier wallet: ${config.demoActors?.merchant ? shorten(config.demoActors.merchant) : "not set"}.`,
      "info",
      "Roles Loaded"
    );

    if (!options.silent) {
      pushLog("Applied Portico demo config from deploy output.");
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

function refreshPaymentActionLabels() {
  const label = state.lastPaymentId ? state.lastPaymentId.toString() : "1";
  const fillButton = document.querySelector("#fill-payment-btn");
  const refundButton = document.querySelector("#refund-payment-btn");
  if (fillButton) {
    fillButton.textContent = `Settle Invoice #${label}`;
  }
  if (refundButton) {
    refundButton.textContent = `Refund Invoice #${label}`;
  }
}

function renderMerchantExperience() {
  renderMerchantInvoiceStage();
  renderMerchantJourney();
}

function renderCheckout(checkout, acceptedAssets) {
  const [merchant, settlementAsset, settlementAmount, expiresAt, active, checkoutRef] = checkout;
  state.checkoutSnapshot = {
    merchant,
    settlementAsset,
    settlementAmount,
    expiresAt,
    active,
    checkoutRef,
    acceptedAssets
  };

  const settlementMeta = getAssetMeta(settlementAsset);
  const quote = getCurrentQuoteOrNull();
  const inputMeta = getAssetMeta(quote?.inputAsset || zeroAddress);
  const journeyMeta = getJourneyMeta(state.journey.stage);
  const view = document.querySelector("#checkout-view");
  view.classList.remove("empty");
  view.innerHTML = `
    <div class="checkout-header">
      <div>
        <div class="checkout-pill ${active ? "live" : "paused"}">${active ? "Live invoice" : "Paused invoice"}</div>
        <h3>Supplier settlement sheet</h3>
        <p class="checkout-copy">This contract view proves the invoice can settle on-chain without turning the product into a swap screen.</p>
      </div>
      <div class="checkout-target">
        <span class="status-label">Supplier target</span>
        <div class="status-value">${formatAssetAmount(settlementAmount, settlementAsset)}</div>
      </div>
    </div>
    <div class="checkout-banner checkout-banner-${journeyMeta.tone}">
      <span>${journeyMeta.pill}</span>
      <strong>${journeyMeta.headline}</strong>
      <p>${journeyMeta.detail}</p>
    </div>
    <div class="checkout-grid">
      <div class="checkout-card">
        <span class="status-label">Supplier wallet</span>
        <div class="status-value compact">${merchant}</div>
      </div>
      <div class="checkout-card">
        <span class="status-label">Settlement rail</span>
        <div class="status-value">${settlementMeta.symbol}</div>
        <div class="status-meta compact">${settlementAsset}</div>
      </div>
      <div class="checkout-card">
        <span class="status-label">Invoice ref</span>
        <div class="status-value">${checkoutRef}</div>
      </div>
      <div class="checkout-card">
        <span class="status-label">Buyer remits</span>
        <div class="status-value">${quote ? formatAssetAmount(quote.inputAmount, quote.inputAsset) : "Load quote"}</div>
        <div class="status-meta compact">${inputMeta.symbol} buyer rail</div>
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

function setActionFeedback(message, tone = "info", title) {
  const box = document.querySelector("#action-feedback");
  if (!box) {
    return;
  }

  const resolvedTitle =
    title ||
    (tone === "danger"
      ? "Blocked"
      : tone === "warning"
        ? "Check This"
        : tone === "success"
          ? "Success"
          : "Ready");

  box.className = `action-feedback action-feedback-${tone}`;
  box.innerHTML = `<strong>${resolvedTitle}</strong><p>${message}</p>`;
}

function renderRouteRoles() {
  const container = document.querySelector("#route-roles");
  if (!container) {
    return;
  }

  const payer = state.demoConfig?.demoActors?.payer;
  const solver = state.demoConfig?.demoActors?.solver;
  const merchant = state.demoConfig?.demoActors?.merchant;
  const inputQuote = getCurrentQuoteOrNull();
  const inputMeta = getAssetMeta(inputQuote?.inputAsset || zeroAddress);
  const settlementMeta = getAssetMeta(inputQuote?.settlementAsset || zeroAddress);

  const roleState = (address) => {
    if (!address) {
      return "unknown";
    }

    if (!state.account) {
      return "idle";
    }

    return canonicalAddress(state.account) === canonicalAddress(address) ? "active" : "idle";
  };

  const roleCopy = (role, address, actionLine, assetLine) => `
    <article class="role-card role-card-${roleState(address)}">
      <span class="role-kicker">${role}</span>
      <strong>${address ? shorten(address) : "Not configured"}</strong>
      <p>${actionLine}</p>
      <small>${assetLine}</small>
    </article>
  `;

  container.innerHTML = `
    ${roleCopy("Buyer wallet", payer, "Approve the buyer asset and click Submit Buyer Pay-In.", `Uses ${inputMeta.symbol} on the buyer side`)}
    ${roleCopy("Desk wallet", solver, "Approve the desk asset and click Settle Invoice.", `Provides ${settlementMeta.symbol} to settle the invoice`)}
    ${roleCopy("Supplier wallet", merchant, "Receives the exact output when the invoice is settled.", `In this demo the supplier is ${merchant && payer && canonicalAddress(merchant) === canonicalAddress(payer) ? "the same as the buyer" : "separate from the buyer"}`)}
  `;
}

async function getPaymentSnapshot(paymentId) {
  const payment = await state.publicClient.readContract({
    address: state.contractAddress,
    abi: DOT_CHECKOUT_ABI,
    functionName: "getPayment",
    args: [paymentId]
  });

  const [
    checkoutId,
    merchant,
    payer,
    inputAsset,
    inputAmount,
    settlementAsset,
    settlementAmount,
    solver,
    fillDeadline,
    stateValue
  ] = payment;

  return {
    checkoutId,
    merchant,
    payer,
    inputAsset,
    inputAmount,
    settlementAsset,
    settlementAmount,
    solver,
    fillDeadline,
    state: stateValue
  };
}

function renderQuotePreview() {
  const preview = document.querySelector("#quote-preview");
  const raw = document.querySelector("#quote-json").value.trim();

  if (!raw) {
    preview.innerHTML = `<p class="muted">Paste a settlement quote to preview the invoice route here.</p>`;
    return;
  }

  try {
    const normalizedQuote = normalizeQuote(JSON.parse(raw));
    const inputMeta = getAssetMeta(normalizedQuote.inputAsset);
    const settlementMeta = getAssetMeta(normalizedQuote.settlementAsset);
    const journeyMeta = getJourneyMeta(state.journey.stage);
    const timing = getQuoteTimingState(normalizedQuote);
    const warningMarkup = timing.isQuoteExpired
      ? `
        <div class="preview-warning preview-warning-danger">
          <strong>Quote expired</strong>
          <p>Run <code>node scripts/signQuote.js --config docs/demo-config.latest.json --write docs/demo-config.latest.json</code> and reload the fresh signature before submitting.</p>
        </div>
      `
      : timing.isFillExpired
        ? `
          <div class="preview-warning preview-warning-warning">
            <strong>Fill deadline passed</strong>
            <p>The buyer quote may still display, but desk settlement is past deadline. Refresh the quote or refund the invoice.</p>
          </div>
        `
        : "";

    preview.innerHTML = `
      <div class="preview-status preview-status-${journeyMeta.tone}">
        <span>${journeyMeta.pill}</span>
        <strong>${journeyMeta.headline}</strong>
        <p>${journeyMeta.detail}</p>
      </div>
      ${warningMarkup}
      <div class="preview-header">
        <span class="section-title">Invoice Route</span>
        <h3>${formatAssetAmount(normalizedQuote.inputAmount, normalizedQuote.inputAsset)} -> ${formatAssetAmount(normalizedQuote.settlementAmount, normalizedQuote.settlementAsset)}</h3>
      </div>
      <div class="preview-route-row">
        <div class="preview-node">
          <span>Buyer in</span>
          <strong>${inputMeta.symbol}</strong>
          <p>${shorten(normalizedQuote.inputAsset)}</p>
        </div>
        <div class="preview-node">
          <span>Desk</span>
          <strong>${shorten(normalizedQuote.solver)}</strong>
          <p>settles exact output</p>
        </div>
        <div class="preview-node preview-node-success">
          <span>Supplier out</span>
          <strong>${settlementMeta.symbol}</strong>
          <p>${shorten(normalizedQuote.settlementAsset)}</p>
        </div>
      </div>
      <div class="preview-metrics">
        <div><span>Invoice</span><strong>#${normalizedQuote.checkoutId.toString()}</strong></div>
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

function setJourneyStage(stage, details = {}) {
  state.journey = {
    ...state.journey,
    ...details,
    stage,
    updatedAt: new Date().toISOString()
  };
  renderMerchantExperience();
  renderQuotePreview();
  if (state.checkoutSnapshot) {
    renderCheckout(
      [
        state.checkoutSnapshot.merchant,
        state.checkoutSnapshot.settlementAsset,
        state.checkoutSnapshot.settlementAmount,
        state.checkoutSnapshot.expiresAt,
        state.checkoutSnapshot.active,
        state.checkoutSnapshot.checkoutRef
      ],
      state.checkoutSnapshot.acceptedAssets
    );
  }
}

function getActivePaymentId() {
  return state.lastPaymentId || 1n;
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

function currentUnixTimestamp() {
  return Math.floor(Date.now() / 1000);
}

function getQuoteTimingState(quote) {
  const now = currentUnixTimestamp();
  return {
    now,
    isQuoteExpired: now > Number(quote.quoteExpiry),
    isFillExpired: now > Number(quote.fillDeadline)
  };
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

function getCurrentQuoteOrNull() {
  const raw = document.querySelector("#quote-json")?.value?.trim();
  if (!raw) {
    return null;
  }

  try {
    return normalizeQuote(JSON.parse(raw));
  } catch {
    return null;
  }
}

function getPaymentIdFromReceipt(receipt) {
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: DOT_CHECKOUT_ABI,
        data: log.data,
        topics: log.topics
      });

      if (decoded.eventName === "QuoteAccepted") {
        return decoded.args.paymentId;
      }
    } catch {
      // Ignore unrelated logs.
    }
  }

  return null;
}

function getInvoiceContext() {
  const quote = getCurrentQuoteOrNull() || normalizeQuote(sampleQuote);
  const snapshot = state.checkoutSnapshot;

  return {
    quote,
    inputAsset: quote.inputAsset,
    inputAmount: quote.inputAmount,
    settlementAsset: snapshot?.settlementAsset || quote.settlementAsset,
    settlementAmount: snapshot?.settlementAmount || quote.settlementAmount,
    merchant: snapshot?.merchant || "Supplier wallet not loaded yet",
    checkoutRef: snapshot?.checkoutRef || "INV-1042",
    acceptedAssets: snapshot?.acceptedAssets || state.assets.map((asset) => asset.address)
  };
}

function getJourneyMeta(stage) {
  const journeyByStage = {
    invoice_ready: {
      pill: "Invoice open",
      headline: "Waiting for buyer funding",
      detail: "The supplier has priced the invoice in their preferred asset and is ready to receive payment.",
      tone: "neutral"
    },
    payment_pending: {
      pill: "Buyer signing",
      headline: "Buyer pay-in is being submitted",
      detail: "The buyer is approving the pay-in leg so the invoice can move into settlement.",
      tone: "progress"
    },
    customer_paid: {
      pill: "Buyer paid",
      headline: "Buyer funds captured; desk settlement still running",
      detail: "The invoice is funded, and the desk now needs to deliver the supplier's exact output.",
      tone: "progress"
    },
    settlement_pending: {
      pill: "Settlement running",
      headline: "Desk is delivering the supplier payout",
      detail: "The supplier guarantee is being completed on-chain right now.",
      tone: "progress"
    },
    settled: {
      pill: "Paid",
      headline: "Invoice INV-1042 paid in full",
      detail: "The supplier received the exact settlement asset and amount they invoiced.",
      tone: "success"
    },
    refund_pending: {
      pill: "Refund running",
      headline: "Buyer refund is being submitted",
      detail: "The invoice is unwinding because the settlement window expired.",
      tone: "warning"
    },
    refunded: {
      pill: "Refunded",
      headline: "Buyer refunded; invoice can be reopened",
      detail: "Funds were returned to the buyer because exact settlement did not complete in time.",
      tone: "warning"
    }
  };

  return journeyByStage[stage] || journeyByStage.invoice_ready;
}

function getJourneySteps(stage, inputSymbol, settlementText) {
  const stepsByStage = {
    invoice_ready: ["current", "upcoming", "upcoming", "upcoming"],
    payment_pending: ["complete", "current", "upcoming", "upcoming"],
    customer_paid: ["complete", "complete", "current", "upcoming"],
    settlement_pending: ["complete", "complete", "current", "upcoming"],
    settled: ["complete", "complete", "complete", "complete"],
    refund_pending: ["complete", "complete", "current", "upcoming"],
    refunded: ["complete", "complete", "upcoming", "upcoming"]
  };

  const statuses = stepsByStage[stage] || stepsByStage.invoice_ready;

  return [
    {
      label: "Invoice issued",
      copy: "Supplier published Invoice INV-1042 and priced it in the settlement asset.",
      status: statuses[0]
    },
    {
      label: "Buyer funds invoice",
      copy: `Buyer pays with ${inputSymbol} instead of sourcing the supplier asset first.`,
      status: statuses[1]
    },
    {
      label: "Desk settles output",
      copy: `Desk routes value so the supplier still receives ${settlementText}.`,
      status: statuses[2]
    },
    {
      label: "Invoice marked settled",
      copy: "The business outcome is a settled supplier invoice, not just tokens moving between wallets.",
      status: statuses[3]
    }
  ];
}

function renderMerchantInvoiceStage() {
  const container = document.querySelector("#merchant-invoice-stage");
  if (!container) {
    return;
  }

  const context = getInvoiceContext();
  const inputMeta = getAssetMeta(context.inputAsset);
  const settlementMeta = getAssetMeta(context.settlementAsset);
  const journeyMeta = getJourneyMeta(state.journey.stage);
  const settlementText = formatAssetAmount(context.settlementAmount, context.settlementAsset);
  const inputText = formatAssetAmount(context.inputAmount, context.inputAsset);
  const acceptedSymbols = context.acceptedAssets.map((asset) => getAssetMeta(asset).symbol).join(" / ");

  container.innerHTML = `
    <article class="invoice-sheet invoice-sheet-${journeyMeta.tone}">
      ${state.journey.stage === "settled" ? '<div class="invoice-paid-stamp">PAID</div>' : ""}
      <div class="invoice-sheet-top">
        <div>
          <div class="invoice-status-pill invoice-status-pill-${journeyMeta.tone}">${journeyMeta.pill}</div>
          <h3>Monsoon Components Pte. Ltd.</h3>
          <p>Supplier invoice for a pilot parts shipment, settled through Portico on Polkadot Hub.</p>
        </div>
        <div class="invoice-total-card">
          <span>Total due</span>
          <strong>${settlementText}</strong>
          <small>priced in ${settlementMeta.symbol}</small>
        </div>
      </div>
      <div class="invoice-meta-grid">
        <div class="invoice-meta-card">
          <span>Invoice</span>
          <strong>INV-1042</strong>
        </div>
        <div class="invoice-meta-card">
          <span>Reference</span>
          <strong>${context.checkoutRef}</strong>
        </div>
        <div class="invoice-meta-card">
          <span>Buyer remits</span>
          <strong>${inputText}</strong>
        </div>
        <div class="invoice-meta-card">
          <span>Accepted rails</span>
          <strong>${acceptedSymbols}</strong>
        </div>
      </div>
      <div class="invoice-line-list">
        <div class="invoice-line-item">
          <div>
            <span>Precision sensor batch A17</span>
            <small>Supplier invoice with exact-output settlement</small>
          </div>
          <strong>${settlementText}</strong>
        </div>
        <div class="invoice-line-item invoice-line-item-subtle">
          <div>
            <span>Buyer pay-in rail</span>
            <small>Buyer-side funding asset</small>
          </div>
          <strong>${inputMeta.symbol}</strong>
        </div>
      </div>
      <div class="invoice-banner invoice-banner-${journeyMeta.tone}">
        <span>${journeyMeta.pill}</span>
        <strong>${journeyMeta.headline}</strong>
        <p>${journeyMeta.detail}</p>
      </div>
    </article>
  `;
}

function renderMerchantJourney() {
  const container = document.querySelector("#merchant-journey");
  if (!container) {
    return;
  }

  const context = getInvoiceContext();
  const journeyMeta = getJourneyMeta(state.journey.stage);
  const steps = getJourneySteps(
    state.journey.stage,
    getAssetMeta(context.inputAsset).symbol,
    formatAssetAmount(context.settlementAmount, context.settlementAsset)
  );

  const txItems = [
    state.journey.payerHash
      ? `<div class="journey-tx"><span>Buyer pay-in tx</span><strong>${shorten(state.journey.payerHash)}</strong></div>`
      : "",
    state.journey.solverHash
      ? `<div class="journey-tx"><span>Desk settlement tx</span><strong>${shorten(state.journey.solverHash)}</strong></div>`
      : "",
    state.journey.refundHash
      ? `<div class="journey-tx"><span>Refund tx</span><strong>${shorten(state.journey.refundHash)}</strong></div>`
      : ""
  ]
    .filter(Boolean)
    .join("");

  container.innerHTML = `
    <div class="journey-status journey-status-${journeyMeta.tone}">
      <span>${journeyMeta.pill}</span>
      <strong>${journeyMeta.headline}</strong>
      <p>${journeyMeta.detail}</p>
    </div>
    <div class="journey-steps">
      ${steps
        .map(
          (step, index) => `
            <div class="journey-step journey-step-${step.status}">
              <div class="journey-step-index">${index + 1}</div>
              <div class="journey-step-body">
                <h3>${step.label}</h3>
                <p>${step.copy}</p>
              </div>
            </div>
          `
        )
        .join("")}
    </div>
    ${
      txItems
        ? `
      <div class="journey-transactions">
        ${txItems}
      </div>
    `
        : ""
    }
  `;
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
