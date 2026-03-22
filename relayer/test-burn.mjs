import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress, getAccount } from "@solana/spl-token";
import pkg from "@coral-xyz/anchor";
const { AnchorProvider, Program, Wallet, BN } = pkg;
import { readFileSync } from "fs";

const connection    = new Connection("https://api.devnet.solana.com", "confirmed");
const keypair       = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(readFileSync("./keypair.json")))
);
const provider = new AnchorProvider(connection, new Wallet(keypair), { commitment: "confirmed" });
const idl      = JSON.parse(readFileSync("../solana/bridge_program/target/idl/bridge_program.json"));
const program  = new Program(idl, provider);

const PROGRAM_ID  = new PublicKey("HEWS6f9LPcuZJtKi7NZ3jbaZk6JRF58Wzc89WgnY7bSJ");
const WSCAI_MINT  = new PublicKey("BgKCyPNBgTbW7YoEjhjeLSrVT7hqUCBWWZDPZoLpDPDt");
const EVM_ADDRESS = "992b534E88f4F545E2c72ff694603cca52D87eAc"; // your MetaMask address without 0x

const [adapterState] = PublicKey.findProgramAddressSync([Buffer.from("adapter_state")], PROGRAM_ID);
const userAta        = await getAssociatedTokenAddress(WSCAI_MINT, keypair.publicKey);

// Check wSCAI balance
const ataInfo = await getAccount(connection, userAta);
console.log("wSCAI balance:", ataInfo.amount.toString());

const evmRecipientBytes = Buffer.from(EVM_ADDRESS, "hex");
const amount            = new BN("5000000000000000000"); // burn 5 wSCAI
const slot              = await connection.getSlot();
const slotBN            = new BN(slot);

const [burnOrder] = PublicKey.findProgramAddressSync([
  Buffer.from("burn_order"),
  keypair.publicKey.toBuffer(),
  Buffer.from(new BN(slot).toArrayLike(Buffer, "le", 8)),
], PROGRAM_ID);

console.log("Burning 5 wSCAI to release SCAI on Sepolia to:", "0x" + EVM_ADDRESS);

const tx = await program.methods
  .initiateBurn(Array.from(evmRecipientBytes), amount, slotBN)
  .accounts({
    user:         keypair.publicKey,
    adapterState,
    wscaiMint:    WSCAI_MINT,
    userAta,
    burnOrder,
    tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
    systemProgram: new PublicKey("11111111111111111111111111111111"),
  })
  .rpc();

console.log(" Burn tx:", tx);
console.log(" Watch relayer logs — SCAI should unlock on Sepolia!");
