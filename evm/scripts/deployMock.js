require("dotenv").config();
const hre = require("hardhat");

async function main() {
  console.log("Deploying MockERC20 (fake SCAI) on Sepolia...");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer address:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("ETH balance:", hre.ethers.formatEther(balance), "ETH");

  if (balance === 0n) {
    throw new Error("No ETH! Get Sepolia ETH");
  }

  const Token = await hre.ethers.getContractFactory("MockERC20");
  const token = await Token.deploy(
    "Mock SCAI",
    "mSCAI",
    hre.ethers.parseEther("1000000")
  );

  await token.waitForDeployment();
  const address = await token.getAddress();

  console.log("\n✅ MockERC20 deployed at:", address);
  console.log("👉 Add this to your .env:  MOCK_SCAI_ADDRESS=" + address);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});