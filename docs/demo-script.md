# Portico Demo Script

## One-Line Pitch

**"Portico lets buyers pay with what they hold while suppliers settle in exactly what they invoiced."**

## 75-Second Final Script

Use this if you only want one script for both submission and rehearsal.

### 0:00 - 0:12

**"This is Portico, a supplier settlement protocol on Polkadot Hub. Buyers pay with the asset they already hold, while suppliers still settle in exactly what they invoiced."**

### 0:12 - 0:25

Show `Supplier Desk`.

**"Here, Monsoon Components issued invoice `INV-1042` for exactly `100 USDC`. The supplier does not care what asset the buyer starts with. They care about settling in the stablecoin they priced in."**

### 0:25 - 0:43

Show `Buyer Pay-In`.

**"The buyer does not hold USDC, so they fund the invoice with `105 USDT` instead. Portico captures that buyer pay-in against a signed quote on Polkadot Hub."**

### 0:43 - 0:58

Switch to the desk wallet and settle.

**"Then the settlement desk completes the exact-output leg, so the supplier treasury never has to manage conversion complexity during collection."**

### 0:58 - 1:15

Show the paid state.

**"The buyer paid with USDT. The supplier still received exactly `100 USDC`. That is the difference between Portico and a simple transfer. Others move value. Portico closes supplier invoices."**

## Win Condition

By the first 20 seconds, judges should understand:

- this is a supplier invoice product, not a transfer toy
- the buyer funds the invoice with a different asset
- the supplier still receives exact stable settlement

## Clean Demo Order

1. `Overview`
2. `Supplier Desk`
3. `Buyer Pay-In`
4. done

Do not wander into `Treasury Desk` during the main pitch.

## 130-Second Live Script

### 0:00 - 0:15

Say:

**"Cross-border suppliers should not have to reject buyers for holding the wrong asset, and they should not manage FX risk at the moment of payment. Portico fixes that."**

Then:

**"The buyer pays with what they hold. The supplier settles in what they invoiced."**

### 0:15 - 0:40

Open `Supplier Desk`.

Say:

**"Here is the business moment. Monsoon Components issued invoice `INV-1042` for exactly `100 USDC`."**

Point at:

- invoice total
- buyer remits amount
- accepted rails
- supplier target

Then say:

**"The supplier experience is simple: price once in the stablecoin you want, and receive exactly that amount when the invoice settles."**

### 0:40 - 1:05

Open `Buyer Pay-In`.

Connect the buyer wallet if needed.

Click:

- `Approve Buyer Asset`
- `Submit Buyer Pay-In`

Say:

**"The buyer does not need to source the supplier's settlement asset first. They can fund the invoice with the asset they already hold."**

Then:

**"Portico captures the buyer pay-in against a signed quote and moves the invoice into settlement."**

### 1:05 - 1:30

Switch to the desk wallet.

Click:

- `Approve Desk Asset`
- `Settle Invoice`

Say:

**"Now the settlement desk completes the exact-output leg. This is where the complexity lives, not in the supplier treasury workflow."**

Point at:

- role cards
- route preview
- settlement or paid state

### 1:30 - 1:50

Land this line:

**"The buyer paid with USDT. The supplier still settled in exactly 100 USDC."**

Then:

**"That is the difference between Portico and a simple transfer. A transfer moves tokens. Portico closes supplier invoices with exact settlement."**

### 1:50 - 2:10

Close with Polkadot:

**"Portico belongs on Polkadot Hub because Hub gives us Solidity, asset-aware settlement rails, ERC20 precompiles, and a real path to XCM expansion."**

Final line:

**"Others move value. Portico closes supplier invoices."**

## 60-Second Submission Video

### 0:00 - 0:10

**"This is Portico, a supplier settlement protocol on Polkadot Hub."**

### 0:10 - 0:20

Show `Supplier Desk`.

**"The supplier issued invoice `INV-1042` for exactly `100 USDC`."**

### 0:20 - 0:35

Show `Buyer Pay-In`.

**"The buyer does not hold USDC. They fund the invoice with `105 USDT` instead."**

### 0:35 - 0:50

Show buyer pay-in and desk settlement.

**"Portico captures the buyer pay-in, then the desk completes exact settlement."**

### 0:50 - 1:00

Show final success state.

**"The supplier still receives exactly `100 USDC`. That is Portico."**

## Exact Click Map

1. Start on `Overview`
2. Say the one-line pitch
3. Open `Supplier Desk`
4. Point to invoice `INV-1042`
5. Open `Buyer Pay-In`
6. Connect buyer wallet
7. Click `Approve Buyer Asset`
8. Click `Submit Buyer Pay-In`
9. Switch to desk wallet
10. Click `Approve Desk Asset`
11. Click `Settle Invoice`
12. End on the paid invoice state

## If Judges Interrupt

### "How is this different from just sending money?"

**"A transfer moves a token. Portico closes a supplier invoice with exact settlement in the supplier's preferred asset, even when the buyer starts with a different asset."**

### "Why is the desk involved?"

**"Because the supplier treasury should stay simple. Portico pushes routing and settlement complexity into a modular desk flow so the supplier still gets exact output."**

### "Why Polkadot Hub?"

**"Because Hub gives us the right settlement surface: Solidity support, native asset rails, ERC20 precompiles, and an XCM path as the asset graph expands."**

## Do Not Say

- "It's basically a transfer app"
- "It's just another payment gateway"
- "The routing is the product"
- "We'll figure out the business case later"

## Best Closing Sentence

**"Portico turns cross-asset treasury complexity into a simple supplier invoice flow: buyers pay with what they hold, and suppliers settle in what they invoice."**
