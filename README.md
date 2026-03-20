# DotCheckout

DotCheckout is a Polkadot Hub checkout rail that lets merchants accept one supported asset and settle in another. The MVP is designed for the Polkadot Solidity Hackathon and optimized for a first-prize style demo: one clean merchant flow, one real contract, and a story that only makes sense on Polkadot.

## Why This Has A Shot At First Prize

- It is not another lending market, stablecoin, or AI wrapper.
- The product value is obvious in one sentence: pay with one asset, settle in another.
- It uses Polkadot Hub's edge: foreign assets, ERC20 precompiles, and a path to XCM-backed settlement.
- The demo can be shown in under two minutes.
- The architecture naturally extends into a hybrid `EVM + PVM` story.

## MVP Flow

1. A merchant creates a checkout request with a preferred settlement asset and amount.
2. A route engine signs an off-chain quote for a payer's chosen input asset.
3. The payer submits the quote and pays with the quoted asset.
4. If the payer used the merchant's preferred asset, the checkout settles instantly.
5. If the payer used a different supported asset, a solver finalizes settlement and receives the payer's asset in return.

This "solver fill" flow is deliberate. It keeps the contract simple and demoable while still matching how real routing systems work.

## What Is In This Repo

- `contracts/DotCheckout.sol`: checkout contract with quote verification, direct settlement, solver settlement, and refunds.
- `contracts/XcmDispatcher.sol`: wrapper around the Polkadot Hub XCM precompile so the project can tell a credible hybrid story.
- `contracts/mock/MockERC20.sol`: local testing asset.
- `scripts/deploy.js`: deploys the contracts.
- `scripts/signQuote.js`: signs a checkout quote for the frontend or demo script.
- `test/DotCheckout.js`: core happy-path and refund tests.
- `index.html` + `src/*`: a lightweight frontend shell for the pitch and demo.
- `docs/`: pitch assets for judges.

## Polkadot-Specific Notes

- Polkadot Hub TestNet RPC: `https://services.polkadothub-rpc.com/testnet`
- Polkadot Hub TestNet chain ID: `420420417`
- The ERC20 precompile lets contracts treat registered assets like standard ERC20 tokens.
- The XCM precompile lives at `0x00000000000000000000000000000000000a0000`

These details are based on the official Polkadot Developer Docs:

- [Connect to Polkadot](https://docs.polkadot.com/develop/networks)
- [ERC20 Precompile](https://docs.polkadot.com/smart-contracts/precompiles/erc20/)
- [XCM Precompile](https://docs.polkadot.com/smart-contracts/precompiles/xcm/)
- [Use Hardhat with Polkadot Hub](https://docs.polkadot.com/develop/smart-contracts/dev-environments/hardhat)

## Quick Start

```bash
npm install
npm run compile
npm run test
npm run dev
```

## Where The Keys Come From

You create these yourself. They are not issued by Polkadot.

- `PRIVATE_KEY`: export the private key of a throwaway MetaMask testnet wallet that will deploy the contracts.
- `QUOTE_SIGNER_PRIVATE_KEY`: export the private key of a second throwaway wallet that signs checkout quotes.

For hackathon speed, you can reuse the same wallet for both values, but two wallets looks cleaner in the demo.

Use only fresh testnet wallets here. Never paste a mainnet wallet private key into this repo.

## Deploy To Polkadot Hub TestNet

1. Create your env file:

```bash
copy .env.example .env
```

2. Fill in:

- `PRIVATE_KEY`: deployer wallet private key
- `QUOTE_SIGNER_PRIVATE_KEY`: signer used for EIP-712 checkout quotes
- `POLKADOT_HUB_RPC_URL`: keep `https://services.polkadothub-rpc.com/testnet` unless you have another endpoint
- `DEMO_PAYER_ADDRESS`: wallet that will submit `payWithQuote`
- `DEMO_SOLVER_ADDRESS`: wallet that will call `fillPayment`

3. Fund the deployer wallet with testnet `PAS`.

4. Compile and test locally:

```bash
npm run compile
npm run test
```

5. Deploy:

```bash
npm run deploy:hub
```

This now does all of this in one run:

- `DotCheckout` contract address
- `XcmDispatcher` contract address
- mock `USDT` and `USDC` addresses
- creates checkout `#1`
- mints demo assets to the configured payer and solver wallets
- generates a signed demo quote
- writes `docs/demo-config.latest.json`
- prints the same config JSON for the frontend

6. Open the app and run:

- open the `Deploy Guide` tab
- paste the printed JSON or the contents of `docs/demo-config.latest.json`
- click `Apply Demo Config`
- switch MetaMask to Polkadot Hub TestNet
- connect the payer wallet and click `Approve Input Asset`
- submit the payment
- connect the solver wallet and click `Approve Settlement Asset`
- fill the payment

7. For MetaMask network setup, use:

- Network name: `Polkadot Hub TestNet`
- RPC URL: `https://services.polkadothub-rpc.com/testnet`
- Chain ID: `420420417`
- Currency symbol: `PAS`

If you need to refresh the quote later, you can still run:

```bash
node scripts/signQuote.js --config docs/demo-config.latest.json
```

## First-Prize Positioning

DotCheckout should be pitched as payment infrastructure, not DeFi.

The story for judges is:

- Merchants should not care which parachain asset the user starts with.
- Polkadot Hub is the right settlement surface because assets can land there natively and interoperate through XCM.
- A hybrid version uses EVM for merchant UX and settlement guarantees, while a PVM quote engine or XCM builder finds routes and prepares encoded cross-chain messages.

## Suggested Demo

1. Create a checkout for `100 USDT`.
2. Show the buyer choosing a different supported asset.
3. Submit a signed quote from the route engine.
4. Trigger the payment.
5. Fill the payment from the solver account.
6. Show the merchant receiving exactly `100 USDT`.
7. Close with the XCM dispatcher as the bridge from local checkout logic to cross-chain execution.
