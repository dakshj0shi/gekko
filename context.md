# Gekko — Project Context

> Single source of truth for AI sessions. Read before making any changes.

---

## What Gekko Is

Gekko is an **autonomous agent-to-agent payment marketplace** built for the MetaMask Smart Accounts × 1Shot API × Venice AI hackathon. A user submits a research goal; four AI agents coordinate, pay each other in USDC, and deliver a full research report — all without human intervention.

**Dual payment layers:**
- **1Shot (Base Sepolia)**: User → Agent payments via ERC-7710 FunctionCall + erc20PeriodTransfer delegation, gaslessly executed by 1Shot public relayer
- **x402 (Base Sepolia)**: Agent → Venice AI micropayments via ERC-7710 delegation from agent Hybrid smart accounts. MetaMask facilitator settles on Base Sepolia.

**Stack**: Venice AI · x402 micropayment protocol · MetaMask **Hybrid** smart accounts (user + agents) · ERC-7710 FunctionCall + erc20PeriodTransfer delegation · 1Shot public relayer · ethers v6 · Base Sepolia

---

## Two Processes, One Product

| Process | Command | Port | Purpose |
|---------|---------|------|---------|
| Next.js frontend | `npm run dev` | 3000 | Dashboard UI (static export) |
| Express backend | `npm start` | 3001 | Agent runtime, API routes, SSE |

**IMPORTANT**: `next.config.ts` uses `output: "export"` (static mode). Next.js API routes in `app/api/` do NOT execute. All `/api/*` routes are handled exclusively by Express in `src/server.js`.

---

## Directory Structure

```
/
├── app/
│   ├── page.tsx              # Dashboard — MetaMask connect, deploy SA, delegation signing, on-chain payment
│   ├── lib/
│   │   └── smartAccount.ts   # Browser-side MetaMask Hybrid SA: deploy, sign delegation
│   ├── layout.tsx            # Root layout, fonts, metadata
│   └── globals.css           # Tailwind + keyframes + scrollbar
│
├── src/
│   ├── config.js             # All env vars, agent configs, rate limits, budget caps
│   ├── server.js             # Express — all API routes, SSE stream, x402-gated Venice proxy
│   │                           POST /api/execute, GET /api/task-status, GET /api/relayer-caps
│   ├── venice.js             # Venice AI client — OpenAI-compatible chat/search
│   ├── oneshot.js            # 1Shot JSON-RPC client — getCapabilities, estimate, send, poll
│   ├── wallet.js             # AgentWallet — USDC balance (ethers), direct transfer
│   ├── x402-client.js        # Per-agent x402 fetch wrapper (Hybrid smart accounts, server-side)
│   ├── x402-server.js        # @x402/express paymentMiddleware
│   ├── permissions.js        # ERC-7715 parameter builder (legacy, not used in main flow)
│   ├── delegation.js         # Sub-delegation chain builder (legacy)
│   ├── circuit-breaker.js    # Trips after 5 consecutive failures, 30s cooldown
│   ├── escrow.js             # In-memory escrow sessions
│   ├── registry.js           # Service marketplace (agent discovery)
│   ├── event-bus.js          # Global EventEmitter — all agent events
│   └── agents/
│       ├── base-agent.js     # Base class: agentWallet, x402 client, callAPI()
│       ├── orchestrator.js   # Coordinates full pipeline
│       ├── research-agent.js # Web search via Venice AI
│       ├── validator-agent.js# Fact-checks via Venice reasoning model
│       └── writer-agent.js   # Report synthesis via Venice fast model
│
├── next.config.ts            # output: "export", ignoreBuildErrors: true
├── context.md                # This file — update on every major change
├── .env                      # Real credentials — not committed
└── package.json
```

---

## Smart Account Architecture (Critical)

### Implementation: MetaMask Hybrid (both user and agents)

**User Hybrid SA:**
- Created via `toMetaMaskSmartAccount({ implementation: Implementation.Hybrid, deployParams: [ownerEOA, [], [], []], deploySalt: '0x' })`
- Address is **different from the EOA** — it's a deterministic contract derived from the EOA via CREATE2 through SimpleFactory
- Must be **deployed on-chain** before the DelegationManager can call `isValidSignature` on it
- `smartAccount.getFactoryArgs()` → `{ factory, factoryData }` — used to deploy via MetaMask send transaction
- The EOA is the owner/signer; the SA is the delegator

