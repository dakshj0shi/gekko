/**
 * Gekko setup script.
 *
 * 1. Generates 4 fresh EOA keypairs (orchestrator, researcher, writer; validator shares researcher)
 * 2. Upgrades each EOA to a smart account via EIP-7702 through the 1Shot relayer
 * 3. Builds the ERC-7710 delegation chain (orchestrator → workers)
 * 4. Writes all keys and addresses to .env
 * 5. Saves the delegation chain to src/delegations.json
 *
 * Run once before starting the server:
 *   npm run setup
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { ethers } = require('ethers');
const OneShotClient = require('./oneshot');
const { createDelegationChain, saveDelegations } = require('./delegation');

const ENV_PATH = path.join(__dirname, '..', '.env');

function prompt(rl, question) {
  return new Promise(resolve => rl.question(question, resolve));
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log('\n═══════════════════════════════════════════════════');
  console.log('  GEKKO SETUP — MetaMask Smart Accounts x 1Shot');
  console.log('═══════════════════════════════════════════════════\n');

  const oneShotKey = await prompt(rl, '1Shot API key: ');
  const veniceKey = await prompt(rl, 'Venice AI API key: ');
  const rpcUrl = await prompt(rl, 'RPC URL (e.g. https://sepolia.base.org): ');
  const chainId = await prompt(rl, 'Chain ID (84532 for Base Sepolia, 8453 for Base Mainnet): ');
  const usdcAddress = await prompt(rl, 'USDC address (enter for Base Sepolia default): ');
  const delegationManager = await prompt(rl, 'DelegationManager address (or blank to skip 7702): ');
  const userAddress = await prompt(rl, 'Your MetaMask wallet address (root delegation): ');

  const resolvedChainId = chainId.trim() || '84532';
  const resolvedUsdc = usdcAddress.trim() || '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
  const resolvedDelegationManager = delegationManager.trim() || '0x0000000000000000000000000000000000000000';

  console.log('\n[1/4] Generating agent keypairs...');

  const orchestratorWallet = ethers.Wallet.createRandom();
  const researcherWallet = ethers.Wallet.createRandom();
  const writerWallet = ethers.Wallet.createRandom();

  console.log(`  Orchestrator: ${orchestratorWallet.address}`);
  console.log(`  Researcher:   ${researcherWallet.address}`);
  console.log(`  Writer:       ${writerWallet.address}`);
  console.log(`  Validator:    ${researcherWallet.address} (shares researcher wallet)`);

  console.log('\n[2/4] Upgrading EOAs via 1Shot EIP-7702...');

  const oneshot = new OneShotClient(oneShotKey.trim());

  for (const [name, wallet] of [
    ['Orchestrator', orchestratorWallet],
    ['Researcher', researcherWallet],
    ['Writer', writerWallet],
  ]) {
    if (resolvedDelegationManager === '0x0000000000000000000000000000000000000000') {
      console.log(`  - ${name}: skipped (no DelegationManager address provided)`);
      continue;
    }
    try {
      const authorizationSig = await wallet.signMessage(
        `Authorize 7702 upgrade to ${resolvedDelegationManager} on chain ${resolvedChainId}`
      );
      await oneshot.upgrade7702({
        address: wallet.address,
        implementation: resolvedDelegationManager,
        signature: authorizationSig,
        chainId: resolvedChainId,
      });
      console.log(`  + ${name}: upgraded`);
    } catch (err) {
      console.log(`  ! ${name}: upgrade failed (${err.message}) — continuing with EOA`);
    }
  }

  console.log('\n[3/4] Building ERC-7710 delegation chain...');

  try {
    const chain = await createDelegationChain({
      userAddress: userAddress.trim() || ethers.ZeroAddress,
      orchestratorAddress: orchestratorWallet.address,
      workerAddresses: {
        researcher: researcherWallet.address,
        validator: researcherWallet.address,
        writer: writerWallet.address,
      },
      orchestratorSigner: orchestratorWallet,
      usdcAddress: resolvedUsdc,
      chainId: parseInt(resolvedChainId),
      delegationManagerAddress: resolvedDelegationManager,
    });

    saveDelegations(chain);
    console.log('  + Delegation chain saved to src/delegations.json');
  } catch (err) {
    console.log(`  ! Delegation chain failed: ${err.message}`);
  }

  console.log('\n[4/4] Writing .env...');

  const envContent = [
    '# Network',
    `NETWORK_NAME=${resolvedChainId === '8453' ? 'base' : 'base-sepolia'}`,
    `CHAIN_ID=${resolvedChainId}`,
    `RPC_URL=${rpcUrl.trim()}`,
    `USDC_ADDRESS=${resolvedUsdc}`,
    `DELEGATION_MANAGER=${resolvedDelegationManager}`,
    '',
    '# Agent Keys',
    `ORCHESTRATOR_PRIVATE_KEY=${orchestratorWallet.privateKey}`,
    `ORCHESTRATOR_ADDRESS=${orchestratorWallet.address}`,
    `RESEARCHER_PRIVATE_KEY=${researcherWallet.privateKey}`,
    `RESEARCHER_ADDRESS=${researcherWallet.address}`,
    `WRITER_PRIVATE_KEY=${writerWallet.privateKey}`,
    `WRITER_ADDRESS=${writerWallet.address}`,
    '',
    '# 1Shot Relayer',
    `ONESHOT_API_KEY=${oneShotKey.trim()}`,
    `ONESHOT_BASE_URL=https://api.1shot.io`,
    `ONESHOT_WEBHOOK_SECRET=`,
    '',
    '# Venice AI',
    `VENICE_API_KEY=${veniceKey.trim()}`,
    '',
    '# x402',
    `X402_ENDPOINT_BASE=http://localhost:3001`,
    `X402_TREASURY_ADDRESS=${orchestratorWallet.address}`,
    '',
    '# System',
    `PORT=3001`,
    `DEPLOYED_URL=`,
    `DISPATCH_API_KEY=`,
  ].join('\n');

  fs.writeFileSync(ENV_PATH, envContent);
  console.log('  + .env written');

  rl.close();

  console.log('\n═══════════════════════════════════════════════════');
  console.log('  SETUP COMPLETE');
  console.log('═══════════════════════════════════════════════════');
  console.log('\nNext steps:');
  console.log('  1. Fund wallets with USDC on Base Sepolia');
  console.log(`     Orchestrator: ${orchestratorWallet.address}`);
  console.log(`     Researcher:   ${researcherWallet.address}`);
  console.log(`     Writer:       ${writerWallet.address}`);
  console.log('  2. npm run build && npm start');
  console.log('  3. Open http://localhost:3001, connect MetaMask, grant permissions\n');
}

main().catch(err => {
  console.error('Setup failed:', err);
  process.exit(1);
});
