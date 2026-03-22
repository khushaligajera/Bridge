import "dotenv/config";

function required(name) {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

function optional(name, fallback) {
  return process.env[name] ?? fallback;
}

export const config = {
  // ── EVM ────────────────────────────────────────────────────────────────────
  evmRpcWs:              required("EVM_RPC_WS"),
  evmRpcHttp:            required("EVM_RPC_HTTP"),
  evmChainId:            parseInt(required("EVM_CHAIN_ID")),
  bridgeContractAddress: required("BRIDGE_CONTRACT_ADDRESS"),
  relayerPrivateKey:     required("RELAYER_PRIVATE_KEY"),   // EVM signer

  // ── Solana ─────────────────────────────────────────────────────────────────
  solanaRpc:             required("SOLANA_RPC"),
  bridgeProgramId:       required("BRIDGE_PROGRAM_ID"),
  wscaiMint:             required("WSCAT_MINT_ADDRESS"),
  relayerKeypairPath:    required("RELAYER_KEYPAIR_PATH"),  // path to .json

  // ── Bridge settings ────────────────────────────────────────────────────────
  maxRetry:              parseInt(optional("MAX_RETRY",               "3")),
  retryDelayMs:          parseInt(optional("RETRY_DELAY_MS",         "2000")),
  eventTimeoutSeconds:   parseInt(optional("EVENT_TIMEOUT_SECONDS",  "600")),
  reconnectDelayMs:      parseInt(optional("RECONNECT_DELAY_MS",     "5000")),
};