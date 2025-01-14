#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import * as web3 from "@solana/web3.js";
import {
  status,
  logger,
  AirdropError,
  init,
  databaseFile,
} from "helius-airship-core";
import ora, { Ora } from "ora";
import { csv } from "./imports/csv";
import { chapter2 } from "./imports/chapter-2";
import { nft } from "./imports/nft";
import { splToken } from "./imports/spl-token";
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
  // const program = createCommandProgram();
  // @ts-ignore
  await init({ db });
  await handleNewAirdrop(keypair, { url }, mintAddress, addresses, amount);
  // console.log("here");
  // program.action(async () => {
  //   const options = program.opts();
  //   validateOptions(options);

  //   const keypair = loadKeypair(options.keypair);

  //   // Initialize the database
  //   // @ts-ignore


  //   const action = await selectAction();

  //   switch (action) {
  //     case "new":
  //       await handleNewAirdrop(keypair, options);
  //       break;
  //     case "resume":
  //       await resumeAirdrop(keypair, options.url);
  //       break;
  //     case "exit":
  //       exitProgram();
  //   }
  // });

  // program.parse();
}

function createCommandProgram() {
  return new Command()
    .name("airdrop")
    .description("Airdrop tokens using ZK Compression")
    .option("-k, --keypair <KEYPAIR>", "Keypair to use for the airdrop")
    .option(
      "-u, --url <URL>",
      "URL for Solana's JSON RPC with ZK Compression support"
    )
    .version(
      "0.8.2",
      "-v, --version",
      "display the version number"
    );
}

function validateOptions(options: any) {
  if (!options.keypair) {
    console.log(
      chalk.red("Please provide a keypair using the --keypair option")
    );
    process.exit(0);
  }
  if (!options.url) {
    console.log(chalk.red("Please provide a RPC url using the --url option"));
    process.exit(0);
  }
}

async function handleNewAirdrop(keypair: web3.Keypair, options: any, mintAddress: string, addresses: web3.PublicKey[], amount: bigint) {
  // await checkAndConfirmOverwrite();
  // const tokens = await loadTokens(keypair, options.url);
  // const mintAddress = await selectToken(keypair, tokens);
  // const addresses = await selectRecipients(options.url);
  // const amount = await selectAmount(tokens, mintAddress, addresses.length);
  // await confirmAirdrop(
  //   options.url,
  //   keypair,
  //   mintAddress,
  //   addresses,
  //   amount,
  //   tokens
  // );
  await createAirdropQueue(keypair, mintAddress, addresses, amount);
  await startAndMonitorAirdrop(keypair, options.url);
}

async function createAirdropQueue(
  keypair: web3.Keypair,
  mintAddress: string,
  addresses: web3.PublicKey[],
  amount: bigint
) {
  const createSpinner = ora("Creating transaction queue").start();
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
    createSpinner.succeed("Transaction queue created");
  } catch (error) {
    createSpinner.fail("Failed to create transaction queue");
    logger.error("Failed to create transaction queue", error);
    process.exit(0);
  }
}

async function resumeAirdrop(keypair: web3.Keypair, url: string) {
  console.log(chalk.green(`Resuming airdrop...`));
  await startAndMonitorAirdrop(keypair, url);
}

async function startAndMonitorAirdrop(keypair: web3.Keypair, url: string) {
  const startSpinner = ora("Starting airdrop");
  try {
    startSpinner.start();

    // Worker to send transactions
    const mcSend = new MessageChannel();

    pool.run({ secretKey: keypair.secretKey, url: url, port: mcSend.port1 }, {
      name: "send",
      transferList: [mcSend.port1],
    });

    mcSend.port2.on('message', (message: any) => {
      if (message.error) {
        handleAirdropError(startSpinner, new Error(message.error));
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
        handleAirdropError(startSpinner, new Error(message.error));
      }
    });

    startSpinner.succeed("Airdrop started");
  } catch (error) {
    handleAirdropError(startSpinner, error);
  }

  // const multibar = createProgressBars();
  // await monitorAirdropProgress(multibar);
}

export async function getAirdropStatus() {
  return await status({ db });
}

function handleAirdropError(spinner: Ora, error: any) {
  spinner.fail("Failed to start airdrop");
  if (error instanceof AirdropError) {
    console.error(chalk.red(error.message));
  } else {
    console.error(chalk.red(error));
  }
  process.exit(0);
}

function handleExitError(error: any) {
  if (error.name === "ExitPromptError") {
    exitProgram();
  }
}

function exitProgram() {
  console.log(chalk.green("\nExiting..."));
  process.exit(0);
}