**Agent Hybrid SAs** (server-side, `src/x402-client.js`):
- Same `Implementation.Hybrid` but created with the agent's private key
- Used for x402 payments: agent SA signs ERC-7710 delegation payment to Venice AI
- Addresses from `GET /api/agent-smartaccounts`

**Why Hybrid, not Stateless7702:**
- MetaMask Flask blocks signing delegations for "internal accounts" (accounts Flask controls)
- `Stateless7702`: SA address = EOA address → Flask sees an external site asking to sign "as" Flask's EOA → blocked with "External signature requests cannot sign delegations for internal accounts"
- `Hybrid`: SA address ≠ EOA address → Flask allows signing because the SA is a separate contract address Flask doesn't control

---

## ERC-7710 Delegation Details

### Scope: FunctionCall + erc20PeriodTransfer (4 caveats total)

```typescript
// scope generates 3 caveats (AllowedTargets + AllowedCalldata + NativeAmount)
scope: {
  type: ScopeType.FunctionCall,
  targets: [USDC_BASE],
  selectors: ['0xa9059cbb'],  // transfer(address,uint256)
}

// explicit caveat adds 1 more: Erc20PeriodTransferEnforcer
caveats: [{
  type: 'erc20PeriodTransfer',
  tokenAddress: USDC_BASE,
  periodAmount: maxAmountUsdc,  // user's budget in 6-decimal USDC
  periodDuration: 86400,        // 24 hours
  startDate: Math.floor(Date.now() / 1000),
}]
```

Total: 4 on-chain caveats. The `erc20PeriodTransfer` caveat enforces spending limits on-chain (matches Ruleo reference implementation).

**Why FunctionCall and not Erc20TransferAmount:**
`Erc20TransferAmount` triggers `CaveatEnforcer:invalid-call-type` when the relayer batches 4 executions (fee + 3 agent payments). `FunctionCall` works correctly for batched executions.

### Delegation signing flow

```
signDelegationForOneShot(provider, ownerAddress, maxAmountUsdc):
  1. switchToBaseSepolia() — MetaMask Flask switches to 0x14a34 (84532)
  2. createBaseSmartAccount(provider, ownerAddress)
     → toMetaMaskSmartAccount({ Hybrid, signer: { walletClient } })
     → smartAccount.address = counterfactual Hybrid SA address
  3. GET /api/relayer-caps → live targetAddress from relayer_getCapabilities
  4. createCaveatBuilder(environment).addCaveat('erc20PeriodTransfer', ...)
  5. createDelegation({ to: targetAddress, from: smartAccount.address, scope: FunctionCall, caveats: periodCaveats })
  6. smartAccount.signDelegation({ delegation, chainId: 84532 })
     → internally calls prepareSignDelegationTypedData + walletClient.signTypedData()
     → MetaMask Flask shows EIP-712 popup (signs as EOA owner of Hybrid SA)
  7. returns DelegationRecord { delegate, delegator, authority, caveats, salt, signature }
```

No EIP-7702 authorization — Hybrid SA is a real deployed contract, not an EOA upgrade.

---

## How the Data Flows

### Research pipeline (`POST /api/goal`):

```
User → POST /api/goal
  → server.js (rate limiting, budget cap)
    → GekkoOrchestrator.executeGoal(goal, budget)
      1. _verifyBalance() — USDC balance check (passes even at 0)
      2. _planSubtasks() — Venice LLM → 3 subtasks: research, validate, write
      3. For each subtask:
         a. registry.discover(capability) — find cheapest agent
         b. escrow.createEscrow() — in-memory session
         c. agent.execute(task) — calls Venice AI via x402-gated proxy
            → 402 Payment Required → agent Hybrid smart account pays via ERC-7710
         d. orchestrator.pay() — direct USDC transfer via ethers (simulated if unfunded)
      4. validator.validate() — fact-check via Venice deepseek-v3.2
      5. writer.synthesize() — full report via Venice mistral-small-2603
      6. Return { success, report, audit }
```

### ERC-7710 on-chain payment flow (frontend-initiated):

