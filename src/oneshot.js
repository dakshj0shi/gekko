/**
 * 1Shot Permissionless Relayer — ERC-7710 delegation flow
 *
 * How it works:
 * 1. User's MetaMask Smart Account signs a delegation to 1Shot's relayer address
 *    with an ERC-20 USDC transfer caveat (capped amount).
 * 2. Frontend calls signDelegationForOneShot() and stores the signed delegation.
 * 3. POST /api/execute sends that delegation + executions to 1Shot via JSON-RPC.
 *    Executions: [0.01 USDC fee to 1Shot] + [payment transfers to agent wallets].
 * 4. 1Shot submits the on-chain transaction on Base mainnet — no ETH needed.
 *
 * Chain: Base mainnet (8453)
 * Explorer: https://basescan.org
 */

const ONESHOT_RELAYER = 'https://relayer.1shotapi.com/relayers'

// 1Shot's relayer/fee address — must be the `delegate` in the delegation
const ONESHOT_TARGET = '0x26a529124f0bbf9af9d8f9f84a43efe47cf1199a'

// 0.01 USDC relayer fee — must be the FIRST execution in every batch
const ONESHOT_FEE_ADDRESS = ONESHOT_TARGET
const ONESHOT_FEE_USDC = BigInt(10_000) // 0.01 USDC (6 decimals)

const ONESHOT_CHAIN_ID = 8453 // Base mainnet only

// USDC on Base mainnet
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'

const BASE_EXPLORER = 'https://basescan.org/tx/'

async function rpc(method, params) {
  const body = JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params })
  console.log(`[1Shot] ${method}`, JSON.stringify(params).slice(0, 300))
  const headers = { 'Content-Type': 'application/json' }
  if (process.env.ONESHOT_API_KEY) headers['x-api-key'] = process.env.ONESHOT_API_KEY
  const res = await fetch(ONESHOT_RELAYER, {
    method: 'POST',
    headers,
    body,
  })
  const text = await res.text()
  console.log(`[1Shot] response (${res.status}):`, text.slice(0, 500))
  if (!res.ok) throw new Error(`1Shot HTTP ${res.status}: ${text.slice(0, 200)}`)
  let data
  try { data = JSON.parse(text) } catch { throw new Error(`1Shot bad JSON: ${text.slice(0, 200)}`) }
  if (data.error) throw new Error(`1Shot: ${JSON.stringify(data.error)}`)
  return data.result
}

/**
 * Submit an ERC-7710 delegation transaction via 1Shot.
 * delegation: single DelegationRecord or array (for chained delegations).
 * executions: [{ target, value, data }] — fee transfer must be first.
 * Returns: taskId string.
 */
async function send7710Transaction(delegation, executions) {
  const permissionContext = Array.isArray(delegation) ? delegation : [delegation]
  const taskId = await rpc('relayer_send7710Transaction', {
    chainId: String(ONESHOT_CHAIN_ID),
    transactions: [{ permissionContext, executions }],
  })
  return String(taskId)
}

/**
 * Validate a delegation before submitting (optional preflight).
 */
async function estimate7710Transaction(delegation, executions) {
  return rpc('relayer_estimate7710Transaction', {
    chainId: String(ONESHOT_CHAIN_ID),
    transactions: [{ permissionContext: [delegation], executions }],
  })
}

/**
 * Poll 1Shot for task status.
 * Returns { status, txHash? }
 */
async function getTaskStatus(taskId) {
  const result = await rpc('relayer_getStatus', { id: taskId, logs: false })
  return {
    status: result?.status ?? 'pending',
    txHash: result?.receipt?.transactionHash,
  }
}

/**
 * Wait for a 1Shot task to confirm on-chain.
 * Returns tx hash on success, null on failure/timeout.
 */
async function waitForTask(taskId, maxMs = 60_000) {
  const deadline = Date.now() + maxMs
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 2500))
    try {
      const s = await getTaskStatus(taskId)
      if (s.txHash) return s.txHash
      if (['failed', 'rejected', 'reverted'].includes(s.status)) return null
    } catch { /* keep polling */ }
  }
  return null
}

/**
 * Encode ERC-20 transfer(address,uint256) calldata.
 */
function encodeERC20Transfer(to, amount) {
  const selector = 'a9059cbb'
  const paddedTo = to.replace('0x', '').padStart(64, '0')
  const paddedAmount = BigInt(amount).toString(16).padStart(64, '0')
  return `0x${selector}${paddedTo}${paddedAmount}`
}

/**
 * Build the standard executions array for paying Gekko agents via 1Shot.
 * recipients: [{ address, amountUsdc }] — amounts in USDC (e.g. 0.05 = 5 cents)
 * Fee execution is prepended automatically.
 */
function buildAgentPaymentExecutions(recipients) {
  const feeExecution = {
    target: USDC_BASE,
    value: '0',
    data: encodeERC20Transfer(ONESHOT_FEE_ADDRESS, ONESHOT_FEE_USDC),
  }
  const agentExecutions = recipients.map(({ address, amountUsdc }) => ({
    target: USDC_BASE,
    value: '0',
    data: encodeERC20Transfer(address, BigInt(Math.floor(parseFloat(String(amountUsdc)) * 1e6))),
  }))
  return [feeExecution, ...agentExecutions]
}

module.exports = {
  ONESHOT_RELAYER,
  ONESHOT_TARGET,
  ONESHOT_FEE_ADDRESS,
  ONESHOT_FEE_USDC,
  ONESHOT_CHAIN_ID,
  USDC_BASE,
  BASE_EXPLORER,
  send7710Transaction,
  estimate7710Transaction,
  getTaskStatus,
  waitForTask,
  encodeERC20Transfer,
  buildAgentPaymentExecutions,
}
