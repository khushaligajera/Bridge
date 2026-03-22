import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { readFileSync } from "fs";

const connection    = new Connection("https://api.devnet.solana.com", "confirmed");
const keypair       = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(readFileSync("./keypair.json", "utf-8")))
);
const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(keypair), { commitment: "confirmed" });

const idl     = JSON.parse(readFileSync(
  "../solana/bridge_program/target/idl/bridge_program.json", "utf-8"
));

// Anchor 0.32: IDL contains address, no need to pass program ID separately
const program = new anchor.Program(idl, provider);
const PROGRAM_ID = new PublicKey(idl.address);
const WSCAI_MINT = new PublicKey("BgKCyPNBgTbW7YoEjhjeLSrVT7hqUCBWWZDPZoLpDPDt");

const [adapterState] = PublicKey.findProgramAddressSync(
  [Buffer.from("adapter_state")], PROGRAM_ID
);
const [adapterAuthority] = PublicKey.findProgramAddressSync(
  [Buffer.from("adapter_authority")], PROGRAM_ID
);

console.log("adapter_state PDA:    ", adapterState.toBase58());
console.log("adapter_authority PDA:", adapterAuthority.toBase58());
console.log("Relayer pubkey:       ", keypair.publicKey.toBase58());
console.log("Initializing...");

const tx = await program.methods
  .initialize(keypair.publicKey)
  .accounts({
    owner:            keypair.publicKey,
    adapterState:     adapterState,
    adapterAuthority: adapterAuthority,
    wscaiMint:        WSCAI_MINT,
    systemProgram:    anchor.web3.SystemProgram.programId,
  })
  .rpc();

console.log("\n✅ Program initialized!");
console.log("Transaction:", tx);
