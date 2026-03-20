require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");
require("@nomicfoundation/hardhat-network-helpers");
require("dotenv").config();

const PRIVATE_KEY = process.env.PRIVATE_KEY;

module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 500
      },
      evmVersion: "paris"
    }
  },
  networks: {
    localhost: {
      url: "http://127.0.0.1:8545"
    },
    polkadotHubTestnet: {
      url:
        process.env.POLKADOT_HUB_RPC_URL ||
        "https://services.polkadothub-rpc.com/testnet",
      chainId: Number(process.env.POLKADOT_HUB_CHAIN_ID || 420420417),
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : []
    }
  }
};
