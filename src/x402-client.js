/**
 * x402 payment client for agents using ERC-7710 delegation.
 *
 * Each agent is wrapped as a MetaMask Smart Account (Hybrid implementation).
 * createx402DelegationProvider creates an open root delegation from the agent's
 * smart account; the MetaMask facilitator redeems it for USDC settlement.
 *
 * Returns a fetch-compatible function (wrapFetchWithPayment) that automatically
 * handles the 402 → pay → retry flow when agents call Venice AI proxy routes.
 *
 * When X402_ENABLED=false, returns standard fetch (no payment required).
 */
const { NETWORK, X402 } = require('./config');

/**
 * Create a payment-aware fetch function for an agent.
 * Uses dynamic imports because smart-accounts-kit and x402 are ESM.
 *
 * @param {string} privateKey - Agent EOA private key (0x-prefixed hex)
 * @returns {Promise<Function>} - fetch-compatible function
 */
async function createX402FetchForAgent(privateKey) {
  if (!X402.enabled) {
    // Demo mode — return standard fetch, no payment headers needed
    return fetch.bind(globalThis);
  }

  if (!privateKey) {
    console.warn('[x402-client] No private key — using passthrough fetch');
    return fetch.bind(globalThis);
  }

  const { createPublicClient, http } = await import('viem');
  const { baseSepolia, base } = await import('viem/chains');
  const { privateKeyToAccount } = await import('viem/accounts');
  const { toMetaMaskSmartAccount, Implementation } = await import('@metamask/smart-accounts-kit');
  const { createx402DelegationProvider } = await import('@metamask/smart-accounts-kit/experimental');
  const { x402Erc7710Client } = await import('@metamask/x402');
  const { x402Client: CoreClient, x402HTTPClient } = await import('@x402/fetch');
  const { wrapFetchWithPayment } = await import('@x402/fetch');

  const chain = NETWORK.chainId === 8453 ? base : baseSepolia;
  const publicClient = createPublicClient({ chain, transport: http(NETWORK.rpcUrl) });

  const account = privateKeyToAccount(privateKey);

  const smartAccount = await toMetaMaskSmartAccount({
    client: publicClient,
    implementation: Implementation.Hybrid,
    deployParams: [account.address, [], [], []],
    deploySalt: '0x',
    signer: { account },
  });

  const erc7710Client = new x402Erc7710Client({
    delegationProvider: createx402DelegationProvider({ account: smartAccount }),
  });

  const coreClient = new CoreClient().register('eip155:*', erc7710Client);
  const httpClient = new x402HTTPClient(coreClient);

  return wrapFetchWithPayment(fetch, httpClient);
}

module.exports = { createX402FetchForAgent };
