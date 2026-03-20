# First-Prize Plan

## Product Positioning

DotCheckout is not a DeFi protocol. It is merchant infrastructure for the Polkadot economy.

The framing should always be:

- buyers start with any supported parachain asset
- merchants receive the asset they actually want
- Polkadot Hub is the settlement layer because XCM and native assets are built in

## What Judges Need To See

- A real merchant pain point, not a crypto-native toy.
- A working checkout contract with security boundaries.
- A reason this belongs on Polkadot Hub specifically.
- A roadmap from MVP to ecosystem-wide infrastructure.

## Demo Priorities

1. Create a checkout request for `100 USDC`.
2. Show a buyer paying with `USDT`.
3. Show the route engine quote already signed.
4. Execute the buyer payment.
5. Execute the solver fill.
6. Show the merchant receiving exactly `100 USDC`.
7. End with the XCM dispatcher and explain how this becomes cross-parachain settlement.

## What To Avoid Saying

- "It's like another DEX."
- "We'll add product-market fit later."
- "AI will optimize everything."
- "This is just a payment gateway."

## What To Say Instead

- "We remove asset friction from commerce on Polkadot."
- "Merchants should not care which asset the customer starts with."
- "Polkadot Hub gives us a native settlement surface plus an upgrade path to XCM execution."
- "The EVM contract handles payment guarantees while the routing layer can evolve independently."

