import * as airdropsender from "helius-airship-core";
import * as web3 from "@solana/web3.js";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
// Load the database
const sqlite = new Database(airdropsender.databaseFile);
sqlite.exec("PRAGMA journal_mode = WAL;");
sqlite.exec("PRAGMA synchronous = normal;");

const db = drizzle(sqlite);

export async function create({
  signer,
  addresses,
  amount,
  mintAddress,
}) {
    
  await airdropsender.create({
    // @ts-ignore
    db,
    signer: new web3.PublicKey(signer),
    addresses: addresses.map((address) => new web3.PublicKey(address)),
    amount,
    mintAddress: new web3.PublicKey(mintAddress),
  });
}

export async function send({
  secretKey,
  url,
  port,
}) {
  const keypair = web3.Keypair.fromSecretKey(secretKey);

  try {
    await airdropsender.send({
      db,
      keypair,
      url,
    });
  } catch (error) {
    if (port) {
      port.postMessage({ error: error instanceof Error ? error.message : String(error) });
    }
    throw error;
  }
}

export async function poll({ url, port }) {
  try {
    await airdropsender.poll({ db, url });
  } catch (error) {
    if (port) {
      port.postMessage({ error: error instanceof Error ? error.message : String(error) });
    }
    throw error;
  }
}
