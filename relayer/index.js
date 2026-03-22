/**
 * Bridge Relayer — entry point.
 *
 * Boots both the EVM → Solana and Solana → EVM listeners concurrently.
 * Handles SIGTERM / SIGINT gracefully.
 */

import { config } from "./config.js";
import { initSolanaExecutor } from "./solana-executor.js";
import { startHubListener }  from "./hub-listener.js";
import { startSolanaListener } from "./solana-listener.js";

async function main() {
  console.log("═══════════════════════════════════════════════");
  console.log("  SCAI <-> Solana Bridge Relayer");
  console.log("═══════════════════════════════════════════════");
  console.log("[main] EVM chain id:      ", config.evmChainId);
  console.log("[main] Bridge contract:   ", config.bridgeContractAddress);
  console.log("[main] Solana program:    ", config.bridgeProgramId);
  console.log("[main] Event timeout:     ", config.eventTimeoutSeconds, "s");
  console.log("[main] Max retry:         ", config.maxRetry);
  console.log("───────────────────────────────────────────────");

  // Initialise Solana connection and keypair first (hub-listener needs it).
  await initSolanaExecutor();

  // Start both listeners concurrently — neither blocks the other.
  await Promise.all([
    startHubListener(),
    startSolanaListener(),
  ]);

  console.log("[main] Both listeners running ✓");
}

// ── Graceful shutdown ─────────────────────────────────────────────────────────

function shutdown(signal) {
  console.log(`\n[main] Received ${signal} — shutting down gracefully …`);
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  console.error("[main] Unhandled rejection:", reason);
  // Do NOT exit — keeps relayer alive during transient RPC failures.
});

main().catch((err) => {
  console.error("[main] Fatal startup error:", err);
  process.exit(1);
});