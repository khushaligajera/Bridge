import { ethers }         from "ethers";
import { config }         from "./config.js";
import { hasSeen, markSeen } from "./dedup-store.js";
import { initHubExecutor, getBridgeContract } from "./hub-executor.js";
import { submitMint }     from "./solana-executor.js";
import { sleep }          from "./retry.js";
    
const { PublicKey } = await import("@solana/web3.js");

const BRIDGE_ABI = [
  "event TokensLocked(bytes32 indexed orderId, address indexed sender, bytes32 solanaRecipient, uint256 amount, uint256 fee, uint256 timestamp)",
];

let _provider;

export async function startHubListener() {
  await connect();
}

async function connect() {
  console.log("[hub-listener] connecting to", config.evmRpcWs);

  try {
    _provider = new ethers.WebSocketProvider(config.evmRpcWs);

    // Pass provider to executor so it can sign transactions.
    initHubExecutor(_provider);

    const contract = new ethers.Contract(config.bridgeContractAddress, BRIDGE_ABI, _provider);

    contract.on("TokensLocked", onTokensLocked);

    // Reconnect on error or close.
    _provider.websocket.on("error", handleDisconnect);
    _provider.websocket.on("close", handleDisconnect);

    console.log("[hub-listener] listening for TokensLocked events");
  } catch (err) {
    console.error("[hub-listener] connection failed:", err.message);
    await sleep(config.reconnectDelayMs);
    return connect();
  }
}

async function onTokensLocked(orderId, sender, solanaRecipient, amount, fee, timestamp, event) {
  try {
    // ── Step 1: Validate ─────────────────────────────────────────────────────

    const tsSeconds = Number(timestamp);
    const now       = Math.floor(Date.now() / 1000);

    if (now - tsSeconds > config.eventTimeoutSeconds) {
      console.warn(`[hub-listener] dropping stale event | orderId=${orderId} age=${now - tsSeconds}s`);
      return;
    }

    if (amount === 0n) {
      console.warn(`[hub-listener] dropping zero-amount event | orderId=${orderId}`);
      return;
    }

    // ── Step 2: Deduplicate ───────────────────────────────────────────────────

    if (hasSeen(orderId)) {
      console.log(`[hub-listener] duplicate event, skipping | orderId=${orderId}`);
      return;
    }
    markSeen(orderId);

    // ── Step 3: Decode Solana recipient ───────────────────────────────────────

    const solanaRecipientPubkey = await bytes32ToSolanaAddress(solanaRecipient);
    if (!solanaRecipientPubkey) {
      console.error(`[hub-listener] invalid solanaRecipient | orderId=${orderId} raw=${solanaRecipient}`);
      return;
    }

    console.log(
      `[hub-listener] TokensLocked | orderId=${orderId} sender=${sender}` +
      ` solanaRecipient=${solanaRecipientPubkey} amount=${amount}`
    );

    // ── Step 4: Submit mint on Solana ─────────────────────────────────────────

    await submitMint(orderId, solanaRecipientPubkey, amount);

  } catch (err) {
    console.error(`[hub-listener] error processing TokensLocked | orderId=${orderId}: ${err.message}`);
    // Event is already in dedup set — won't be double-submitted.
    // On-chain PDA creation will reject any accidental duplicates.
  }
}

async function handleDisconnect(err) {
  console.warn("[hub-listener] WebSocket disconnected:", err?.message ?? "unknown reason");
  await sleep(config.reconnectDelayMs);
  connect();
}

// Convert bytes32 EVM hex to base58 Solana pubkey string.
async function bytes32ToSolanaAddress(bytes32Hex) {
  try {

    const clean = bytes32Hex.startsWith("0x") ? bytes32Hex.slice(2) : bytes32Hex;
    const buf   = Buffer.from(clean, "hex");
    return new PublicKey(buf).toBase58();
  } catch(e) {
     console.error("[hub-listener] bytes32ToSolanaAddress error:", e.message);
    return null;

  }
}