```
[Step 1 — Deploy Smart Account]
User connects MetaMask Flask
  → getSmartAccountAddress(ownerAddress) → counterfactual Hybrid SA address
  → eth_getCode(SA address) → if '0x' (not deployed), show "Deploy Smart Account" button
  → deploySmartAccount(provider, ownerAddress)
    → smartAccount.getFactoryArgs() → { factory, factoryData }
    → walletClient.sendTransaction({ to: factory, data: factoryData })
    → MetaMask shows normal "Confirm Transaction" popup
    → awaits receipt — SA is now deployed on Base Sepolia

[Step 2 — Fund SA]
User gets USDC at faucet.circle.com (Base Sepolia)
Sends ≥0.14 USDC to the Hybrid SA address (shown in Delegation tab)

[Step 3 — Sign Delegation]
User clicks "Sign Delegation"
  → signDelegationForOneShot(provider, ownerAddress, budgetMicro)
  → GET /api/relayer-caps → targetAddress (live from relayer_getCapabilities)
  → createDelegation with FunctionCall + erc20PeriodTransfer caveats
  → MetaMask Flask EIP-712 popup for Hybrid SA
  → signedDelegation stored in frontend state

[Step 4 — Mission + Payment]
User runs mission → agents work → report generated
User clicks "Pay Agents On-Chain"
  → POST /api/execute { signedDelegation }
    → server: GET /api/relayer-caps → live feeCollector
    → buildAgentPaymentExecutions([fee, researcher, validator, writer])
    → relayer_estimate7710Transaction(delegation, executions)
      → returns { requiredPaymentAmount, context }
    → if requiredFee ≠ mock fee: rebuild executions, re-estimate
    → relayer_send7710Transaction(delegation, executions, { context, memo })
      → context blob from estimate is REQUIRED by the relayer
    → returns taskId
  → frontend polls GET /api/task-status?id=<taskId> every 3s
  → status codes: 100/110=Pending, 200=Confirmed, 400=Rejected, 500=Reverted
  → on confirmed: shows https://sepolia.basescan.org/tx/<txHash>
```

### x402 flow (agent → Venice AI):

```
Agent.callAPI('venice', 'chat', params)
  → fetchWithPayment(POST /api/venice/chat)
    ← 402 Payment Required (price: $0.001 USDC)
  → x402 client: agent Hybrid smart account signs ERC-7710 delegation payment
  → MetaMask facilitator: https://tx-sentinel-base-sepolia.dev-api.cx.metamask.io/platform/v2/x402
  → retry with X-PAYMENT header
    ← 200 OK + Venice AI response
Note: x402 is REAL infrastructure (not cosmetic). Falls back to pass-through if agent SA is unfunded.
```

---

## 1Shot Integration Details (`src/oneshot.js`)

**Full 6-step flow (matching Ruleo reference implementation):**

| Step | JSON-RPC Method | Purpose |
|------|----------------|---------|
| 1 | `relayer_getCapabilities` | Get live `targetAddress` + `feeCollector` for chain 84532 |
| 2 | (build executions) | `[feeTransfer, agentTransfer×3]` using live fee collector |
| 3 | `relayer_estimate7710Transaction` | Get `requiredPaymentAmount` + opaque `context` blob |
| 4 | (rebuild if needed) | If required fee ≠ mock fee, rebuild + re-estimate |
| 5 | `relayer_send7710Transaction` | Submit with `context` blob (REQUIRED) + `memo` |
| 6 | `relayer_getStatus` | Poll — 100/110=Pending, 200=Confirmed, 400=Rejected, 500=Reverted |

- **Endpoint**: `https://relayer.1shotapi.dev/relayers` (public testnet, no API key)
- **Chain**: Base Sepolia (84532)
- **Delegate (target)**: Fetched live from `relayer_getCapabilities` (hardcoded fallback: `0xf1ef956eff4181Ce913b664713515996858B9Ca9`)
- **Fee collector**: Fetched live (fallback: `0xE936e8FAf4A5655469182A49a505055B71C17604`)
- **Fee amount**: 0.01 USDC (BigInt 10,000) — adjusts to `requiredPaymentAmount` from estimate
- **USDC on Base Sepolia**: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- **txHash field**: `result.hash` (NOT `result.receipt.transactionHash`)
- **BigInt serialization**: `toRelayerJson()` converts BigInts→hex and Uint8Arrays→hex
- **The `context` blob**: returned by estimate, must be forwarded to send — this is what was missing before and caused silent rejections

---

## Frontend Architecture (`app/lib/smartAccount.ts` + `app/page.tsx`)

### `smartAccount.ts` exported functions

| Function | Purpose |
|----------|---------|
| `getSmartAccountAddress(ownerAddress)` | Derive counterfactual Hybrid SA address from EOA |
| `deploySmartAccount(provider, ownerAddress)` | Deploy SA via SimpleFactory, returns SA address |
| `signDelegationForOneShot(provider, ownerAddress, maxAmountUsdc)` | Full signing flow → DelegationRecord |

### `page.tsx` state machine

