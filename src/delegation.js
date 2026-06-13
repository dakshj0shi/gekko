/**
 * ERC-7710 delegation management for Gekko.
 *
 * Implements agent-to-agent (A2A) coordination via the ERC-7710
 * Delegation Framework. The user grants a root delegation to the
 * Orchestrator; the Orchestrator creates sub-delegations for each
 * worker agent with spending caveats.
 *
 * Delegation chain:
 *   User Wallet (root authority)
 *     └─ GekkoOrchestrator (spendCap: $1.00 USDC per goal)
 *         ├─ GekkoResearcher  (spendCap: $0.25 USDC)
 *         ├─ GekkoValidator   (spendCap: $0.10 USDC)
 *         └─ GekkoWriter      (spendCap: $0.25 USDC)
 */
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const DELEGATIONS_PATH = path.join(__dirname, 'delegations.json');

// ERC-7710 delegation type hash
const DELEGATION_TYPE = 'Delegation(address delegate,bytes32 authority,bytes[] caveats,uint256 salt)';

/**
 * Build an ERC-7710 delegation object.
 * @param {object} params
 * @param {string} params.delegator - Address granting the delegation
 * @param {string} params.delegate - Address receiving the delegation
 * @param {string} [params.authority] - Parent delegation hash, or ROOT_AUTHORITY for user-origin
 * @param {Array}  [params.caveats] - Spending limits and other constraints
 * @param {string} [params.salt] - Unique salt to distinguish delegations
 */
function buildDelegation({ delegator, delegate, authority = ethers.ZeroHash, caveats = [], salt = null }) {
  return {
    delegator,
    delegate,
    authority,
    caveats,
    salt: salt || ethers.hexlify(ethers.randomBytes(32)),
    signature: null, // set after signing
  };
}

/**
 * Build a USDC spending caveat for a delegation.
 * Constrains how much USDC the delegate can spend via this delegation.
 */
function buildSpendingCaveat(usdcAddress, maxAmountUsdc) {
  const maxAmountRaw = BigInt(Math.floor(maxAmountUsdc * 1e6));
  return {
    enforcer: 'ERC20TransferAmountEnforcer',
    terms: ethers.AbiCoder.defaultAbiCoder().encode(
      ['address', 'uint256'],
      [usdcAddress, maxAmountRaw]
    ),
  };
}

/**
 * Sign a delegation with the delegator's private key (EIP-712).
 * @param {ethers.Wallet} signer - Delegator's signer
 * @param {object} delegation - Delegation object from buildDelegation()
 * @param {number} chainId - Chain ID for EIP-712 domain
 * @param {string} delegationManagerAddress - Deployed DelegationManager contract address
 */
async function signDelegation(signer, delegation, chainId, delegationManagerAddress) {
  const domain = {
    name: 'DelegationManager',
    version: '1',
    chainId,
    verifyingContract: delegationManagerAddress,
  };

  const types = {
    Delegation: [
      { name: 'delegate', type: 'address' },
      { name: 'authority', type: 'bytes32' },
      { name: 'caveats', type: 'Caveat[]' },
      { name: 'salt', type: 'uint256' },
    ],
    Caveat: [
      { name: 'enforcer', type: 'address' },
      { name: 'terms', type: 'bytes' },
    ],
  };

  // For hackathon: caveats without enforcer addresses use a simpler struct
  const value = {
    delegate: delegation.delegate,
    authority: delegation.authority,
    caveats: delegation.caveats.map(c => ({ enforcer: c.enforcer, terms: c.terms || '0x' })),
    salt: BigInt(delegation.salt),
  };

  try {
    const signature = await signer.signTypedData(domain, types, value);
    return { ...delegation, signature };
  } catch {
    // Fallback: sign a hash of the delegation for demos without a deployed DelegationManager
    const hash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify({
      delegate: delegation.delegate,
      authority: delegation.authority,
      salt: delegation.salt,
    })));
    const signature = await signer.signMessage(ethers.getBytes(hash));
    return { ...delegation, signature };
  }
}

