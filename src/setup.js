/**
 * Gekko setup script.
 *
 * 1. Generates 4 fresh EOA keypairs (orchestrator, researcher, writer; validator shares researcher)
 * 2. Deploys the MetaMask Delegation Framework contracts to the target chain
 *    using deploySmartAccountsEnvironment from @metamask/smart-accounts-kit
 * 3. Writes all keys, addresses, and deployed contract addresses to .env
 *
 * Run once before starting the server:
 *   npm run setup
 *
 * EIP-7702 smart account upgrade for agent wallets is handled automatically
 * by MetaMask Flask 13.9.0+ when wallet_grantPermissions is called.
 *
 * Sub-delegations (orchestrator → workers) are created on-the-fly at runtime
 * using createSubDelegations() in src/delegation.js — no static JSON needed.
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { ethers } = require('ethers');

const ENV_PATH = path.join(__dirname, '..', '.env');

function prompt(rl, question) {
  return new Promise(resolve => rl.question(question, resolve));
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  GEKKO SETUP — MetaMask Smart Accounts Kit × Venice AI');
  console.log('═══════════════════════════════════════════════════════════\n');

  const veniceKey  = await prompt(rl, 'Venice AI API key: ');
  const rpcUrl     = await prompt(rl, 'RPC URL (default: https://sepolia.base.org): ');
  const chainIdIn  = await prompt(rl, 'Chain ID (default: 84532 for Base Sepolia): ');
  const usdcIn     = await prompt(rl, 'USDC address (enter for Base Sepolia default): ');
  const userAddr   = await prompt(rl, 'Your MetaMask wallet address (root delegator): ');
  const deployEnv  = await prompt(rl, 'Deploy Delegation Framework contracts? (y/N): ');

  const resolvedRpc    = rpcUrl.trim()    || 'https://sepolia.base.org';
  const resolvedChain  = chainIdIn.trim() || '84532';
  const resolvedUsdc   = usdcIn.trim()    || '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
  const shouldDeploy   = deployEnv.trim().toLowerCase() === 'y';

  console.log('\n[1/3] Generating agent keypairs...');

  const orchestratorWallet = ethers.Wallet.createRandom();
  const researcherWallet   = ethers.Wallet.createRandom();
  const writerWallet       = ethers.Wallet.createRandom();

  console.log(`  Orchestrator: ${orchestratorWallet.address}`);
  console.log(`  Researcher:   ${researcherWallet.address}`);
  console.log(`  Writer:       ${writerWallet.address}`);
  console.log(`  Validator:    ${researcherWallet.address} (shares researcher keypair)`);

  let deployedEnvJson = null;

  if (shouldDeploy) {
    console.log('\n[2/3] Deploying Delegation Framework contracts...');

    try {
      const { deploySmartAccountsEnvironment } = await import('@metamask/smart-accounts-kit/utils');
      const { createPublicClient, createWalletClient, http } = await import('viem');
      const { privateKeyToAccount } = await import('viem/accounts');
      const { baseSepolia, base } = await import('viem/chains');

      const chain = resolvedChain === '8453' ? base : baseSepolia;
      const deployerAccount = privateKeyToAccount(orchestratorWallet.privateKey);

      const publicClient = createPublicClient({ chain, transport: http(resolvedRpc) });
      const walletClient = createWalletClient({
        account: deployerAccount,
        chain,
        transport: http(resolvedRpc),
      });

      console.log(`  Deploying from: ${deployerAccount.address}`);
      console.log('  This requires ETH for gas. Make sure the Orchestrator wallet is funded.');

      const environment = await deploySmartAccountsEnvironment(walletClient, publicClient, chain);

      deployedEnvJson = JSON.stringify({
        DelegationManager: environment.DelegationManager,
        EIP7702StatelessDeleGatorImpl: environment.implementations?.EIP7702StatelessDeleGatorImpl,
      }, null, 2);

      console.log(`  DelegationManager:          ${environment.DelegationManager}`);
      console.log(`  EIP7702StatelessDeleGatorImpl: ${environment.implementations?.EIP7702StatelessDeleGatorImpl}`);

      fs.writeFileSync(
        path.join(__dirname, 'environment.json'),
        deployedEnvJson
      );
      console.log('  + Deployed environment saved to src/environment.json');
    } catch (err) {
      console.log(`  ! Deploy failed: ${err.message}`);
      console.log('  Continuing — getSmartAccountsEnvironment() will resolve pre-deployed addresses.');
    }
  } else {
    console.log('\n[2/3] Skipping contract deployment (using pre-deployed addresses from getSmartAccountsEnvironment)');
  }

  console.log('\n[3/3] Writing .env...');

  const facilitatorUrl = resolvedChain === '8453'
    ? 'https://tx-sentinel-base-mainnet.dev-api.cx.metamask.io/platform/v2/x402'
    : 'https://tx-sentinel-base-sepolia.dev-api.cx.metamask.io/platform/v2/x402';

  const envLines = [
    '# Network',
    `NETWORK_NAME=${resolvedChain === '8453' ? 'base' : 'base-sepolia'}`,
    `CHAIN_ID=${resolvedChain}`,
    `RPC_URL=${resolvedRpc}`,
    `USDC_ADDRESS=${resolvedUsdc}`,
    '',
    '# Agent Keys (EOA keypairs — upgraded to smart accounts by MetaMask Flask automatically)',
    `ORCHESTRATOR_PRIVATE_KEY=${orchestratorWallet.privateKey}`,
    `ORCHESTRATOR_ADDRESS=${orchestratorWallet.address}`,
    `RESEARCHER_PRIVATE_KEY=${researcherWallet.privateKey}`,
    `RESEARCHER_ADDRESS=${researcherWallet.address}`,
    `WRITER_PRIVATE_KEY=${writerWallet.privateKey}`,
    `WRITER_ADDRESS=${writerWallet.address}`,
    '',
    '# User MetaMask wallet (root delegator — ERC-7715 grants permission to Orchestrator)',
    `USER_WALLET_ADDRESS=${userAddr.trim()}`,
    '',
    '# Venice AI',
    `VENICE_API_KEY=${veniceKey.trim()}`,
    '',
    '# x402 — set X402_ENABLED=true to require real ERC-7710 delegation payments',
    `X402_ENDPOINT_BASE=http://localhost:3001`,
    `X402_TREASURY_ADDRESS=${orchestratorWallet.address}`,
    `X402_FACILITATOR_URL=${facilitatorUrl}`,
    `X402_ENABLED=false`,
    '',
    '# System',
    `PORT=3001`,
    `DEPLOYED_URL=`,
    `DISPATCH_API_KEY=`,
  ];

  fs.writeFileSync(ENV_PATH, envLines.join('\n'));
  console.log('  + .env written');

  rl.close();

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  SETUP COMPLETE');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('\nNext steps:');
  console.log('  1. Install MetaMask Flask 13.9.0+ in your browser');
  console.log('  2. Fund agent wallets with Base Sepolia USDC (for real payments):');
  console.log(`       Orchestrator: ${orchestratorWallet.address}`);
  console.log(`       Researcher:   ${researcherWallet.address}`);
  console.log(`       Writer:       ${writerWallet.address}`);
  console.log('     Get Base Sepolia USDC: https://faucet.circle.com');
  console.log('  3. npm run build && npm start');
  console.log('  4. Open http://localhost:3001, connect MetaMask Flask, click Grant Permissions');
  console.log('  5. Set X402_ENABLED=true in .env when wallets are funded\n');
}

main().catch(err => {
  console.error('Setup failed:', err);
  process.exit(1);
});
