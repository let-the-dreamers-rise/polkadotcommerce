// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract DotCheckout is EIP712, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public constant NATIVE_ASSET = address(0);

    bytes32 public constant QUOTE_TYPEHASH =
        keccak256(
            "Quote(uint256 checkoutId,address inputAsset,uint256 inputAmount,address settlementAsset,uint256 settlementAmount,address solver,uint64 quoteExpiry,uint64 fillDeadline,bytes32 salt)"
        );

    enum PaymentState {
        None,
        PendingSettlement,
        Settled,
        Refunded
    }

    struct Checkout {
        address merchant;
        address settlementAsset;
        uint256 settlementAmount;
        uint64 expiresAt;
        bool active;
        string checkoutRef;
    }

    struct Quote {
        uint256 checkoutId;
        address inputAsset;
        uint256 inputAmount;
        address settlementAsset;
        uint256 settlementAmount;
        address solver;
        uint64 quoteExpiry;
        uint64 fillDeadline;
        bytes32 salt;
    }

    struct Payment {
        uint256 checkoutId;
        address merchant;
        address payer;
        address inputAsset;
        uint256 inputAmount;
        address settlementAsset;
        uint256 settlementAmount;
        address solver;
        uint64 fillDeadline;
        PaymentState state;
    }

    error CheckoutNotFound();
    error CheckoutInactive();
    error CheckoutExpired();
    error InvalidSettlementAmount();
    error InvalidSettlementAsset();
    error UnsupportedAsset();
    error InvalidQuote();
    error QuoteExpired();
    error QuoteAlreadyUsed();
    error InvalidDirectSettlementQuote();
    error InvalidSolver();
    error PaymentNotPending();
    error SettlementWindowElapsed();
    error SettlementWindowActive();
    error UnauthorizedRefund();
    error NativeValueMismatch();
    error EmptyAcceptedAssets();

    event QuoteSignerUpdated(address indexed previousSigner, address indexed newSigner);
    event CheckoutCreated(
        uint256 indexed checkoutId,
        address indexed merchant,
        address indexed settlementAsset,
        uint256 settlementAmount,
        uint64 expiresAt,
        string checkoutRef
    );
    event CheckoutStatusUpdated(uint256 indexed checkoutId, bool active);
    event QuoteAccepted(
        uint256 indexed paymentId,
        uint256 indexed checkoutId,
        bytes32 indexed quoteDigest,
        address payer,
        address inputAsset,
        uint256 inputAmount,
        address solver
    );
    event PaymentPendingSettlement(
        uint256 indexed paymentId,
        uint256 indexed checkoutId,
        address indexed solver,
        uint64 fillDeadline
    );
    event PaymentSettled(
        uint256 indexed paymentId,
        uint256 indexed checkoutId,
        address indexed merchant,
        address settlementAsset,
        uint256 settlementAmount,
        address settler
    );
    event PaymentRefunded(uint256 indexed paymentId, uint256 indexed checkoutId, address indexed payer);

    mapping(uint256 => Checkout) private _checkouts;
    mapping(uint256 => Payment) private _payments;
    mapping(uint256 => mapping(address => bool)) public isAcceptedAsset;
    mapping(uint256 => address[]) private _acceptedAssets;
    mapping(bytes32 => bool) public usedQuotes;

    uint256 private _nextCheckoutId = 1;
    uint256 private _nextPaymentId = 1;

    address public quoteSigner;

    constructor(address initialOwner, address initialQuoteSigner) EIP712("DotCheckout", "1") {
        _transferOwnership(initialOwner);
        quoteSigner = initialQuoteSigner;
    }

    function updateQuoteSigner(address newQuoteSigner) external onlyOwner {
        address previousSigner = quoteSigner;
        quoteSigner = newQuoteSigner;
        emit QuoteSignerUpdated(previousSigner, newQuoteSigner);
    }

    function createCheckout(
        address settlementAsset,
        uint256 settlementAmount,
        uint64 expiresAt,
        string calldata checkoutRef,
        address[] calldata acceptedAssets
    ) external returns (uint256 checkoutId) {
        if (acceptedAssets.length == 0) revert EmptyAcceptedAssets();
        if (settlementAmount == 0) revert InvalidSettlementAmount();
        if (expiresAt <= block.timestamp) revert CheckoutExpired();

        checkoutId = _nextCheckoutId++;

        bool settlementAssetSupported = false;

        for (uint256 i = 0; i < acceptedAssets.length; i++) {
            address asset = acceptedAssets[i];
            if (!isAcceptedAsset[checkoutId][asset]) {
                isAcceptedAsset[checkoutId][asset] = true;
                _acceptedAssets[checkoutId].push(asset);
            }

            if (asset == settlementAsset) {
                settlementAssetSupported = true;
            }
        }

        if (!settlementAssetSupported) {
            isAcceptedAsset[checkoutId][settlementAsset] = true;
            _acceptedAssets[checkoutId].push(settlementAsset);
        }

        _checkouts[checkoutId] = Checkout({
            merchant: msg.sender,
            settlementAsset: settlementAsset,
            settlementAmount: settlementAmount,
            expiresAt: expiresAt,
            active: true,
            checkoutRef: checkoutRef
        });

        emit CheckoutCreated(
            checkoutId,
            msg.sender,
            settlementAsset,
            settlementAmount,
            expiresAt,
            checkoutRef
        );
    }

    function setCheckoutActive(uint256 checkoutId, bool active) external {
        Checkout storage checkout = _checkouts[checkoutId];
        if (checkout.merchant == address(0)) revert CheckoutNotFound();
        if (msg.sender != checkout.merchant && msg.sender != owner()) revert UnauthorizedRefund();

        checkout.active = active;
        emit CheckoutStatusUpdated(checkoutId, active);
    }

    function payWithQuote(Quote calldata quote, bytes calldata signature)
        external
        payable
        nonReentrant
        returns (uint256 paymentId)
    {
        Checkout storage checkout = _checkouts[quote.checkoutId];
        if (checkout.merchant == address(0)) revert CheckoutNotFound();
        if (!checkout.active) revert CheckoutInactive();
        if (checkout.expiresAt < block.timestamp) revert CheckoutExpired();
        if (quote.quoteExpiry < block.timestamp) revert QuoteExpired();
        if (quote.settlementAmount != checkout.settlementAmount) revert InvalidSettlementAmount();
        if (quote.settlementAsset != checkout.settlementAsset) revert InvalidSettlementAsset();
        if (!isAcceptedAsset[quote.checkoutId][quote.inputAsset]) revert UnsupportedAsset();

        bytes32 quoteDigest = _hashTypedDataV4(_hashQuote(quote));
        if (usedQuotes[quoteDigest]) revert QuoteAlreadyUsed();

        address recoveredSigner = ECDSA.recover(quoteDigest, signature);
        if (recoveredSigner != quoteSigner) revert InvalidQuote();

        usedQuotes[quoteDigest] = true;
        _pullAsset(quote.inputAsset, msg.sender, quote.inputAmount);

        paymentId = _nextPaymentId++;

        _payments[paymentId] = Payment({
            checkoutId: quote.checkoutId,
            merchant: checkout.merchant,
            payer: msg.sender,
            inputAsset: quote.inputAsset,
            inputAmount: quote.inputAmount,
            settlementAsset: quote.settlementAsset,
            settlementAmount: quote.settlementAmount,
            solver: quote.solver,
            fillDeadline: quote.fillDeadline,
            state: PaymentState.PendingSettlement
        });

        emit QuoteAccepted(
            paymentId,
            quote.checkoutId,
            quoteDigest,
            msg.sender,
            quote.inputAsset,
            quote.inputAmount,
            quote.solver
        );

        bool isDirectSettlement =
            quote.inputAsset == quote.settlementAsset && quote.inputAmount == quote.settlementAmount;

        if (isDirectSettlement) {
            if (quote.solver != address(0)) revert InvalidDirectSettlementQuote();
            _payments[paymentId].state = PaymentState.Settled;
            _pushAsset(checkout.merchant, quote.settlementAsset, quote.settlementAmount);

            emit PaymentSettled(
                paymentId,
                quote.checkoutId,
                checkout.merchant,
                quote.settlementAsset,
                quote.settlementAmount,
                msg.sender
            );
        } else {
            if (quote.solver == address(0)) revert InvalidSolver();
            if (quote.fillDeadline <= block.timestamp || quote.fillDeadline < quote.quoteExpiry) {
                revert SettlementWindowElapsed();
            }

            emit PaymentPendingSettlement(paymentId, quote.checkoutId, quote.solver, quote.fillDeadline);
        }
    }

    function fillPayment(uint256 paymentId) external payable nonReentrant {
        Payment storage payment = _payments[paymentId];
        if (payment.state != PaymentState.PendingSettlement) revert PaymentNotPending();
        if (msg.sender != payment.solver) revert InvalidSolver();
        if (block.timestamp > payment.fillDeadline) revert SettlementWindowElapsed();

        payment.state = PaymentState.Settled;

        _pullAsset(payment.settlementAsset, msg.sender, payment.settlementAmount);
        _pushAsset(payment.merchant, payment.settlementAsset, payment.settlementAmount);
        _pushAsset(msg.sender, payment.inputAsset, payment.inputAmount);

        emit PaymentSettled(
            paymentId,
            payment.checkoutId,
            payment.merchant,
            payment.settlementAsset,
            payment.settlementAmount,
            msg.sender
        );
    }

    function refundExpiredPayment(uint256 paymentId) external nonReentrant {
        Payment storage payment = _payments[paymentId];
        if (payment.state != PaymentState.PendingSettlement) revert PaymentNotPending();
        if (block.timestamp <= payment.fillDeadline) revert SettlementWindowActive();
        if (msg.sender != payment.payer && msg.sender != payment.merchant && msg.sender != owner()) {
            revert UnauthorizedRefund();
        }

        payment.state = PaymentState.Refunded;
        _pushAsset(payment.payer, payment.inputAsset, payment.inputAmount);

        emit PaymentRefunded(paymentId, payment.checkoutId, payment.payer);
    }

    function getCheckout(uint256 checkoutId)
        external
        view
        returns (
            address merchant,
            address settlementAsset,
            uint256 settlementAmount,
            uint64 expiresAt,
            bool active,
            string memory checkoutRef
        )
    {
        Checkout storage checkout = _checkouts[checkoutId];
        if (checkout.merchant == address(0)) revert CheckoutNotFound();
        return (
            checkout.merchant,
            checkout.settlementAsset,
            checkout.settlementAmount,
            checkout.expiresAt,
            checkout.active,
            checkout.checkoutRef
        );
    }

    function getPayment(uint256 paymentId)
        external
        view
        returns (
            uint256 checkoutId,
            address merchant,
            address payer,
            address inputAsset,
            uint256 inputAmount,
            address settlementAsset,
            uint256 settlementAmount,
            address solver,
            uint64 fillDeadline,
            PaymentState state
        )
    {
        Payment storage payment = _payments[paymentId];
        return (
            payment.checkoutId,
            payment.merchant,
            payment.payer,
            payment.inputAsset,
            payment.inputAmount,
            payment.settlementAsset,
            payment.settlementAmount,
            payment.solver,
            payment.fillDeadline,
            payment.state
        );
    }

    function getAcceptedAssets(uint256 checkoutId) external view returns (address[] memory) {
        return _acceptedAssets[checkoutId];
    }

    function hashQuote(Quote calldata quote) external view returns (bytes32) {
        return _hashTypedDataV4(_hashQuote(quote));
    }

    function _hashQuote(Quote calldata quote) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                QUOTE_TYPEHASH,
                quote.checkoutId,
                quote.inputAsset,
                quote.inputAmount,
                quote.settlementAsset,
                quote.settlementAmount,
                quote.solver,
                quote.quoteExpiry,
                quote.fillDeadline,
                quote.salt
            )
        );
    }

    function _pullAsset(address asset, address from, uint256 amount) internal {
        if (asset == NATIVE_ASSET) {
            if (msg.value != amount) revert NativeValueMismatch();
            return;
        }

        if (msg.value != 0) revert NativeValueMismatch();
        IERC20(asset).safeTransferFrom(from, address(this), amount);
    }

    function _pushAsset(address recipient, address asset, uint256 amount) internal {
        if (asset == NATIVE_ASSET) {
            (bool success,) = recipient.call{value: amount}("");
            require(success, "native transfer failed");
            return;
        }

        IERC20(asset).safeTransfer(recipient, amount);
    }
}
