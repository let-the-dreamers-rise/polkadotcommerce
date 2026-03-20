# Portico

Portico is an APAC supplier-settlement protocol on Polkadot Hub.

The product story is simple:

- a supplier invoices in `100 USDC`
- a buyer pays with `USDT`
- a settlement desk completes the route
- the supplier still receives exactly `100 USDC`

Portico is the product brand. The on-chain settlement engine in this repo is still [`contracts/DotCheckout.sol`](C:\Users\ASHWIN GOYAL\OneDrive\Desktop\polkadot\contracts\DotCheckout.sol), because we kept the working contract flow and pivoted the product into a stronger B2B narrative.

## Why Portico Exists

Cross-border suppliers should not need to:

- reject buyers because they hold the wrong asset
- manage FX and conversion risk at the moment of payment
- turn invoice collection into a manual swap workflow

Portico fixes that by turning Polkadot Hub into a supplier settlement surface. Buyers pay with a supported asset. Suppliers still settle in the stablecoin they invoiced in.

## What Makes This Different

- This is not a wallet-to-wallet transfer demo. It starts with a supplier invoice and ends with an invoice marked settled.
- This is not a DEX front end. Routing stays behind the scenes in a signed quote and a desk settlement step.
- This is not a generic payment gateway. The value is exact supplier settlement, not just token movement.
- This is legible in seconds: buyer pays `USDT`, supplier receives `100 USDC`, invoice closes.

## What Is Live In This MVP

1. A supplier settlement request is created on-chain.
2. A quote signer signs an off-chain exact-settlement quote.
3. The buyer submits the pay-in against that quote.
4. If the buyer used the supplier asset, settlement can be direct.
5. If the buyer used another supported asset, the desk settles the supplier output.
6. If settlement misses the deadline, a refund path exists.

## Repo Map

- `contracts/DotCheckout.sol`: exact-settlement engine with quote verification, direct settlement, desk settlement, and refunds
- `contracts/XcmDispatcher.sol`: XCM precompile wrapper for the Polkadot-native expansion story
- `contracts/mock/MockERC20.sol`: local mock assets
- `scripts/deploy.js`: deploys contracts, mints demo assets, creates invoice `#1`, and writes demo config
- `scripts/signQuote.js`: signs or refreshes the live settlement quote
- `src/main.js`: Portico product UI
- `src/style.css`: Portico visual system
- `docs/demo-script.md`: live and recorded demo script
- `docs/first-prize-plan.md`: submission framing

## Quick Start

```bash
npm install
npm run compile
npm run test
npm run dev
```

## Demo Roles

- `PRIVATE_KEY`: operator wallet used for deploy
- `QUOTE_SIGNER_PRIVATE_KEY`: quote signer for the off-chain settlement quote
- `DEMO_PAYER_ADDRESS`: buyer wallet that submits the pay-in
- `DEMO_SOLVER_ADDRESS`: desk wallet that settles the invoice

Use fresh testnet wallets only.

## Deploy To Polkadot Hub TestNet

1. Create the env file:

```bash
copy .env.example .env
```

2. Fill in:

- `PRIVATE_KEY`
- `QUOTE_SIGNER_PRIVATE_KEY`
- `DEMO_PAYER_ADDRESS`
- `DEMO_SOLVER_ADDRESS`
- `POLKADOT_HUB_RPC_URL=https://services.polkadothub-rpc.com/testnet`

3. Fund the operator wallet with `PAS`.

4. Run:

```bash
npm run compile
npm run test
npm run deploy:hub
```

That deployment flow:

- deploys the settlement engine and XCM dispatcher
- deploys mock `USDT` and `USDC`
- creates invoice `#1`
- mints demo assets to the buyer and desk wallets
- generates a signed quote
- writes [`docs/demo-config.latest.json`](C:\Users\ASHWIN GOYAL\OneDrive\Desktop\polkadot\docs\demo-config.latest.json)

5. Open the app, go to `Treasury Desk`, and apply the config.

6. Live run:

- connect buyer wallet
- click `Approve Buyer Asset`
- click `Submit Buyer Pay-In`
- switch to desk wallet
- click `Approve Desk Asset`
- click `Settle Invoice`

## Polkadot-Specific Edge

- Hub TestNet RPC: `https://services.polkadothub-rpc.com/testnet`
- Chain ID: `420420417`
- Native asset: `PAS`
- ERC20 precompiles let Hub assets behave like standard ERC20 rails
- XCM precompile gives Portico a credible path to cross-parachain settlement

Official references:

- [Connect to Polkadot](https://docs.polkadot.com/develop/networks)
- [ERC20 Precompile](https://docs.polkadot.com/smart-contracts/precompiles/erc20/)
- [XCM Precompile](https://docs.polkadot.com/smart-contracts/precompiles/xcm/)
- [Use Hardhat with Polkadot Hub](https://docs.polkadot.com/develop/smart-contracts/dev-environments/hardhat)

## The Submission Frame

Use this line:

**Others move value. Portico closes supplier invoices.**

And this one:

**Buyers pay with what they hold. Suppliers settle in what they invoice.**
