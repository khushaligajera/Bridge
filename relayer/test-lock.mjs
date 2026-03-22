import { ethers } from "ethers";
import { PublicKey } from "@solana/web3.js";
import { config } from "dotenv";
config({ path: new URL(".env", import.meta.url).pathname });

const provider = new ethers.JsonRpcProvider(process.env.EVM_RPC_HTTP);
const wallet   = new ethers.Wallet(process.env.RELAYER_PRIVATE_KEY, provider);

const TOKEN_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
];
const BRIDGE_ABI = [
  "function lockTokens(uint256 amount, bytes32 solanaRecipient) external",
];

const TOKEN_ADDRESS  = "0x7aCe727bD0E8fA9AFb4A18a663C0CB6889E26f3d";
const BRIDGE_ADDRESS = "0xd7EA468BdBca67773295E4059437346e9Ea7F1d0";

// Your Solana wallet pubkey encoded as bytes32
const SOLANA_PUBKEY  = "779mqmc8nWz9jTUV3C8iDGs9MSXJYchKTSAspzjvo4Tr";
const solanaBytes32  = "0x" + Buffer.from(new PublicKey(SOLANA_PUBKEY).toBytes()).toString("hex");

const token  = new ethers.Contract(TOKEN_ADDRESS,  TOKEN_ABI,  wallet);
const bridge = new ethers.Contract(BRIDGE_ADDRESS, BRIDGE_ABI, wallet);

const amount = ethers.parseEther("10");  // lock 10 tokens

console.log("Wallet:          ", wallet.address);
console.log("Token balance:   ", ethers.formatEther(await token.balanceOf(wallet.address)));
console.log("Amount to lock:  ", ethers.formatEther(amount));
console.log("Solana recipient:", SOLANA_PUBKEY);
console.log("Encoded bytes32: ", solanaBytes32);

console.log("\n1. Approving bridge to spend tokens...");
const approveTx = await token.approve(BRIDGE_ADDRESS, amount);
await approveTx.wait();
console.log("   Approved ✓ tx:", approveTx.hash);

console.log("2. Locking tokens in bridge...");
const lockTx = await bridge.lockTokens(amount, solanaBytes32);
await lockTx.wait();
console.log("   Locked ✓ tx:", lockTx.hash);
console.log("\n Watch the relayer logs — wSCAI should mint on Solana devnet within seconds!");
console.log("   Check: https://explorer.solana.com/address/" + SOLANA_PUBKEY + "?cluster=devnet");
