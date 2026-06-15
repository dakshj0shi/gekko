/**
 * 1Shot Public Relayer — ERC-7710 delegation flow on Base Sepolia
 *
 * Public relayer (no API key required):
 *   https://relayer.1shotapi.dev/relayers  — Base Sepolia (84532)
 *
 * Flow (matching Ruleo reference implementation):
 * 1. relayer_getCapabilities → get live targetAddress + feeCollector
 * 2. Build executions: [fee transfer] + [agent transfers]
 * 3. relayer_estimate7710Transaction → get requiredPaymentAmount + context blob
 * 4. If fee differs from estimate, rebuild executions with correct fee and re-estimate
 * 5. relayer_send7710Transaction with context blob from step 3/4 + memo
 * 6. Poll relayer_getStatus — 100/110=pending, 200=confirmed, 400/500=failed
 */

const ONESHOT_RELAYER = 'https://relayer.1shotapi.dev/relayers'

// Fallback constants (overridden by relayer_getCapabilities at runtime)
const ONESHOT_TARGET      = '0xf1ef956eff4181Ce913b664713515996858B9Ca9' // delegate
const ONESHOT_FEE_ADDRESS = '0xE936e8FAf4A5655469182A49a505055B71C17604' // fee collector
const ONESHOT_FEE_USDC    = BigInt(10_000) // 0.01 USDC fallback (6 decimals)

const ONESHOT_CHAIN_ID = 84532 // Base Sepolia

// USDC on Base Sepolia
const USDC_BASE = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'

const BASE_EXPLORER = 'https://sepolia.basescan.org/tx/'

/**
 * Recursively convert BigInts → 0x-hex and Uint8Arrays → 0x-hex so
 * the delegation struct is JSON-serializable for JSON-RPC.
 */
function toRelayerJson(value) {
  if (value === null || value === undefined) return value
  if (typeof value === 'bigint') return `0x${value.toString(16)}`
  if (value instanceof Uint8Array) return '0x' + Buffer.from(value).toString('hex')
  if (Array.isArray(value)) return value.map(toRelayerJson)
  if (typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) out[k] = toRelayerJson(v)
    return out
  }
  return value
}

async function rpc(method, params) {
  const body = JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params })
  console.log(`[1Shot] ${method}`, JSON.stringify(params).slice(0, 300))
  const headers = { 'Content-Type': 'application/json' }
  if (process.env.ONESHOT_API_KEY) headers['x-api-key'] = process.env.ONESHOT_API_KEY
  const res = await fetch(ONESHOT_RELAYER, { method: 'POST', headers, body })
  const text = await res.text()
  console.log(`[1Shot] response (${res.status}):`, text.slice(0, 500))
  if (!res.ok) throw new Error(`1Shot HTTP ${res.status}: ${text.slice(0, 200)}`)
  let data
  try { data = JSON.parse(text) } catch { throw new Error(`1Shot bad JSON: ${text.slice(0, 200)}`) }
  if (data.error) throw new Error(`1Shot: ${JSON.stringify(data.error)}`)
  return data.result
}

/**
 * Fetch live relayer capabilities for Base Sepolia.
 * Returns { targetAddress, feeCollector, tokens }.
 * targetAddress is the delegate address that MUST be used in createDelegation({ to: targetAddress }).
 */
async function getCapabilities() {
  const caps = await rpc('relayer_getCapabilities', [String(ONESHOT_CHAIN_ID)])
  const chainCaps = caps?.[String(ONESHOT_CHAIN_ID)]
  if (!chainCaps) throw new Error('1Shot: no capabilities for chain ' + ONESHOT_CHAIN_ID)
  return {
    targetAddress: chainCaps.targetAddress,
    feeCollector:  chainCaps.feeCollector,
    tokens:        chainCaps.tokens || [],
  }
}

/**
 * Estimate an ERC-7710 delegation transaction.
 * Returns { success, requiredPaymentAmount (decimal string), context (opaque hex blob) }.
 * The context MUST be forwarded to relayer_send7710Transaction.
 */
