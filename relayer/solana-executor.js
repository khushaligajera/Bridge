import {
  Connection,
  Keypair,
  PublicKey,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from "@solana/spl-token";
import pkg from "@coral-xyz/anchor";
const { AnchorProvider, Program, Wallet, BN } = pkg;
import fs             from "fs";
import { config }     from "./config.js";
import { withRetry }  from "./retry.js";

const ADAPTER_STATE_SEED     = Buffer.from("adapter_state");
const ADAPTER_AUTHORITY_SEED = Buffer.from("adapter_authority");
const ORDER_RECORD_SEED      = Buffer.from("order_record");

let _connection;
let _relayerKeypair;
let _program;
let _programId;
let _wscaiMint;

export async function initSolanaExecutor() {
  _connection     = new Connection(config.solanaRpc, "confirmed");
  _relayerKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(config.relayerKeypairPath, "utf-8")))
  );
  _programId = new PublicKey(config.bridgeProgramId);
  _wscaiMint = new PublicKey(config.wscaiMint);

  // Load IDL and create Anchor program
  const idlPath = new URL("../solana/bridge_program/target/idl/bridge_program.json", import.meta.url).pathname;
  const idl     = JSON.parse(fs.readFileSync(idlPath, "utf-8"));

  const wallet   = new Wallet(_relayerKeypair);
  const provider = new AnchorProvider(_connection, wallet, { commitment: "confirmed" });
  _program       = new Program(idl, provider);

  console.log("[solana-executor] initialized, relayer pubkey:", _relayerKeypair.publicKey.toBase58());
}

export async function submitMint(orderIdHex, solanaRecipient, amount) {
  const orderIdBytes = hexToBytes32(orderIdHex);
  const recipientPk  = new PublicKey(solanaRecipient);

  console.log(`[solana-executor] submitting mint | orderId=${orderIdHex} recipient=${solanaRecipient} amount=${amount}`);

  const [adapterState]     = PublicKey.findProgramAddressSync([ADAPTER_STATE_SEED], _programId);
  const [adapterAuthority] = PublicKey.findProgramAddressSync([ADAPTER_AUTHORITY_SEED], _programId);
  const [orderRecord]      = PublicKey.findProgramAddressSync(
    [ORDER_RECORD_SEED, orderIdBytes], _programId
  );

  const recipientAta = await getAssociatedTokenAddress(_wscaiMint, recipientPk);
  await ensureAta(recipientPk, recipientAta);

  // Convert amount to BN (u64)
  const amountBN = new BN(amount.toString());

  await withRetry(
    async () => {
      const sig = await _program.methods
        .executeMint(Array.from(orderIdBytes), amountBN)
        .accounts({
          relayer:          _relayerKeypair.publicKey,
          adapterState,
          adapterAuthority,
          orderRecord,
          wscaiMint:        _wscaiMint,
          recipientAta,
          tokenProgram:     new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
          systemProgram:    new PublicKey("11111111111111111111111111111111"),
        })
        .rpc();
      console.log(`[solana-executor] mint confirmed | sig=${sig}`);
      console.log(`[solana-executor] explorer: https://explorer.solana.com/tx/${sig}?cluster=devnet`);
      return sig;
    },
    config.maxRetry,
    config.retryDelayMs,
    `execute_mint(${orderIdHex})`,
  );
}

async function ensureAta(owner, ata) {
  try {
    await getAccount(_connection, ata);
  } catch {
    console.log(`[solana-executor] creating ATA for ${owner.toBase58()}`);
    const { Transaction, sendAndConfirmTransaction } = await import("@solana/web3.js");
    const createIx = createAssociatedTokenAccountInstruction(
      _relayerKeypair.publicKey, ata, owner, _wscaiMint
    );
    const tx = new Transaction().add(createIx);
    await sendAndConfirmTransaction(_connection, tx, [_relayerKeypair]);
  }
}

function hexToBytes32(hex) {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  return Buffer.from(clean.padStart(64, "0"), "hex");
}

export function getSolanaConnection() {
  return _connection;
}