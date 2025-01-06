import { Request, Response, NextFunction } from "express";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { prisma } from ".";

export async function verifySig(req: Request, res: Response, next: NextFunction) {
  try {
    const { sig, message, pubkey } = req.body;
    if (!sig || !message || !pubkey) {
        res.status(400).json({ error: "Missing signature, message or public key" });
        return;
    }

    // Decode the base58-encoded signature and convert the public key to bytes
    const signature = bs58.decode(sig);
    const publicKeyBytes = new PublicKey(pubkey).toBytes();
    const messageBytes = new TextEncoder().encode(message);

    // Verify the signature
    const isValid = nacl.sign.detached.verify(messageBytes, signature, publicKeyBytes);
    if (!isValid) {
        res.status(400).json({ error: "Invalid signature" });
        return;
    }

    // If valid, proceed to next handler
    next();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function verifyAirdrop(req: Request, res: Response, next: NextFunction) {
    try {
        const { id, pubkey } = req.body;
        const airdrop = await prisma.airdrop.findUniqueOrThrow({
            where: {
                id
            }
        })
        if (airdrop.owner === pubkey) {
            req.airdrop = airdrop;
            next();
        } else {
            res.status(404).json({ error: "Unauthorized" });
        }
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Internal server error" });
    }
}