| State | Purpose |
|-------|---------|
| `userAddress` | MetaMask Flask EOA (`eth_requestAccounts`) |
| `smartAccountAddress` | Hybrid SA address (derived, different from EOA) |
| `smartAccountDeployed` | `null`=unknown, `false`=not deployed, `true`=deployed |
| `deployingSmartAccount` | Loading state during factory deploy tx |
| `signedDelegation` | DelegationRecord after MetaMask EIP-712 signing |
| `signingDelegation` | Loading state during MetaMask EIP-712 popup |
| `onChainPayment` | State machine: `idle → executing → polling → confirmed/failed` |

**Button flow**: Connect Wallet → (if not deployed) **Deploy Smart Account** → Sign Delegation → [Delegation Active] → (after mission) **Pay Agents On-Chain** → polling → confirmed (Sepolia BaseScan link)

On wallet connect: `eth_getCode(saAddress)` checked via Base Sepolia RPC → sets `smartAccountDeployed` flag

---

## Agent Details

| Agent | EOA Address (Base Sepolia) | Hybrid Smart Account | Role |
|-------|---------------------------|---------------------|------|
| Orchestrator | `0xF9bc59882a7d6D2Dd24ff3800F69CC459bDDCC62` | `0x8863225C54e0Ad1aDf4e10cD7BfeC53cfb66abdd` | Coordinator + payer |
| Researcher | `0x6eB5e2011964a3D7Cf371aAbBD49545C70A7052c` | `0x6AFF673B72310de0354D3357e225Ad703182E1a0` | Venice web search |
| Validator | `0x6eB5e2011964a3D7Cf371aAbBD49545C70A7052c` | `0x6AFF673B72310de0354D3357e225Ad703182E1a0` | Fact-checking (shares key with Researcher) |
| Writer | `0x7cB1966270d9D257AD1EEE4bEb142622A9937494` | `0x5E4073c01825041941395C7D6b900748baA844c0` | Report synthesis |

Get current agent SA addresses: `GET /api/agent-smartaccounts`

---

## Venice AI Models (confirmed working)

| Role | Model ID |
|------|----------|
| Reasoning / fact-check | `deepseek-v3.2` |
| Fast chat / writing | `mistral-small-2603` |
| Web search | `llama-3.3-70b` (with `venice_parameters.enable_web_search: 'on'`) |

**Do NOT use**: `venice-reasoning-preview` or `mistral-31-24b` — these models return 404.

---

## API Routes (`src/server.js`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/goal` | Submit research goal |
| POST | `/api/execute` | Run full estimate→send flow via 1Shot, returns taskId |
| GET | `/api/task-status?id=` | Poll 1Shot for on-chain tx status |
| GET | `/api/relayer-caps` | Live 1Shot targetAddress + feeCollector for signing |
| GET | `/api/agent-smartaccounts` | Hybrid SA addresses for agent x402 USDC funding |
| POST | `/api/venice/chat` | x402-gated Venice chat proxy |
| POST | `/api/venice/search` | x402-gated Venice search proxy |
| GET | `/api/health` | System status |
| GET | `/api/balances` | USDC balances (ethers balanceOf) |
| GET | `/api/registry` | All marketplace services |
| GET | `/api/escrows` | In-memory escrow sessions |
| GET | `/api/transactions` | On-chain USDC Transfer events |
| GET | `/api/delegations` | ERC-7710 delegation chain view |
| GET | `/api/reasoning` | Agent decision log |
| GET | `/api/agents` | Agent names, roles, wallets |
| GET | `/api/events/stream` | SSE real-time stream |

---

## Environment Variables (`.env`)

```bash
# Network (Base Sepolia — for all payments)
NETWORK_NAME=base-sepolia
CHAIN_ID=84532
RPC_URL=https://sepolia.base.org
USDC_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e

# Agent EOA keypairs (Base Sepolia)
ORCHESTRATOR_PRIVATE_KEY=0x9ec4f904...
ORCHESTRATOR_ADDRESS=0xF9bc59882a7d6D2Dd24ff3800F69CC459bDDCC62
RESEARCHER_PRIVATE_KEY=0x6662d837...
RESEARCHER_ADDRESS=0x6eB5e2011964a3D7Cf371aAbBD49545C70A7052c
WRITER_PRIVATE_KEY=0xea5bcd08...
WRITER_ADDRESS=0x7cB1966270d9D257AD1EEE4bEb142622A9937494
VALIDATOR_* = same as RESEARCHER

# 1Shot Relayer (public — no API key required)
ONESHOT_API_KEY=...      # unused for public relayer

# Venice AI
VENICE_API_KEY=VENICE_INFERENCE_KEY_...

# x402 micropayments
X402_ENABLED=true
X402_ENDPOINT_BASE=http://localhost:3001
X402_TREASURY_ADDRESS=0xF9bc59882a7d6D2Dd24ff3800F69CC459bDDCC62

PORT=3001
```

