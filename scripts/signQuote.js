require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

function getArg(name, fallback) {
  const flag = `--${name}`;
  const index = process.argv.indexOf(flag);
  if (index === -1 || index === process.argv.length - 1) {
    return fallback;
  }

  return process.argv[index + 1];
}

function loadConfigFile(configPath) {
  if (!configPath) {
    return null;
  }

  const resolvedPath = path.resolve(process.cwd(), configPath);
  return JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
}

async function main() {
  const config = loadConfigFile(getArg("config"));
  const privateKey = process.env.QUOTE_SIGNER_PRIVATE_KEY || process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("Set QUOTE_SIGNER_PRIVATE_KEY or PRIVATE_KEY in .env");
  }

  const contractAddress = getArg("contract", config?.contractAddress);
  if (!contractAddress) {
    throw new Error("Missing --contract <address> or --config <path>");
  }

  const rpcUrl =
    process.env.POLKADOT_HUB_RPC_URL ||
    config?.network?.rpcUrl ||
    "https://services.polkadothub-rpc.com/testnet";
  const chainId = Number(
    getArg("chain-id", `${process.env.POLKADOT_HUB_CHAIN_ID || config?.network?.chainId || 420420417}`)
  );

  const wallet = new ethers.Wallet(privateKey, new ethers.JsonRpcProvider(rpcUrl));
  const sourceQuote = config?.quote || {};

  if (
    config?.demoActors?.quoteSigner &&
    config.demoActors.quoteSigner.toLowerCase() !== wallet.address.toLowerCase()
  ) {
    throw new Error(
      `Configured quote signer mismatch: expected ${config.demoActors.quoteSigner}, got ${wallet.address}`
    );
  }

  const quote = {
    checkoutId: BigInt(getArg("checkout", sourceQuote.checkoutId || "1")),
    inputAsset: getArg("input-asset", sourceQuote.inputAsset || ethers.ZeroAddress),
    inputAmount: BigInt(getArg("input-amount", sourceQuote.inputAmount || "100000000")),
    settlementAsset: getArg("settlement-asset", sourceQuote.settlementAsset || ethers.ZeroAddress),
    settlementAmount: BigInt(getArg("settlement-amount", sourceQuote.settlementAmount || "100000000")),
    solver: getArg("solver", sourceQuote.solver || ethers.ZeroAddress),
    quoteExpiry: BigInt(
      getArg("quote-expiry", sourceQuote.quoteExpiry || `${Math.floor(Date.now() / 1000) + 900}`)
    ),
    fillDeadline: BigInt(
      getArg("fill-deadline", sourceQuote.fillDeadline || `${Math.floor(Date.now() / 1000) + 3600}`)
    ),
    salt: getArg("salt", sourceQuote.salt || ethers.hexlify(ethers.randomBytes(32)))
  };

  const domain = {
    name: "DotCheckout",
    version: "1",
    chainId,
    verifyingContract: contractAddress
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

  const signature = await wallet.signTypedData(domain, types, quote);
  const payload = {
    ...(config || {}),
    contractAddress,
    quote: {
      ...sourceQuote,
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
    signer: wallet.address,
    signature
  };

  const writeTarget = getArg("write");
  if (writeTarget) {
    const resolvedWritePath = path.resolve(process.cwd(), writeTarget);
    fs.mkdirSync(path.dirname(resolvedWritePath), { recursive: true });
    fs.writeFileSync(resolvedWritePath, `${JSON.stringify(payload, null, 2)}\n`);
  }

  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
