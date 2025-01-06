import fs from "fs";
import { Keypair } from "@solana/web3.js"


const letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890"
export function generateId(): string {
    return Array.from({length: 32}).map(() => letters[Math.floor(Math.random() * letters.length)]).reduce((prev, curr) => prev + curr, "");
}