---

## What's Done

- [x] Venice AI integration (3 models, confirmed working)
- [x] Agent pipeline: research → validate → write → report (SSE real-time)
- [x] x402 micropayment middleware — **real** HTTP 402 enforcement (not cosmetic)
- [x] 1Shot public relayer client (`src/oneshot.js`)
  - `relayer_getCapabilities` — live targetAddress + feeCollector (no hardcoding)
  - `relayer_estimate7710Transaction` — gets context blob + required fee
  - Two-phase estimation: rebuild executions if fee differs, re-estimate
  - `relayer_send7710Transaction` with context blob (required by relayer)
  - `relayer_getStatus` — 100/110=Pending, 200=Confirmed, 400=Rejected, 500=Reverted
  - `toRelayerJson()` for BigInt/Uint8Array serialization
  - txHash read from `result.hash`
- [x] `GET /api/relayer-caps` — serves live 1Shot capabilities to frontend for signing
- [x] MetaMask Hybrid smart account (`app/lib/smartAccount.ts`)
  - `deploySmartAccount()` — deploys SA via SimpleFactory (MetaMask send-tx popup)
  - `getSmartAccountAddress()` — counterfactual address derivation
  - `signDelegationForOneShot()` — fetches live targetAddress, FunctionCall + erc20PeriodTransfer caveats (4 total), MetaMask EIP-712 popup
  - NO EIP-7702 authorization (Hybrid SA is a contract, not an EOA upgrade)
- [x] Deploy Smart Account UI button (amber, shown when SA not deployed)
- [x] Deployment check on wallet connect (eth_getCode via Base Sepolia RPC)
- [x] Delegation tab shows SA address, deployment status, funding instructions
- [x] `POST /api/execute` — full 6-step 1Shot flow with estimation
- [x] `GET /api/task-status` — polls 1Shot, returns normalized status + txHash
- [x] `GET /api/agent-smartaccounts` — returns Hybrid SA addresses for x402 funding
- [x] Frontend payment state machine (idle → executing → polling → confirmed)
- [x] Sepolia BaseScan tx link on confirmation

---

## What Blocks On-Chain Payment (User Must Do)

1. **Deploy SA** — click "Deploy Smart Account" in dashboard (~0.00005 ETH gas)
2. **Get USDC** — [faucet.circle.com](https://faucet.circle.com), select Base Sepolia
3. **Fund SA with ≥0.14 USDC** — send to Hybrid SA address shown in Delegation tab

After these three steps: Sign Delegation → Run Mission → Pay Agents On-Chain works end-to-end.

---

## Known Issues / Notes

- **Validator shares wallet with Researcher** — same private key, same EOA, same Hybrid SA. Escrow skipped between them automatically.
- **Agent-to-agent payments (backend)**: via ethers.js sendTransaction. Falls back to `status:'simulated'` if wallets are unfunded.
- **x402 agent accounts**: Need USDC on Base Sepolia for x402 to actually settle. Without USDC, `x402-client.js` catches the payment error and falls through to a direct Venice call. Getting USDC to agent SAs from `GET /api/agent-smartaccounts` enables full x402 enforcement.
- **erc20PeriodTransfer caveat**: Starts a 24h spending window from delegation signing time. If the user re-uses the same signed delegation for multiple missions, the cumulative spend cannot exceed `maxAmountUsdc`. Re-signing creates a fresh delegation with a new salt and fresh period.
- **Next.js static export**: `output: "export"` in next.config.ts. All API routes must be in `src/server.js` (Express).

---

## Design System (AMOLED Dark Green)

```
Background:    #000000
Orchestrator:  #4a7a49
Researcher:    #3d7a5a
Validator:     #52735a
Writer:        #6b8a5a
```

No neon. No bright colors. All inline Tailwind arbitrary values.

---

## Running the Project

```bash
npm install
npm run build     # Build Next.js static export → out/
npm start         # Express on :3001 (serves built frontend + API)
npm run dev       # Next.js dev server on :3000
npm run dev:server # Express with --watch on :3001
npm test          # Jest unit tests
```
