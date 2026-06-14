'use client'

/**
 * MetaMask Smart Account + ERC-7710 delegation signing for 1Shot public relayer.
 *
 * Uses Implementation.Hybrid on Base Sepolia. The Hybrid smart account is a
 * separate deterministic address derived from the user's EOA — it is NOT the
 * EOA itself. This avoids MetaMask Flask's security block on signing delegations
 * "as" a MetaMask-controlled EOA from an external site (which Stateless7702
 * triggers because its address = EOA address).
 *
 * No EIP-7702 authorization required for Hybrid — the smart account is a
 * counterfactual contract whose signature is verified via ERC-6492.
 *
 * Flow:
 *   1. switchToBaseSepolia() — MetaMask Flask switches to Base Sepolia (84532)
 *   2. createBaseSmartAccount() — derives counterfactual Hybrid smart account from EOA
 *   3. signDelegationForOneShot() — signs ERC-7710 FunctionCall delegation
 *      MetaMask Flask shows one EIP-712 popup for the Hybrid account address
 *   4. POST /api/execute → 1Shot public relayer executes USDC payments gaslessly
 */

import { createPublicClient, createWalletClient, custom, http } from 'viem'
import { baseSepolia } from 'viem/chains'

// 1Shot public relayer target on Base Sepolia (from 1Shot multichain example)
export const ONESHOT_TARGET = '0xf1ef956eff4181Ce913b664713515996858B9Ca9'
export const ONESHOT_FEE_USDC = BigInt(10_000) // 0.01 USDC (6 decimals)
export const USDC_BASE = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' // Base Sepolia USDC
export const ONESHOT_CHAIN_ID = 84532 // Base Sepolia
export const BASE_SEPOLIA_RPC = 'https://sepolia.base.org'

// transfer(address,uint256) selector — used for FunctionCall scope
const TRANSFER_SELECTOR = '0xa9059cbb'

export interface DelegationRecord {
  delegate: string
  delegator: string // Hybrid smart account address (different from EOA)
  authority: string
  caveats: { enforcer: string; terms: string; args: string }[]
  salt: string
  signature: string
}

/** Switch MetaMask Flask to Base Sepolia. Required before delegation signing. */
async function switchToBaseSepolia(provider: any): Promise<void> {
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0x14a34' }], // 0x14a34 = 84532 = Base Sepolia
    })
  } catch (err: any) {
    if (err?.code === 4902) {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: '0x14a34',
          chainName: 'Base Sepolia',
          nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
          rpcUrls: ['https://sepolia.base.org'],
          blockExplorerUrls: ['https://sepolia.basescan.org'],
        }],
      })
    } else {
      throw err
    }
  }
}

/**
 * Create a MetaMask Hybrid Smart Account on Base Sepolia from the connected EOA.
 * The Hybrid smart account is a counterfactual contract — deterministic address,
 * separate from the EOA. Doesn't need to be deployed before signing.
 */
async function createBaseSmartAccount(provider: any, ownerAddress: string) {
  const { toMetaMaskSmartAccount, Implementation } = await import('@metamask/smart-accounts-kit')

  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(BASE_SEPOLIA_RPC),
  })

  const walletClient = createWalletClient({
    chain: baseSepolia,
    account: ownerAddress as `0x${string}`,
    transport: custom(provider),
  })

  return (toMetaMaskSmartAccount as any)({
    client: publicClient,
    implementation: Implementation.Hybrid,
    deployParams: [ownerAddress as `0x${string}`, [], [], []],
    deploySalt: '0x',
    signer: { walletClient },
  })
}

/**
 * Sign an ERC-7710 delegation from the user's Hybrid smart account to 1Shot's target.
 *
 * Uses ScopeType.FunctionCall (USDC + transfer selector) — avoids the
 * CaveatEnforcer:invalid-call-type revert that Erc20TransferAmount triggers
 * when the relayer batches multiple executions (fee + 3 agents = 4 total).
 *
 * The delegation target (delegate) is fetched live from the relayer via
 * /api/relayer-caps so it always matches what relayer_getCapabilities returns.
 *
 * MetaMask Flask shows a single EIP-712 popup for the Hybrid account address.
 */
