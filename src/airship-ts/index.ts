#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import * as web3 from "@solana/web3.js";
import {
  status,
  init,
  databaseFile,
} from "helius-airship-core";
import Tinypool from "tinypool";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { MessageChannel } from 'worker_threads'

process.on("SIGINT", exitProgram);
process.on("SIGTERM", exitProgram);

const pool = new Tinypool({
  filename: "./src/airship-ts/worker.js"
});

// Load the database
const sqlite = new Database(databaseFile);
sqlite.exec("PRAGMA journal_mode = WAL;");
sqlite.exec("PRAGMA synchronous = normal;");

const db = drizzle(sqlite);

export async function main(keypair: web3.Keypair, url: string, mintAddress: string, addresses: web3.PublicKey[], amount: bigint) {
  // @ts-ignore
  await init({ db });
  await handleNewAirdrop(keypair, { url }, mintAddress, addresses, amount);
}


async function handleNewAirdrop(keypair: web3.Keypair, options: any, mintAddress: string, addresses: web3.PublicKey[], amount: bigint) {
  await createAirdropQueue(keypair, mintAddress, addresses, amount);
  await startAndMonitorAirdrop(keypair, options.url);
}

async function createAirdropQueue(
  keypair: web3.Keypair,
  mintAddress: string,
  addresses: web3.PublicKey[],
  amount: bigint
) {
  try {
    await pool.run(
      {
        signer: keypair.publicKey.toBase58(),
        addresses: addresses.map((address) => address.toBase58()),
        amount: amount,
        mintAddress: mintAddress,
      },
      { name: "create" }
    );
  } catch (error) {
    // logger.error("Failed to create transaction queue", error);
    // process.exit(0);
  }
}

async function startAndMonitorAirdrop(keypair: web3.Keypair, url: string) {
  try {

    // Worker to send transactions
    const mcSend = new MessageChannel();

    pool.run({ secretKey: keypair.secretKey, url: url, port: mcSend.port1 }, {
      name: "send",
      transferList: [mcSend.port1],
    });

    mcSend.port2.on('message', (message: any) => {
      if (message.error) {
      }
    });

    // Worker to poll for transaction confirmations
    const mcPoll = new MessageChannel();

    pool.run({ url, port: mcPoll.port1 }, {
      name: "poll",
      transferList: [mcPoll.port1],
    });

    mcPoll.port2.on('message', (message: any) => {
      if (message.error) {
      }
    });
  } catch (error) {
  }

  // const multibar = createProgressBars();
  // await monitorAirdropProgress(multibar);
}

export async function getAirdropStatus() {
  return await status({ db });
}



function exitProgram() {
  console.log(chalk.green("\nExiting..."));
  process.exit(0);
}

