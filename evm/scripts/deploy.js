require("dotenv").config();
const hre = require("hardhat");

async function main() {
  const RELAYER_EVM_ADDRESS = process.env.RELAYER_EVM_ADDRESS;

  if (!RELAYER_EVM_ADDRESS) {
    throw new Error("RELAYER_EVM_ADDRESS not in .env ");
  }

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying Bridge.sol on Sepolia...");
  console.log("Deployer:        ", deployer.address);
  console.log("Relayer address: ", RELAYER_EVM_ADDRESS);

  const Bridge = await hre.ethers.getContractFactory("Bridge");
  const bridge = await Bridge.deploy(
    RELAYER_EVM_ADDRESS,
    0n
  );

  await bridge.waitForDeployment();
  const address = await bridge.getAddress();

  console.log("\n✅ Bridge deployed at:", address);
  console.log("Add this  BRIDGE_CONTRACT_ADDRESS=" + address);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
