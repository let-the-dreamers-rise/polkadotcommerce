require("dotenv").config();
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

const DEFAULT_RPC_URL = "https://services.polkadothub-rpc.com/testnet";
const LOCAL_RPC_URL = "http://127.0.0.1:8545";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function getEnvNumber(name, fallback) {
  const value = process.env[name];
  return value ? Number(value) : fallback;
}

function getEnvBigInt(name, fallback) {
  const value = process.env[name];
  return value ? BigInt(value) : fallback;
}

function getConfigPath() {
  const configured = process.env.FRONTEND_CONFIG_PATH || "docs/demo-config.latest.json";
  return path.resolve(process.cwd(), configured);
}

function getPublicConfigPath() {
  return path.resolve(process.cwd(), "public/demo-config.latest.json");
}

async function resolveQuoteSigner(deployer, fallbackQuoteSigner) {
  const explicitQuoteKey = process.env.QUOTE_SIGNER_PRIVATE_KEY;
  if (explicitQuoteKey) {
    return new hre.ethers.Wallet(explicitQuoteKey, hre.ethers.provider);
  }

  if (process.env.QUOTE_SIGNER_ADDRESS) {
    console.warn(
      "QUOTE_SIGNER_ADDRESS is set without QUOTE_SIGNER_PRIVATE_KEY. Falling back to the deployer/fallback signer for quote signing."
    );
  }

  return fallbackQuoteSigner || deployer;
}

