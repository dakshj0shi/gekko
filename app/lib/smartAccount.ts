'use client'

/**
 * MetaMask Smart Account + ERC-7710 delegation signing for 1Shot.
 *
 * Flow:
 *   1. switchToBase()  — MetaMask switches to Base mainnet (chain 8453)
 *   2. createBaseSmartAccount() — derives counterfactual smart account from user EOA
 *   3. signDelegationForOneShot() — signs ERC-7710 delegation to 1Shot's relayer address
 *      with an erc20TransferAmount caveat capping USDC spend
 *   4. Signed delegation is stored in frontend state and passed to POST /api/goal
 *      and POST /api/execute for on-chain payment
 *
 * Chain: Base mainnet (8453) — 1Shot only operates on Base mainnet.
 */

import { createPublicClient, createWalletClient, custom, http } from 'viem'
import { base } from 'viem/chains'

// 1Shot constants — must match src/oneshot.js exactly
export const ONESHOT_TARGET = '0x26a529124f0bbf9af9d8f9f84a43efe47cf1199a'
export const ONESHOT_FEE_USDC = BigInt(10_000) // 0.01 USDC (6 decimals)
export const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
export const ONESHOT_CHAIN_ID = 8453

export const BASE_MAINNET_RPC = 'https://mainnet.base.org'

export interface DelegationRecord {
  delegate: string
  delegator: string
  authority: string
  caveats: { enforcer: string; terms: string; args: string }[]
  salt: string
  signature: string
}

/** Switch MetaMask to Base mainnet. Required before delegation signing. */
async function switchToBase(provider: any): Promise<void> {
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0x2105' }], // 0x2105 = 8453
    })
  } catch (err: any) {
    if (err?.code === 4902) {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: '0x2105',
          chainName: 'Base',
          nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
          rpcUrls: ['https://mainnet.base.org'],
          blockExplorerUrls: ['https://basescan.org'],
        }],
      })
    } else {
      throw err
    }
  }
}

/**
 * Create a MetaMask Hybrid Smart Account on Base mainnet from the connected EOA.
 * The smart account address is deterministic — same owner + salt always gives same address.
 */
async function createBaseSmartAccount(provider: any, ownerAddress: string) {
  const { toMetaMaskSmartAccount, Implementation } = await import('@metamask/smart-accounts-kit')

  const publicClient = createPublicClient({
    chain: base,
    transport: http(BASE_MAINNET_RPC),
  })

  const walletClient = createWalletClient({
    chain: base,
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
 * Sign an ERC-7710 delegation from the user's Base smart account to 1Shot's target.
 *
 * The delegation grants 1Shot permission to transfer up to (maxAmountUsdc + 0.01) USDC
 * on behalf of the user's smart account — no ETH gas required.
 *
 * @param provider     window.ethereum
 * @param ownerAddress connected MetaMask EOA address
 * @param maxAmountUsdc USDC budget in micro-units (e.g. BigInt(100000) = $0.10)
 */
export async function signDelegationForOneShot(
  provider: any,
  ownerAddress: string,
  maxAmountUsdc: bigint
): Promise<DelegationRecord> {
  await switchToBase(provider)

  const {
    createDelegation,
    getSmartAccountsEnvironment,
    ROOT_AUTHORITY,
    ScopeType,
  } = await import('@metamask/smart-accounts-kit')

  const smartAccount = await createBaseSmartAccount(provider, ownerAddress)
  const environment = getSmartAccountsEnvironment(ONESHOT_CHAIN_ID)

  // Budget = user payment + 0.01 USDC relayer fee
  const totalBudget = maxAmountUsdc + ONESHOT_FEE_USDC

  // Do NOT pass parentDelegation: ROOT_AUTHORITY — @metamask/smart-accounts-kit
  // uses ROOT_AUTHORITY as an internal sentinel and rejects it if passed explicitly.
  // It defaults to ROOT_AUTHORITY automatically for root delegations.
  const unsignedDelegation = (createDelegation as any)({
    to: ONESHOT_TARGET as `0x${string}`,
    from: smartAccount.address,
    environment,
    scope: {
      type: ScopeType.Erc20TransferAmount,
      tokenAddress: USDC_BASE as `0x${string}`,
      maxAmount: totalBudget,
    },
  })

  // authority comes back from createDelegation itself — should be ROOT_AUTHORITY
  const authority: string = unsignedDelegation.authority ?? ROOT_AUTHORITY

  // Triggers MetaMask EIP-712 signing popup
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
    delegate: ONESHOT_TARGET,
    delegator: smartAccount.address,
    authority,
    caveats: (unsignedDelegation.caveats ?? []).map((c: any) => ({
      enforcer: c.enforcer,
      terms: c.terms,
      args: c.args ?? '0x',
    })),
    salt: normalizeSalt(unsignedDelegation.salt),
    signature,
  }
}

/**
 * Derive the user's Base smart account address without browser interaction.
 * Useful for display before signing — the address is deterministic.
 */
export async function getSmartAccountAddress(ownerAddress: string): Promise<string> {
  const { toMetaMaskSmartAccount, Implementation } = await import('@metamask/smart-accounts-kit')
  const publicClient = createPublicClient({ chain: base, transport: http(BASE_MAINNET_RPC) })
  // Use http transport for display-only derivation (no signing needed)
  const walletClient = createWalletClient({
    chain: base,
    account: ownerAddress as `0x${string}`,
    transport: http(BASE_MAINNET_RPC),
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
