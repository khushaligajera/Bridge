require("dotenv").config();
const hre = require("hardhat");

async function main() {
  const MOCK_SCAI_ADDRESS   = process.env.MOCK_SCAI_ADDRESS;
  const RELAYER_EVM_ADDRESS = process.env.RELAYER_EVM_ADDRESS;

  if (!MOCK_SCAI_ADDRESS) {
    throw new Error("MOCK_SCAI_ADDRESS not in .env — run deployMock.js first and paste the address");
  }
  if (!RELAYER_EVM_ADDRESS) {
    throw new Error("RELAYER_EVM_ADDRESS not in .env — paste your MetaMask wallet address");
  }

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying Bridge.sol on Sepolia...");
  console.log("Deployer:        ", deployer.address);
  console.log("Token address:   ", MOCK_SCAI_ADDRESS);
  console.log("Relayer address: ", RELAYER_EVM_ADDRESS);

  const Bridge = await hre.ethers.getContractFactory("Bridge");
  const bridge = await Bridge.deploy(
    MOCK_SCAI_ADDRESS,
    RELAYER_EVM_ADDRESS,
    0n
  );

  await bridge.waitForDeployment();
  const address = await bridge.getAddress();

  console.log("\n✅ Bridge deployed at:", address);
  console.log("Add this to your .env:  BRIDGE_CONTRACT_ADDRESS=" + address);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