export async function signDelegationForOneShot(
  provider: any,
  ownerAddress: string,
  maxAmountUsdc: bigint
): Promise<DelegationRecord> {
  await switchToBaseSepolia(provider)

  const {
    createDelegation,
    getSmartAccountsEnvironment,
    ROOT_AUTHORITY,
    ScopeType,
  } = await import('@metamask/smart-accounts-kit')

  const smartAccount = await createBaseSmartAccount(provider, ownerAddress)
  const environment = getSmartAccountsEnvironment(ONESHOT_CHAIN_ID)

  // Fetch live relayer target address so delegation.to matches relayer_getCapabilities
  let delegateTarget = ONESHOT_TARGET as string
  try {
    const capsRes = await fetch('/api/relayer-caps')
    if (capsRes.ok) {
      const caps = await capsRes.json()
      if (caps.targetAddress) delegateTarget = caps.targetAddress
    }
  } catch { /* use fallback constant */ }

  // Random 32-byte salt prevents delegation replay
  const saltBytes = crypto.getRandomValues(new Uint8Array(32))
  const salt = ('0x' + Array.from(saltBytes).map(b => b.toString(16).padStart(2, '0')).join('')) as `0x${string}`

  // Build erc20PeriodTransfer caveat: enforces that total USDC transferred via this
  // delegation cannot exceed maxAmountUsdc in a 24-hour window (matching Ruleo's model).
  // This is on-chain enforcement via the Erc20PeriodTransferEnforcer contract.
  const { createCaveatBuilder } = await import('@metamask/smart-accounts-kit/utils')
  const caveatBuilder = createCaveatBuilder(environment)
  caveatBuilder.addCaveat('erc20PeriodTransfer', {
    tokenAddress: USDC_BASE as `0x${string}`,
    periodAmount: maxAmountUsdc,
    periodDuration: 86400, // 24 hours in seconds
    startDate: Math.floor(Date.now() / 1000),
  })
  const periodCaveats = caveatBuilder.build()

  // FunctionCall scope: allow calling transfer() on USDC only.
  // + erc20PeriodTransfer caveat: cap total spend at maxAmountUsdc per 24h on-chain.
  // Combined = 4 enforcers (FunctionCall generates 3, period adds 1).
  const unsignedDelegation = (createDelegation as any)({
    to: delegateTarget as `0x${string}`,
    from: smartAccount.address,
    environment,
    salt,
    scope: {
      type: ScopeType.FunctionCall,
      targets: [USDC_BASE as `0x${string}`],
      selectors: [TRANSFER_SELECTOR],
    },
    caveats: periodCaveats,
  })

  const authority: string = unsignedDelegation.authority ?? ROOT_AUTHORITY

  // MetaMask Flask EIP-712 signing popup — signs for the Hybrid smart account
  // address (not the EOA), so Flask allows it without the "internal account" block
  const signature = await smartAccount.signDelegation({
    delegation: unsignedDelegation,
    chainId: ONESHOT_CHAIN_ID,
  })

  const normalizeSalt = (s: any): string => {
    try {
      const n = typeof s === 'bigint' ? s : BigInt(s === '0x' || s === '' ? '0x0' : s)
      return `0x${n.toString(16).padStart(64, '0')}`
    } catch {
      return '0x' + '0'.repeat(64)
    }
  }

  return {
    delegate: delegateTarget, // live address from relayer_getCapabilities
    delegator: smartAccount.address, // Hybrid SA address — fund this with USDC
    authority,
    caveats: (unsignedDelegation.caveats ?? []).map((c: any) => ({
      enforcer: c.enforcer,
      terms: c.terms,
      args: c.args ?? '0x',
    })),
    salt: normalizeSalt(unsignedDelegation.salt ?? salt),
    signature,
  }
}

/**
 * Deploy the user's Hybrid smart account on Base Sepolia via the SimpleFactory.
 * Required before the 1Shot relayer can verify delegation signatures on-chain.
 * MetaMask shows a normal "Confirm Transaction" popup (not a signing popup).
 * Costs ~0.00005 ETH in gas. Returns the smart account address.
 */
export async function deploySmartAccount(provider: any, ownerAddress: string): Promise<string> {
  await switchToBaseSepolia(provider)

  const { toMetaMaskSmartAccount, Implementation } = await import('@metamask/smart-accounts-kit')

  const publicClient = createPublicClient({ chain: baseSepolia, transport: http(BASE_SEPOLIA_RPC) })
  const walletClient = createWalletClient({
    chain: baseSepolia,
    account: ownerAddress as `0x${string}`,
    transport: custom(provider),
  })

  const smartAccount = await (toMetaMaskSmartAccount as any)({
    client: publicClient,
    implementation: Implementation.Hybrid,
    deployParams: [ownerAddress as `0x${string}`, [], [], []],
    deploySalt: '0x',
    signer: { walletClient },
  })

  // Check if already deployed
  const code = await publicClient.getCode({ address: smartAccount.address as `0x${string}` })
  if (code && code !== '0x') {
    return smartAccount.address as string
  }

  // getFactoryArgs() from the kit gives us the factory address + encoded deploy calldata
  const { factory, factoryData } = await smartAccount.getFactoryArgs()

  // Send the deploy tx — MetaMask shows a normal transaction confirmation popup
  const txHash = await walletClient.sendTransaction({
    to: factory as `0x${string}`,
    data: factoryData as `0x${string}`,
  })

  await publicClient.waitForTransactionReceipt({ hash: txHash })
  return smartAccount.address as string
}

/**
 * Derive the user's Hybrid smart account address on Base Sepolia.
 * This is the address that needs USDC funding (not the MetaMask EOA).
 */
export async function getSmartAccountAddress(ownerAddress: string): Promise<string> {
  const { toMetaMaskSmartAccount, Implementation } = await import('@metamask/smart-accounts-kit')
  const publicClient = createPublicClient({ chain: baseSepolia, transport: http(BASE_SEPOLIA_RPC) })
  const walletClient = createWalletClient({
    chain: baseSepolia,
    account: ownerAddress as `0x${string}`,
    transport: http(BASE_SEPOLIA_RPC),
  })
  const sa = await (toMetaMaskSmartAccount as any)({
    client: publicClient,
    implementation: Implementation.Hybrid,
    deployParams: [ownerAddress as `0x${string}`, [], [], []],
    deploySalt: '0x',
    signer: { walletClient },
  })
  return sa.address as string
}
