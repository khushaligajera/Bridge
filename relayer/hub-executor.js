import { ethers }      from "ethers";
import { config }      from "./config.js";
import { withRetry }   from "./retry.js";

// Minimal ABI — only what the relayer needs.
const BRIDGE_ABI = [
  "function unlockCoins(bytes32 orderId, address recipient, uint256 amount) external",
  "event coinsLocked(bytes32 indexed orderId, address indexed sender, bytes32 solanaRecipient, uint256 amount, uint256 fee, uint256 timestamp)",
  "event coinsUnlocked(bytes32 indexed orderId, address indexed recipient, uint256 amount)",
];

let _provider;
let _wallet;
let _contract;

export function initHubExecutor(provider) {
  _provider = provider;
  _wallet   = new ethers.Wallet(config.relayerPrivateKey, provider);
  _contract = new ethers.Contract(config.bridgeContractAddress, BRIDGE_ABI, _wallet);
  console.log("[hub-executor] initialized, relayer address:\n", _wallet.address);
}

/**
 * Submit unlockTokens transaction to the EVM bridge contract.
 *
 * @param {string} orderId   bytes32 hex string (the Solana burnId)
 * @param {string} recipient EVM address
 * @param {bigint} amount    Token amount in wei-equivalent
 */
export async function submitUnlock(orderId, recipient, amount) {
  console.log(`[hub-executor] submitting unlock | orderId=${orderId} recipient=${recipient} amount=${amount} \n`);

  const tx = await withRetry(
    () => _contract.unlockCoins(orderId, recipient, amount),
    config.maxRetry,
    config.retryDelayMs,
    `unlockTokens(${orderId})`,
  );

  const receipt = await tx.wait();
  console.log(`[hub-executor] unlock confirmed | tx=${receipt.hash} block=${receipt.blockNumber} \n`);
  return receipt;
}

export function getBridgeContract() {
  return _contract;
}