import { PublicKey }    from "@solana/web3.js";
import { config }       from "./config.js";
import { hasSeen, markSeen } from "./dedup-store.js";
import { getSolanaConnection } from "./solana-executor.js";
import { submitUnlock } from "./hub-executor.js";
import { sleep }        from "./retry.js";

// Log prefix emitted by the Anchor #[event] macro.
const PROGRAM_LOG_PREFIX = "Program data: ";

let _subscriptionId = null;

export async function startSolanaListener() {
  subscribe();
}

function subscribe() {
  const connection = getSolanaConnection();
  const programId  = new PublicKey(config.bridgeProgramId);

  console.log("[solana-listener] subscribing to program logs for", programId.toBase58());

  _subscriptionId = connection.onLogs(
    programId,
    (logsResult) => {
      if (logsResult.err) return;  // failed transaction — ignore
      handleLogs(logsResult.logs, logsResult.signature);
    },
    "confirmed"
  );

  console.log("[solana-listener] subscribed, id:", _subscriptionId);
}

function handleLogs(logs, signature) {
  for (const log of logs) {
    if (!log.startsWith(PROGRAM_LOG_PREFIX)) continue;

    const base64 = log.slice(PROGRAM_LOG_PREFIX.length);
    const event  = tryDecodeBurnInitiated(base64);

    if (!event) continue;

    onBurnInitiated(event, signature).catch((err) =>
      console.error("[solana-listener] error handling BurnInitiated:", err.message)
    );
  }
}

async function onBurnInitiated({ burnId, evmRecipient, amount, timestamp }, signature) {
  // ── Step 1: Validate ───────────────────────────────────────────────────────

  const now = Math.floor(Date.now() / 1000);
  if (now - timestamp > config.eventTimeoutSeconds) {
    console.warn(`[solana-listener] dropping stale burn | burnId=${burnId} age=${now - timestamp}s`);
    return;
  }

  if (amount === 0n) {
    console.warn(`[solana-listener] dropping zero-amount burn | burnId=${burnId}`);
    return;
  }

  // ── Step 2: Deduplicate ────────────────────────────────────────────────────

  if (hasSeen(burnId)) {
    console.log(`[solana-listener] duplicate burn, skipping | burnId=${burnId}`);
    return;
  }
  markSeen(burnId);

  console.log(
    `[solana-listener] BurnInitiated | burnId=${burnId}` +
    ` evmRecipient=${evmRecipient} amount=${amount} sig=${signature}`
  );

  // ── Step 3: Submit unlock on EVM ───────────────────────────────────────────

  await submitUnlock(burnId, evmRecipient, amount);
}

/**
 * Decode a base64-encoded Anchor event log.
 *
 * Anchor event logs are: 8-byte discriminator + borsh-encoded fields.
 * BurnInitiated layout:
 *   burn_id:       [u8; 32]
 *   evm_recipient: [u8; 20]
 *   amount:        u64 (le)
 *   timestamp:     i64 (le)
 *
 * We identify the event by its discriminator (sha256("event:BurnInitiated")[0..8]).
 */

// Pre-computed discriminator for BurnInitiated — regenerate with:
// node -e "const c=require('crypto');console.log(c.createHash('sha256').update('event:BurnInitiated').digest().slice(0,8).toString('hex'))"
const BURN_INITIATED_DISC = Buffer.from("placeholder00000", "hex"); // REPLACE with real discriminator

function tryDecodeBurnInitiated(base64) {
  try {
    const buf = Buffer.from(base64, "base64");
    if (buf.length < 8) return null;

    const disc = buf.slice(0, 8);
    if (!disc.equals(BURN_INITIATED_DISC)) return null;

    let offset = 8;

    const burnId       = "0x" + buf.slice(offset, offset + 32).toString("hex"); offset += 32;
    const evmRecipient = "0x" + buf.slice(offset, offset + 20).toString("hex"); offset += 20;
    const amount       = buf.readBigUInt64LE(offset); offset += 8;
    const timestamp    = Number(buf.readBigInt64LE(offset));

    return { burnId, evmRecipient, amount, timestamp };
  } catch {
    return null;
  }
}