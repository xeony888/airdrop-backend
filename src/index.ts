import express, { Express, Request, Response } from "express";
import dotenv from "dotenv";
import bs58 from "bs58";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { generateId } from "./utils";
import { main as airdrop, getAirdropStatus } from "./airship-ts/index"
import { Airdrop } from "./airdrop";
import { verifyAirdrop, verifySig } from "./middleware";
import { PrismaClient } from "@prisma/client";
import { type Airdrop as AirdropModel } from "@prisma/client";
import { getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";
import cors from "cors";

declare global {
    namespace Express {
        interface Request {
            airdrop?: AirdropModel;
        }
    }
}

const PORT = process.env.PORT || 3001;
dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());

export const prisma = new PrismaClient();
const connection = new Connection(process.env.RPC_URL);
const airdropqueue: Airdrop[] = [];
let inProgressStatus: { total: any, sent: any, finalized: any } = { total: 1, sent: 1, finalized: 1 };
app.get("/:wallet/airdrops", async (req, res) => {
    try {
        const { wallet } = req.query as { wallet: string };
        const airdrops = await prisma.airdrop.findMany({
            where: {
                owner: wallet
            }
        })
        res.status(200).json(airdrops.map((airdrop) => {
            return {
                pubkey: Keypair.fromSecretKey(bs58.decode(airdrop.pkey)).publicKey.toString(),
                id: airdrop.id
            }
        }));
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Internal server error" });
    }
})
app.get("/poll/:id", async (req, res) => {
    try {
        const { id } = req.params;
        console.log(id);
        const airdropIndex = airdropqueue.findIndex((airdrop) => airdrop.id === String(id));
        console.log(airdropqueue);
        if (airdropIndex !== undefined) {
            if (airdropIndex === 0) {
                res.status(200).json({ queuePosition: 0, percentage: inProgressStatus.finalized / inProgressStatus.total * 100 })
            } else {
                res.status(200).json({ queuePosition: airdropIndex, percentage: 0 })
            }
        } else {
            res.status(404).json({ error: "Not found" });
        }
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Internal server error" });
    }
})
app.post("/airdrop/create", verifySig, async (req, res) => {
    try {
        const { pubkey, mintAddress } = req.body;
        const keypair = Keypair.generate();
        const airdrop = await prisma.airdrop.create({
            data: {
                id: generateId(),
                owner: pubkey,
                pkey: bs58.encode(keypair.secretKey),
                mintAddress,
            }
        });
        res.status(200).json({ id: airdrop.id, publicKey: keypair.publicKey.toString() })
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Internal server error" });
    }
})
app.post("/airdrop", verifySig, verifyAirdrop, async (req, res) => {
    try {
        let { targetAddresses, amount } = req.body;
        const keypair = Keypair.fromSecretKey(bs58.decode(req.airdrop.pkey));
        const mint = new PublicKey(req.airdrop.mintAddress);
        const account = getAssociatedTokenAddressSync(mint, keypair.publicKey);
        const data = await getAccount(connection, account);
        if (data.amount < BigInt(targetAddresses.length) * BigInt(amount)) {
            res.status(403).json({ error: "Airdrop not possible" })
            return;
        }
        const targetAddressesKeys: PublicKey[] = targetAddresses.map((address: string) => new PublicKey(address));
        const airdrop = new Airdrop(req.airdrop!.id, keypair, req.airdrop.mintAddress, targetAddressesKeys, BigInt(amount));
        airdropqueue.push(airdrop);
        res.status(200).json({ id: req.airdrop!.id });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Internal server error" });
    }
})
async function main() {
    console.log(`Node.js version: ${process.version}`);
    while (true) {
        const airdrop = airdropqueue[0];
        if (airdrop) {
            await airdrop.run();
            while (true) {
                const airdropStatus = await getAirdropStatus();
                inProgressStatus = airdropStatus;
                if (airdropStatus.finalized === airdropStatus.total) {
                    console.log(`Finished ${airdrop.id}`);
                    break;
                }
                await new Promise((resolve) => setTimeout(resolve, 1000));
            }
            airdropqueue.splice(0, 1);
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
}
main()

app.listen(PORT, () => {
    console.log(`App listening on ${PORT}`);
})