/**
 * Create the full delegation chain from a user root wallet to all worker agents.
 * @param {object} params
 * @param {string} params.userAddress - Root user wallet address
 * @param {string} params.orchestratorAddress - Orchestrator EOA address
 * @param {object} params.workerAddresses - { researcher, validator, writer }
 * @param {ethers.Wallet} params.orchestratorSigner - Orchestrator's ethers Wallet
 * @param {string} params.usdcAddress - USDC token address
 * @param {number} params.chainId - Chain ID
 * @param {string} params.delegationManagerAddress - DelegationManager contract address
 */
async function createDelegationChain({
  userAddress,
  orchestratorAddress,
  workerAddresses,
  orchestratorSigner,
  usdcAddress,
  chainId,
  delegationManagerAddress,
}) {
  // Root delegation: User → Orchestrator (can spend up to $1.00 USDC per goal)
  const orchestratorDelegation = buildDelegation({
    delegator: userAddress,
    delegate: orchestratorAddress,
    caveats: [buildSpendingCaveat(usdcAddress, 1.0)],
  });

  // Note: the user signs this in the browser via wallet_grantPermissions.
  // We store it unsigned here; the frontend signature is captured separately.
  orchestratorDelegation.signature = 'PENDING_USER_SIGNATURE';

  const orchestratorDelegationHash = ethers.keccak256(
    ethers.toUtf8Bytes(JSON.stringify({
      delegator: orchestratorDelegation.delegator,
      delegate: orchestratorDelegation.delegate,
      salt: orchestratorDelegation.salt,
    }))
  );

  // Sub-delegations: Orchestrator → Workers (orchestrator signs these)
  const researcherDelegation = await signDelegation(
    orchestratorSigner,
    buildDelegation({
      delegator: orchestratorAddress,
      delegate: workerAddresses.researcher,
      authority: orchestratorDelegationHash,
      caveats: [buildSpendingCaveat(usdcAddress, 0.25)],
    }),
    chainId,
    delegationManagerAddress
  );

  const validatorDelegation = await signDelegation(
    orchestratorSigner,
    buildDelegation({
      delegator: orchestratorAddress,
      delegate: workerAddresses.validator || workerAddresses.researcher,
      authority: orchestratorDelegationHash,
      caveats: [buildSpendingCaveat(usdcAddress, 0.10)],
    }),
    chainId,
    delegationManagerAddress
  );

  const writerDelegation = await signDelegation(
    orchestratorSigner,
    buildDelegation({
      delegator: orchestratorAddress,
      delegate: workerAddresses.writer,
      authority: orchestratorDelegationHash,
      caveats: [buildSpendingCaveat(usdcAddress, 0.25)],
    }),
    chainId,
    delegationManagerAddress
  );

  return {
    root: orchestratorDelegation,
    orchestratorDelegationHash,
    subDelegations: {
      researcher: researcherDelegation,
      validator: validatorDelegation,
      writer: writerDelegation,
    },
    metadata: {
      createdAt: new Date().toISOString(),
      chainId,
      usdcAddress,
      delegationManagerAddress,
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

/** Get delegation for a specific agent by role name. */
function getDelegationForAgent(agentRole) {
  const chain = loadDelegations();
  if (!chain) return null;
  if (agentRole === 'orchestrator') return chain.root;
  return chain.subDelegations?.[agentRole] || null;
}

/**
 * Build a flat delegation chain representation for the dashboard UI.
 * Returns an array of { from, to, role, caveats, signature } objects.
 */
function getDelegationChain() {
  const chain = loadDelegations();
  if (!chain) return [];

  const result = [
    {
      from: chain.root.delegator,
      to: chain.root.delegate,
      role: 'orchestrator',
      type: 'ERC-7710',
      authority: 'root',
      caveats: chain.root.caveats,
      signed: chain.root.signature !== 'PENDING_USER_SIGNATURE',
    },
  ];

  for (const [role, delegation] of Object.entries(chain.subDelegations || {})) {
    result.push({
      from: delegation.delegator,
      to: delegation.delegate,
      role,
      type: 'ERC-7710 (redelegation)',
      authority: chain.orchestratorDelegationHash?.slice(0, 10) + '...',
      caveats: delegation.caveats,
      signed: !!delegation.signature,
    });
  }

  return result;
}

module.exports = {
  buildDelegation,
  buildSpendingCaveat,
  signDelegation,
  createDelegationChain,
  saveDelegations,
  loadDelegations,
  getDelegationForAgent,
  getDelegationChain,
};
