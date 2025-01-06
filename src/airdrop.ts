import { PublicKey, Keypair } from "@solana/web3.js";
import { main as airdrop } from "./airship-ts/index";
export class Airdrop {
    id: string;
    finished: boolean;
    mintAddress: string;
    targetAddresses: PublicKey[]
    amount: bigint
    keypair: Keypair
    constructor(id: string, keypair: Keypair, mintAddress: string, targetAddresses: PublicKey[], amount: bigint) {
        this.finished = false;
        this.mintAddress = mintAddress;
        this.targetAddresses = targetAddresses;
        this.amount = amount;
        this.keypair = keypair;
        this.id = id;
    }
    async run() {
        if (this.finished) throw new Error("Airdrop already ran");
       await airdrop(this.keypair, process.env.RPC_URL, this.mintAddress, this.targetAddresses, this.amount);
       this.finished = true;
    }
}