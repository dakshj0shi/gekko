/**
 * ERC-7710 delegation management using @metamask/smart-accounts-kit.
 *
 * Delegation chain:
 *   User MetaMask (smart account, root delegator)
 *     └─ GekkoOrchestrator  (session account — ERC-7715 permission)
 *         ├─ GekkoResearcher  (sub-delegation, $0.25 USDC cap)
 *         ├─ GekkoValidator   (sub-delegation, $0.10 USDC cap)
 *         └─ GekkoWriter      (sub-delegation, $0.25 USDC cap)
 *
 * The root user → orchestrator delegation is created via wallet_grantPermissions
 * (ERC-7715) in the browser. Sub-delegations are built here server-side using
 * the orchestrator's private key and the toolkit's createDelegation API.
 */
const fs = require('fs');
const path = require('path');

const DELEGATIONS_PATH = path.join(__dirname, 'delegations.json');

/**
 * Create sub-delegations from orchestrator to worker agents.
 * Uses @metamask/smart-accounts-kit createDelegation + signDelegation.
 * Dynamic import because smart-accounts-kit is ESM.
 *
 * @param {object} params
 * @param {string} params.orchestratorAddress
 * @param {object} params.workerAddresses - { researcher, validator, writer }
 * @param {string} params.orchestratorPrivateKey
 * @param {string} params.usdcAddress
 * @param {number} params.chainId
 * @param {string} [params.parentPermissionContext] - ERC-7715 context from MetaMask (hex)
 */
async function createSubDelegations({
  orchestratorAddress,
  workerAddresses,
  orchestratorPrivateKey,
  usdcAddress,
  chainId,
  parentPermissionContext = null,
}) {
  const { createDelegation, getSmartAccountsEnvironment, ScopeType, toMetaMaskSmartAccount, Implementation } = await import('@metamask/smart-accounts-kit');
  const { createPublicClient, http, parseUnits } = await import('viem');
  const { privateKeyToAccount } = await import('viem/accounts');
  const { baseSepolia, base } = await import('viem/chains');
  const { NETWORK } = require('./config');

  const chain = chainId === 8453 ? base : baseSepolia;
  const publicClient = createPublicClient({ chain, transport: http(NETWORK.rpcUrl) });

  const orchestratorEOA = privateKeyToAccount(orchestratorPrivateKey);
  const orchestratorSmartAccount = await toMetaMaskSmartAccount({
    client: publicClient,
    implementation: Implementation.Hybrid,
    deployParams: [orchestratorEOA.address, [], [], []],
    deploySalt: '0x',
    signer: { account: orchestratorEOA },
  });

  const environment = getSmartAccountsEnvironment(chainId);

  const subDelegations = {};
  const workerCaps = {
    researcher: parseUnits('0.25', 6),
    validator:  parseUnits('0.10', 6),
    writer:     parseUnits('0.25', 6),
  };

  for (const [role, delegateAddress] of Object.entries(workerAddresses)) {
    const delegationParams = {
      from: orchestratorAddress,
      to: delegateAddress,
      environment,
      scope: {
        type: ScopeType.Erc20TransferAmount,
        tokenAddress: usdcAddress,
        maxAmount: workerCaps[role] || parseUnits('0.10', 6),
      },
    };

    // If orchestrator has a parent permission context (from user ERC-7715 grant), chain from it
    if (parentPermissionContext) {
      delegationParams.parentPermissionContext = parentPermissionContext;
    }

    const delegation = createDelegation(delegationParams);
    const signature = await orchestratorSmartAccount.signDelegation({ delegation });
    subDelegations[role] = { ...delegation, signature };
  }

  return {
    subDelegations,
    orchestratorAddress,
    metadata: {
      createdAt: new Date().toISOString(),
      chainId,
      usdcAddress,
      environment: {
        DelegationManager: environment.DelegationManager,
      },
    },
  };
}

/** Persist delegation chain to disk. */
function saveDelegations(chain) {
  fs.writeFileSync(DELEGATIONS_PATH, JSON.stringify(chain, null, 2));
}

/** Load delegation chain from disk. Returns null if not found. */
function loadDelegations() {
  if (!fs.existsSync(DELEGATIONS_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(DELEGATIONS_PATH, 'utf8'));
  } catch { return null; }
}

/**
 * Returns a flat UI-friendly representation of the delegation chain.
 * If delegations.json exists uses it; otherwise returns the static config-based chain.
 */
function getDelegationChain() {
  const { AGENTS, NETWORK } = require('./config');
  const chain = loadDelegations();

  if (chain?.subDelegations) {
    const result = [
      {
        from: process.env.USER_WALLET_ADDRESS || 'user',
        to: AGENTS.orchestrator.address,
        role: 'orchestrator',
        type: 'ERC-7715 (wallet_grantPermissions)',
        authority: 'root',
        caveats: [{ type: 'erc20-token-allowance', token: NETWORK.usdcAddress }],
        signed: true,
      },
    ];
    for (const [role, d] of Object.entries(chain.subDelegations)) {
      result.push({
        from: d.delegator || AGENTS.orchestrator.address,
        to: d.delegate || AGENTS[role]?.address,
        role,
        type: 'ERC-7710 (createDelegation)',
        authority: 'sub-delegation',
        caveats: d.caveats || [],
        signed: !!d.signature,
      });
    }
    return result;
  }

  // Static fallback — shows chain without signatures
  return [
    {
      from: process.env.USER_WALLET_ADDRESS || '0x…',
      to: AGENTS.orchestrator.address,
      role: 'orchestrator',
      type: 'ERC-7715 (wallet_grantPermissions)',
      authority: 'root',
      caveats: [{ type: 'erc20-token-allowance', token: NETWORK.usdcAddress }],
      signed: false,
    },
    {
      from: AGENTS.orchestrator.address,
      to: AGENTS.researcher.address,
      role: 'researcher',
      type: 'ERC-7710 (createDelegation)',
      authority: 'sub-delegation',
      caveats: [{ type: 'erc20TransferAmount', maxAmount: '250000' }],
      signed: false,
    },
    {
      from: AGENTS.orchestrator.address,
      to: AGENTS.validator.address,
      role: 'validator',
      type: 'ERC-7710 (createDelegation)',
      authority: 'sub-delegation',
      caveats: [{ type: 'erc20TransferAmount', maxAmount: '100000' }],
      signed: false,
    },
    {
      from: AGENTS.orchestrator.address,
      to: AGENTS.writer.address,
      role: 'writer',
      type: 'ERC-7710 (createDelegation)',
      authority: 'sub-delegation',
      caveats: [{ type: 'erc20TransferAmount', maxAmount: '250000' }],
      signed: false,
    },
  ];
}

module.exports = {
  createSubDelegations,
  saveDelegations,
  loadDelegations,
  getDelegationChain,
};
