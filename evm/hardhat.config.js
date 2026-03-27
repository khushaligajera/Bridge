require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const DEPLOYER_KEY = process.env.DEPLOYER_PRIVATE_KEY 
  ? process.env.DEPLOYER_PRIVATE_KEY 
  : "0x0000000000000000000000000000000000000000000000000000000000000001";

const RPC_URL = process.env.EVM_RPC_HTTP 
  ? process.env.EVM_RPC_HTTP 
  : "";

module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhat: {
      forking:{
        url:"https://mainnet-rpc.scai.network",
        enabled:true,
      },
      chainId:34,
    },
    localhost:{
       url: "http://127.0.0.1:8545",
      chainId: 34,
    },
    sepolia: {
      url: RPC_URL,
      chainId: 11155111,
      accounts: [DEPLOYER_KEY],
    },
    scai: {
      url: "https://mainnet-rpc.scai.network",
      chainId: 34,
      accounts: [DEPLOYER_KEY],
    },
  },
};