async function main() {
  const [deployer, fallbackQuoteSigner] = await hre.ethers.getSigners();
  const quoteSigner = await resolveQuoteSigner(deployer, fallbackQuoteSigner);
  const network = await hre.ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  const rpcUrl =
    process.env.POLKADOT_HUB_RPC_URL ||
    (hre.network.name === "localhost" || hre.network.name === "hardhat" ? LOCAL_RPC_URL : DEFAULT_RPC_URL);

  const settlementAmount = getEnvBigInt("DEMO_SETTLEMENT_AMOUNT", 100_000000n);
  const inputAmount = getEnvBigInt("DEMO_INPUT_AMOUNT", 105_000000n);
  const checkoutLifetime = getEnvNumber("DEMO_CHECKOUT_LIFETIME_SECONDS", 60 * 60 * 24 * 7);
  const quoteLifetime = getEnvNumber("DEMO_QUOTE_LIFETIME_SECONDS", 60 * 60 * 24);
  const fillLifetime = getEnvNumber("DEMO_FILL_LIFETIME_SECONDS", 60 * 60 * 48);
  const payerAddress = process.env.DEMO_PAYER_ADDRESS || deployer.address;
  const solverAddress = process.env.DEMO_SOLVER_ADDRESS || deployer.address;
  const checkoutRef = process.env.DEMO_CHECKOUT_REF || `dotcheckout-${Date.now()}`;
  const configPath = getConfigPath();
  const publicConfigPath = getPublicConfigPath();

  console.log(`Deploying with ${deployer.address}`);
  console.log(`Quote signer: ${quoteSigner.address}`);

  const DotCheckout = await hre.ethers.getContractFactory("DotCheckout");
  const dotCheckout = await DotCheckout.deploy(deployer.address, quoteSigner.address);
  await dotCheckout.waitForDeployment();

  const XcmDispatcher = await hre.ethers.getContractFactory("XcmDispatcher");
  const xcmDispatcher = await XcmDispatcher.deploy(deployer.address);
  await xcmDispatcher.waitForDeployment();

  const MockERC20 = await hre.ethers.getContractFactory("MockERC20");
  const usdt = await MockERC20.deploy("Mock USDT", "USDT", 6);
  const usdc = await MockERC20.deploy("Mock USDC", "USDC", 6);
  await usdt.waitForDeployment();
  await usdc.waitForDeployment();

  const usdtAddress = await usdt.getAddress();
  const usdcAddress = await usdc.getAddress();
  const dotCheckoutAddress = await dotCheckout.getAddress();
  const xcmDispatcherAddress = await xcmDispatcher.getAddress();

  const mintTarget = settlementAmount * 20n;
  const inputMintTarget = inputAmount * 20n;

  await (await usdt.mint(payerAddress, inputMintTarget)).wait();
  await (await usdc.mint(solverAddress, mintTarget)).wait();
  await (await usdc.mint(deployer.address, mintTarget)).wait();

  const latestBlock = await hre.ethers.provider.getBlock("latest");
  const now = Number(latestBlock.timestamp);
  const checkoutExpiry = now + checkoutLifetime;
  const quoteExpiry = now + quoteLifetime;
  const fillDeadline = Math.max(quoteExpiry + 60, now + fillLifetime);

  await (
    await dotCheckout.createCheckout(
      usdcAddress,
      settlementAmount,
      checkoutExpiry,
      checkoutRef,
      [usdcAddress, usdtAddress]
    )
  ).wait();

  const quote = {
    checkoutId: 1n,
    inputAsset: usdtAddress,
    inputAmount,
    settlementAsset: usdcAddress,
    settlementAmount,
    solver: solverAddress,
    quoteExpiry: BigInt(quoteExpiry),
    fillDeadline: BigInt(fillDeadline),
    salt: hre.ethers.hexlify(hre.ethers.randomBytes(32))
  };

  const domain = {
    name: "DotCheckout",
    version: "1",
    chainId,
    verifyingContract: dotCheckoutAddress
  };

  const types = {
    Quote: [
      { name: "checkoutId", type: "uint256" },
      { name: "inputAsset", type: "address" },
      { name: "inputAmount", type: "uint256" },
      { name: "settlementAsset", type: "address" },
      { name: "settlementAmount", type: "uint256" },
      { name: "solver", type: "address" },
      { name: "quoteExpiry", type: "uint64" },
      { name: "fillDeadline", type: "uint64" },
      { name: "salt", type: "bytes32" }
    ]
  };

  const signature = await quoteSigner.signTypedData(domain, types, quote);

  const frontendConfig = {
    network: {
      name: hre.network.name,
      chainId,
      rpcUrl,
      nativeSymbol: "PAS"
    },
    contractAddress: dotCheckoutAddress,
    xcmDispatcherAddress,
    checkoutId: "1",
    checkoutRef,
    assets: [
      {
        label: "Paseo",
        kind: "Gas rail",
        symbol: "PAS",
        decimals: 18,
        address: ZERO_ADDRESS,
        note: "Native Polkadot Hub TestNet gas asset"
      },
      {
        label: "Demo USDT",
        kind: "Buyer asset",
        symbol: "USDT",
        decimals: 6,
        address: usdtAddress,
        note: "Deploy script minted this asset for the configured payer wallet"
      },
      {
        label: "Demo USDC",
        kind: "Settlement target",
        symbol: "USDC",
        decimals: 6,
        address: usdcAddress,
        note: "Deploy script minted this asset for the configured solver wallet"
      }
    ],
    quote: {
      checkoutId: quote.checkoutId.toString(),
      inputAsset: quote.inputAsset,
      inputAmount: quote.inputAmount.toString(),
      settlementAsset: quote.settlementAsset,
      settlementAmount: quote.settlementAmount.toString(),
      solver: quote.solver,
      quoteExpiry: quote.quoteExpiry.toString(),
      fillDeadline: quote.fillDeadline.toString(),
      salt: quote.salt
    },
    signature,
    demoActors: {
      merchant: deployer.address,
      payer: payerAddress,
      solver: solverAddress,
      quoteSigner: quoteSigner.address
    },
    demoApprovals: {
      payerNeedsToApprove: usdtAddress,
      solverNeedsToApprove: usdcAddress
    }
  };

  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(frontendConfig, null, 2)}\n`);
  fs.mkdirSync(path.dirname(publicConfigPath), { recursive: true });
  fs.writeFileSync(publicConfigPath, `${JSON.stringify(frontendConfig, null, 2)}\n`);

  console.log("");
  console.log("Contracts");
  console.log(`DotCheckout: ${dotCheckoutAddress}`);
  console.log(`XcmDispatcher: ${xcmDispatcherAddress}`);
  console.log(`Mock USDT: ${usdtAddress}`);
  console.log(`Mock USDC: ${usdcAddress}`);
  console.log("");
  console.log("Demo Actors");
  console.log(`Merchant / deployer: ${deployer.address}`);
  console.log(`Configured payer: ${payerAddress}`);
  console.log(`Configured solver: ${solverAddress}`);
  console.log("");
  console.log(`Checkout #1 created with ref: ${checkoutRef}`);
  console.log(`Frontend config written to: ${configPath}`);
  console.log(`Public config written to: ${publicConfigPath}`);
  console.log("");
  console.log("Paste this into the app:");
  console.log(JSON.stringify(frontendConfig, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