async function estimate7710Transaction(delegation, executions) {
  const permissionContext = Array.isArray(delegation) ? delegation : [delegation]
  const params = {
    chainId: String(ONESHOT_CHAIN_ID),
    transactions: [{ permissionContext: toRelayerJson(permissionContext), executions }],
  }
  const result = await rpc('relayer_estimate7710Transaction', params)
  if (!result?.success) {
    throw new Error('1Shot estimate failed: ' + (result?.message || JSON.stringify(result)))
  }
  return result // { success, requiredPaymentAmount, context }
}

/**
 * Submit an ERC-7710 delegation transaction via 1Shot.
 * Options:
 *   context: opaque blob from relayer_estimate7710Transaction (required for correct relay)
 *   memo: optional label for debugging
 *   authorizationList: optional EIP-7702 authorization list (not used for Hybrid SA)
 */
async function send7710Transaction(delegation, executions, { context, memo, authorizationList } = {}) {
  const permissionContext = Array.isArray(delegation) ? delegation : [delegation]
  const params = {
    chainId: String(ONESHOT_CHAIN_ID),
    transactions: [{ permissionContext: toRelayerJson(permissionContext), executions }],
  }
  if (authorizationList?.length) params.authorizationList = toRelayerJson(authorizationList)
  if (context) params.context = context
  if (memo)    params.memo    = memo
  const taskId = await rpc('relayer_send7710Transaction', params)
  return String(taskId)
}

/**
 * Poll 1Shot for task status.
 * Codes: 100=Queued, 110=Submitted/Pending, 200=Confirmed, 400=Rejected, 500=Reverted
 */
async function getTaskStatus(taskId) {
  const result = await rpc('relayer_getStatus', { id: taskId, logs: false })
  const code = result?.status
  const txHash = result?.hash
  const status =
    code === 200 ? 'confirmed' :
    code === 400 ? 'rejected'  :
    code === 500 ? 'reverted'  :
    'pending'  // 100, 110 = still pending
  return { status, txHash: code === 200 ? txHash : undefined, code }
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
      if (['rejected', 'reverted'].includes(s.status)) return null
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
 * Build the executions array for paying Gekko agents via 1Shot.
 * feeCollector and feeAmount come from relayer_getCapabilities (or fallback constants).
 * The fee execution is always first (required by the relayer).
 */
function buildAgentPaymentExecutions(recipients, feeCollector = ONESHOT_FEE_ADDRESS, feeAmount = ONESHOT_FEE_USDC) {
  const feeExecution = {
    target: USDC_BASE,
    value: '0',
    data: encodeERC20Transfer(feeCollector, feeAmount),
  }
  const agentExecutions = recipients.map(({ address, amountUsdc }) => ({
    target: USDC_BASE,
    value: '0',
    data: encodeERC20Transfer(address, BigInt(Math.floor(parseFloat(String(amountUsdc)) * 1e6))),
  }))
  return [feeExecution, ...agentExecutions]
}

/**
 * Fetch fee data for a token from the 1Shot relayer.
 * Returns { minFee, rate, feeCollector, ... } — use minFee as initial feeAmount
 * before calling estimate7710Transaction. Falls back to ONESHOT_FEE_USDC on error.
 */
async function getFeeData(tokenAddress) {
  try {
    const result = await rpc('relayer_getFeeData', {
      chainId: String(ONESHOT_CHAIN_ID),
      token: tokenAddress,
    })
    return result
  } catch (err) {
    console.warn('[1Shot] getFeeData failed, using fallback:', err.message)
    return { minFee: String(ONESHOT_FEE_USDC), feeCollector: ONESHOT_FEE_ADDRESS }
  }
}

module.exports = {
  ONESHOT_RELAYER,
  ONESHOT_TARGET,
  ONESHOT_FEE_ADDRESS,
  ONESHOT_FEE_USDC,
  ONESHOT_CHAIN_ID,
  USDC_BASE,
  BASE_EXPLORER,
  toRelayerJson,
  getCapabilities,
  getFeeData,
  estimate7710Transaction,
  send7710Transaction,
  getTaskStatus,
  waitForTask,
  encodeERC20Transfer,
  buildAgentPaymentExecutions,
}
