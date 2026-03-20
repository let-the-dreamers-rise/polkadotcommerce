const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("DotCheckout", function () {
  async function deployFixture() {
    const [owner, merchant, payer, solver, quoteSigner] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdc = await MockERC20.deploy("Mock USDC", "USDC", 6);
    const usdt = await MockERC20.deploy("Mock USDT", "USDT", 6);

    const DotCheckout = await ethers.getContractFactory("DotCheckout");
    const dotCheckout = await DotCheckout.deploy(owner.address, quoteSigner.address);

    await usdc.waitForDeployment();
    await usdt.waitForDeployment();
    await dotCheckout.waitForDeployment();

    const checkoutAmount = 100_000000n;
    const crossAssetInputAmount = 105_000000n;

    await usdc.mint(payer.address, checkoutAmount);
    await usdt.mint(payer.address, crossAssetInputAmount);
    await usdc.mint(solver.address, checkoutAmount);

    return {
      owner,
      merchant,
      payer,
      solver,
      quoteSigner,
      dotCheckout,
      usdc,
      usdt,
      checkoutAmount,
      crossAssetInputAmount
    };
  }

  async function createCheckout(fixture) {
    const now = await time.latest();
    const settlementAsset = await fixture.usdc.getAddress();
    const acceptedAssets = [settlementAsset, await fixture.usdt.getAddress()];

    const tx = await fixture.dotCheckout
      .connect(fixture.merchant)
      .createCheckout(settlementAsset, fixture.checkoutAmount, now + 3600, "demo-order-1", acceptedAssets);

    await tx.wait();
    return 1n;
  }

  async function signQuote(fixture, quote) {
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const domain = {
      name: "DotCheckout",
      version: "1",
      chainId,
      verifyingContract: await fixture.dotCheckout.getAddress()
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

    return fixture.quoteSigner.signTypedData(domain, types, quote);
  }

  it("settles immediately when payer uses the merchant settlement asset", async function () {
    const fixture = await deployFixture();
    const checkoutId = await createCheckout(fixture);
    const now = await time.latest();

    const quote = {
      checkoutId,
      inputAsset: await fixture.usdc.getAddress(),
      inputAmount: fixture.checkoutAmount,
      settlementAsset: await fixture.usdc.getAddress(),
      settlementAmount: fixture.checkoutAmount,
      solver: ethers.ZeroAddress,
      quoteExpiry: BigInt(now + 900),
      fillDeadline: BigInt(now + 1800),
      salt: ethers.hexlify(ethers.randomBytes(32))
    };

    const signature = await signQuote(fixture, quote);

    await fixture.usdc.connect(fixture.payer).approve(await fixture.dotCheckout.getAddress(), fixture.checkoutAmount);

    await expect(fixture.dotCheckout.connect(fixture.payer).payWithQuote(quote, signature))
      .to.emit(fixture.dotCheckout, "PaymentSettled");

    expect(await fixture.usdc.balanceOf(fixture.merchant.address)).to.equal(fixture.checkoutAmount);

    const payment = await fixture.dotCheckout.getPayment(1);
    expect(payment.state).to.equal(2n);
  });

  it("lets a solver settle a cross-asset payment", async function () {
    const fixture = await deployFixture();
    const checkoutId = await createCheckout(fixture);
    const now = await time.latest();

    const quote = {
      checkoutId,
      inputAsset: await fixture.usdt.getAddress(),
      inputAmount: fixture.crossAssetInputAmount,
      settlementAsset: await fixture.usdc.getAddress(),
      settlementAmount: fixture.checkoutAmount,
      solver: fixture.solver.address,
      quoteExpiry: BigInt(now + 900),
      fillDeadline: BigInt(now + 1800),
      salt: ethers.hexlify(ethers.randomBytes(32))
    };

    const signature = await signQuote(fixture, quote);

    await fixture.usdt
      .connect(fixture.payer)
      .approve(await fixture.dotCheckout.getAddress(), fixture.crossAssetInputAmount);
    await fixture.usdc
      .connect(fixture.solver)
      .approve(await fixture.dotCheckout.getAddress(), fixture.checkoutAmount);

    await expect(fixture.dotCheckout.connect(fixture.payer).payWithQuote(quote, signature))
      .to.emit(fixture.dotCheckout, "PaymentPendingSettlement");

    await expect(fixture.dotCheckout.connect(fixture.solver).fillPayment(1))
      .to.emit(fixture.dotCheckout, "PaymentSettled");

    expect(await fixture.usdc.balanceOf(fixture.merchant.address)).to.equal(fixture.checkoutAmount);
    expect(await fixture.usdt.balanceOf(fixture.solver.address)).to.equal(fixture.crossAssetInputAmount);
  });

  it("refunds the payer when the solver misses the fill deadline", async function () {
    const fixture = await deployFixture();
    const checkoutId = await createCheckout(fixture);
    const now = await time.latest();

    const quote = {
      checkoutId,
      inputAsset: await fixture.usdt.getAddress(),
      inputAmount: fixture.crossAssetInputAmount,
      settlementAsset: await fixture.usdc.getAddress(),
      settlementAmount: fixture.checkoutAmount,
      solver: fixture.solver.address,
      quoteExpiry: BigInt(now + 900),
      fillDeadline: BigInt(now + 1200),
      salt: ethers.hexlify(ethers.randomBytes(32))
    };

    const signature = await signQuote(fixture, quote);

    await fixture.usdt
      .connect(fixture.payer)
      .approve(await fixture.dotCheckout.getAddress(), fixture.crossAssetInputAmount);

    await fixture.dotCheckout.connect(fixture.payer).payWithQuote(quote, signature);

    await time.increaseTo(now + 1300);

    const payerBalanceBefore = await fixture.usdt.balanceOf(fixture.payer.address);
    await expect(fixture.dotCheckout.connect(fixture.payer).refundExpiredPayment(1))
      .to.emit(fixture.dotCheckout, "PaymentRefunded");

    const payerBalanceAfter = await fixture.usdt.balanceOf(fixture.payer.address);
    expect(payerBalanceAfter - payerBalanceBefore).to.equal(fixture.crossAssetInputAmount);
  });
});

