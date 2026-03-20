# DotCheckout Demo Script

## What Judges Need To Feel

Judges for the Polkadot Solidity Hackathon are explicitly scoring on:

- technical implementation
- use of Polkadot Hub features
- innovation and impact
- UX and adoption potential
- team execution and presentation

This demo is built to hit all five in under three minutes.

## The Big Idea

One sentence:

"DotCheckout lets a buyer pay with the asset they hold while the merchant receives the exact asset and amount they asked for on Polkadot Hub."

One contrast line:

"Most crypto payments make the merchant absorb route complexity. DotCheckout hides that complexity and guarantees exact output."

## Demo Setup

Have these ready before you go live:

- app open on the `Deploy Guide` tab
- `docs/demo-config.latest.json` available
- payer wallet funded and connected to Polkadot Hub TestNet
- solver wallet funded and connected to Polkadot Hub TestNet
- fallback screenshot or screen recording in case RPC latency spikes

## 150-Second Live Script

### 0:00 - 0:20

Say:

"We built DotCheckout because merchants should not have to care which asset the customer starts with. They should simply ask for exact settlement, and Polkadot Hub should handle the rest."

Click:

- open the app hero
- switch to `Merchant Console`

### 0:20 - 0:45

Say:

"Here the merchant asks for exactly 100 USDC. The buyer can come in with PAS or USDT, but the merchant still receives the exact target output."

Show:

- the merchant target card
- supported rails
- the loaded checkout

Land this line:

"This is not a swap UI. It is a commerce product with an exact-settlement guarantee."

### 0:45 - 1:15

Say:

"Now I’ll load the real deployed config from Polkadot Hub TestNet. This includes the contract, checkout, assets, and a signed route quote."

Click:

- `Deploy Guide`
- paste `docs/demo-config.latest.json`
- click `Apply Demo Config`

Narrate:

"The deploy flow already created checkout number one, minted demo assets, and generated a signed EIP-712 quote."

### 1:15 - 1:45

Say:

"The buyer is paying with USDT, while the merchant wants USDC. The quote is signed off-chain, but settlement guarantees are enforced on-chain."

Click:

- `Route Lab`
- connect payer wallet
- click `Approve Input Asset`
- click `Submit Payment`

Call out:

"At this point the payment is accepted, but final settlement still requires the solver to deliver the merchant’s exact output."

### 1:45 - 2:15

Say:

"Now the solver completes settlement. The merchant gets 100 USDC, and the solver receives the buyer’s input asset. This is how we separate merchant UX from route execution."

Click:

- switch wallet to solver
- click `Approve Settlement Asset`
- click `Fill Payment #1`

Then point at:

- merchant output
- ops log
- quote preview

Say:

"That is exact-output settlement on Polkadot Hub."

### 2:15 - 2:45

Say:

"Why Polkadot? Because assets, precompiles, and cross-chain execution are native here. Today this MVP proves same-chain exact settlement. Next, the same merchant UX expands to XCM-backed settlement across parachains."

Point to:

- `Settlement Edge`
- `XcmDispatcher`

Close with:

"We are not another lending fork or AI wrapper. We are payment infrastructure that feels native to Polkadot."

## 60-Second Video Version

If you need the tight recorded version:

1. Open on the hero and say the one-line pitch.
2. Show merchant wants `100 USDC`.
3. Paste deploy config and apply it.
4. Show the quote: buyer pays `105 USDT`, merchant gets `100 USDC`.
5. Approve input asset and submit payment.
6. Switch to solver, approve settlement asset, fill payment.
7. End on exact merchant settlement and the XCM expansion line.

## What To Say If Judges Ask "Why Is This Special?"

"Because we are packaging Polkadot Hub's native strengths into a product users actually understand. We use Solidity contracts for guarantees, signed quotes for routing, ERC20-style asset handling for Hub assets, and an XCM path for cross-chain settlement."

## What To Say If Judges Ask "Will Judges Need To Use It Themselves?"

No. The safest primary path is:

- you present it live on Demo Day
- you submit a 1 to 3 minute demo video
- you include the open-source repo
- you include a short setup note in the README

Judges usually evaluate the product through your presentation and video first. If they try it later, give them a single happy path, not a sandbox of options.

## Demo-Day Rules For Ourselves

- never start with contracts
- never start with architecture
- never make the judge read JSON first
- open with merchant value
- show one clean payment
- end with Polkadot-native expansion

## Backup Plan If Something Breaks

If RPC is slow or a wallet pop-up stalls:

- show the already-loaded config
- show the signed quote
- show the contract addresses
- narrate the exact settlement path
- fall back to a recorded 60-second successful run

The backup line:

"The product logic is deployed live on Polkadot Hub TestNet. To protect the demo flow from wallet and RPC latency, I also prepared a recorded execution of the same path."
