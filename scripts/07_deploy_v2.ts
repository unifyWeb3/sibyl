import { config } from "dotenv";
config({ path: ".env.local" });
import 'dotenv/config';
import { JsonRpcProvider, Wallet, ContractFactory } from 'ethers';
import solc from 'solc';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';
import { config } from 'dotenv';


config({ path: '.env.local' });

const CONTRACTS_PATH = '.sibyl/contracts.json';

async function loadCompiler() {
    const input = readFileSync('contracts/SibylAttestationsV2.sol', 'utf-8');
    const compilerInput = JSON.stringify({
        language: 'Solidity',
        sources: { 'SibylAttestationsV2.sol': { content: input } },
        settings: { outputSelection: { '*': { '*': ['abi', 'evm.bytecode'] } } },
    });
    const output = JSON.parse(solc.compile(compilerInput));
    if (output.errors) {
        const errs = output.errors.filter((e: any) => e.severity === 'error');
        if (errs.length) throw new Error(errs.map((e: any) => e.formattedMessage).join('\n'));
    }
    return output.contracts['SibylAttestationsV2.sol']['SibylAttestationsV2'];
}

async function main() {

    const provider = new JsonRpcProvider(process.env.KITE_RPC_URL!);
    const signer = new Wallet(process.env.HACKATHON_PRIVATE_KEY!, provider);
    const bal = await provider.getBalance(signer.address);
console.log(`Deployer: ${signer.address} | Balance: ${Number(await provider.getBalance(signer.address)) / 1e18} KITE`);

    const artifact = await loadCompiler();
    const factory = new ContractFactory(artifact.abi, artifact.evm.bytecode.object, signer);

    console.log('Deploying SibylAttestationsV2...');
    const contract = await factory.deploy();
    await contract.waitForDeployment();
    const address = await contract.getAddress();
    const tx = contract.deploymentTransaction()!;
    await tx.wait(2);

    console.log(`✓ Deployed at ${address}`);
    console.log(`→ https://testnet.kitescan.ai/address/${address}`);

    if (!existsSync('.sibyl')) mkdirSync('.sibyl');
    const current = existsSync(CONTRACTS_PATH) ? JSON.parse(readFileSync(CONTRACTS_PATH, 'utf-8')) : { network: 'kite_testnet', chainId: 2368, contracts: {} };
    current.contracts.SibylAttestationsV2 = { address, deployTxHash: tx.hash, deployedAt: new Date().toISOString() };
    writeFileSync(CONTRACTS_PATH, JSON.stringify(current, null, 2));
    console.log('✓ Registry updated');
}

main().catch((e) => { console.error(e); process.exit(1); });