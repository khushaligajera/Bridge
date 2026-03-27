import { ethers } from "ethers";
import { PublicKey } from "@solana/web3.js";
import { config } from "dotenv";
config({ path: new URL(".env", import.meta.url).pathname });

const provider = new ethers.JsonRpcProvider(process.env.EVM_RPC_HTTP);
const wallet   = new ethers.Wallet(process.env.RELAYER_PRIVATE_KEY, provider);


const BRIDGE_ABI = [
  "function lockCoins(bytes32 solanaRecipient) external payable",
  "function lockedBalance() view returns (uint256)",
];


const BRIDGE_ADDRESS = "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0";

// Your Solana wallet pubkey encoded as bytes32
const SOLANA_PUBKEY  = "779mqmc8nWz9jTUV3C8iDGs9MSXJYchKTSAspzjvo4Tr";
const solanaBytes32  = "0x" + Buffer.from(new PublicKey(SOLANA_PUBKEY).toBytes()).toString("hex");

const bridge = new ethers.Contract(BRIDGE_ADDRESS, BRIDGE_ABI, wallet);

const amount = ethers.parseEther("0.000452"); 

console.log("Wallet:          ", wallet.address);
console.log("Native balance:   ", ethers.formatEther(await provider.getBalance(wallet.address)),"SCAI" );
console.log("Amount to lock:  ", ethers.formatEther(amount));
console.log("Solana recipient:", SOLANA_PUBKEY);
console.log("Bridge balance before:",ethers.formatEther(await bridge.lockedBalance()),"SCAI");
console.log("Encoded bytes32: ", solanaBytes32);

console.log(" Locking tokens in bridge...");
const lockTx = await bridge.lockCoins( solanaBytes32,{value:amount});
await lockTx.wait();
console.log("Bridge balance after:",ethers.formatEther(await bridge.lockedBalance(),"SCAI"));
console.log("\n Watch the relayer logs — wSCAI should mint on Solana devnet within seconds!");
console.log("   Check: https://explorer.solana.com/address/" + SOLANA_PUBKEY + "?cluster=devnet");
