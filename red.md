# Redelegator Finance — Complete Technical Reference

> Autonomous DeFi Portfolio Manager  
> MetaMask Smart Accounts Kit × 1Shot API × Venice AI Hackathon · Track: Best A2A Coordination  
> Chain: **Base Mainnet** (chainId 8453)  
> Live: https://redelegator-finance.vercel.app

---

## What It Does

Users grant **one scoped ERC-7715 permission** (per-token, per-day, expiring, revocable). An AI orchestrator parses their intent via Venice AI and **redelegates a progressively narrowed budget** down a chain of specialist agents (Dex Aggregator → Liquid Staking / Yield Agent). The 1Shot public relayer redeems the entire delegation chain on-chain with gas paid in USDC. Assets land **directly in the user's wallet** — zero agent custody.

Core thesis: **"Authority should only ever narrow."**

---

## Folder Structure

```
redelegator-finance-main/
├── frontend/                             # Next.js 16 full-stack (SSR + API routes)
│   ├── src/
│   │   ├── app/
│   │   │   ├── api/                      # 15 API route endpoints
│   │   │   └── (main)/page.tsx           # Single app page
│   │   ├── lib/                          # All business logic
│   │   │   ├── agents/
│   │   │   │   ├── accounts.ts           # Load 5 agent smart accounts from env keys
│   │   │   │   ├── runner.ts             # executeStrategy — build + submit redelegation chain
│   │   │   │   ├── deployerSwap.ts       # Deployer executes actual swap via LI.FI
│   │   │   │   └── types.ts              # DeployerKey, RunStep, ExecutionLeg, RunResult
│   │   │   ├── delegation/
│   │   │   │   ├── create.ts             # createRootErc20Delegation (user → orchestrator)
│   │   │   │   ├── redelegate.ts         # redelegateErc20Narrowed (A2A hop)
│   │   │   │   ├── caveats.ts            # erc20SpendCapCaveats (build spend-cap caveat)
│   │   │   │   ├── revoke.ts             # encodeDisableDelegation (kill-switch)
│   │   │   │   └── redeem.ts             # encodeRedeemDelegations (on-chain redeem)
│   │   │   ├── venice/
│   │   │   │   ├── reasoning.ts          # parseIntent (Venice LLM + fallback)
│   │   │   │   └── schema.ts             # Strategy, Allocation, ReasoningInput (Zod)
│   │   │   ├── oneshot/
│   │   │   │   ├── relayer.ts            # JSON-RPC client (estimate, send, status)
│   │   │   │   ├── schema.ts             # Zod schemas (capabilities, fee, estimate, status)
│   │   │   │   └── serialize.ts          # toRelayerJson (bigint → hex)
│   │   │   ├── lifi/
│   │   │   │   ├── client.ts             # getQuote (LI.FI quote request)
│   │   │   │   ├── swap.ts               # buildSwapExecution (USDC → wstETH)
│   │   │   │   ├── earn.ts               # getEarnVaults (LI.FI Earn vaults + APY)
│   │   │   │   └── tools.ts              # getLifiTools (exchanges, bridges, tokens)
│   │   │   ├── uniswap/
│   │   │   │   └── lp.ts                 # buildLpPlan (pool read + Position + calldata)
│   │   │   ├── lido/
│   │   │   │   └── apr.ts                # getLidoApr (SMA 7-day + latest)
│   │   │   ├── ondo/
│   │   │   │   └── tokens.ts             # getOndoTokens (USDY, OUSG, ONDO)
│   │   │   ├── web3/
│   │   │   │   ├── client.ts             # publicClient (viem Base)
│   │   │   │   ├── smartAccount.ts       # toStateless7702SmartAccount, baseEnvironment
│   │   │   │   └── bundler.ts            # createBaseBundlerClient (Pimlico/custom)
│   │   │   ├── strategy/
│   │   │   │   └── legs.ts               # strategyToLegs (Strategy → ApiLeg[])
│   │   │   └── config/
│   │   │       ├── env.server.ts         # Zod schema for all server env vars
│   │   │       ├── tokens.ts             # USDC, wstETH, LIFI_DIAMOND addresses
│   │   │       └── chain.ts              # Base chain config
│   │   ├── hooks/
│   │   │   ├── useDelegationFlow.ts      # Core flow orchestration hook
│   │   │   ├── useChainState.ts          # Poll on-chain state
│   │   │   ├── useLifiQuote.ts           # Fetch LI.FI quote
│   │   │   └── useVeniceReasoning.ts     # Fetch reasoning
│   │   └── components/pages/(main)/
│   │       ├── index.tsx                 # MainPage (layout)
│   │       ├── AgentNode.tsx             # Single agent circle (status ring)
│   │       ├── PannableCanvas.tsx        # Pannable/zoomable radial graph
│   │       ├── DelegationDashboard.tsx   # Root canvas + agent grid
│   │       ├── LiveActivityCard.tsx      # Full-screen activity overlay
│   │       ├── RedelegationFlow.tsx      # A2A animation + permission report
│   │       ├── PermissionReport.tsx      # Allows/Prevents/Worst Case panel
│   │       ├── AssistantPanel.tsx        # Chat interface (left side)
│   │       ├── ChatComposer.tsx          # Input + intent chips
│   │       ├── ProcessCards.tsx          # Lido/LI.FI/Uniswap detail cards
│   │       ├── LiquidStakingDetail.tsx   # Lido APR + 7-day recharts area chart
│   │       ├── DexAggregatorDetail.tsx   # LI.FI tools + token lists
│   │       ├── YieldAgentDetail.tsx      # LI.FI Earn vaults + APY/TVL
│   │       ├── UniswapLpDetail.tsx       # Pool selector + TVL/APY
│   │       └── OndoRwaDetail.tsx         # Ondo token list + price (roadmap)
│   ├── scripts/
│   │   ├── fund.mjs                      # Distribute gas ETH to 5 agents
│   │   └── upgrade-agents.mjs            # Each agent self-upgrades to EIP-7702
│   └── .env.example
└── skills/                               # LLM context docs (one .md per topic)
    ├── redelegator-a2a-flow/SKILL.md     # Read first
    ├── metamask-smart-account-setup/
    ├── metamask-delegation-create/
    ├── metamask-redelegation-create/
    ├── metamask-caveats-reference/
    ├── metamask-delegation-revoke/
    ├── venice-reasoning/
    ├── oneshot-gas-sponsorship/
    ├── lifi-quote/
    ├── lifi-swap/
    ├── lifi-earn/
    ├── lido-staking/
    └── uniswap-lp-api/
```

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js | 16.2.7 |
| UI | React + React Compiler | 19.2.4 |
| Styling | Tailwind CSS | v4 |
| TypeScript | TypeScript | 5.x strict |
| Wallet | wagmi | 3.6.16 |
| Blockchain | viem | 2.52.2 |
| Smart Accounts | @metamask/smart-accounts-kit | 1.6.0 |
| LP Engine | @uniswap/v3-sdk + @uniswap/sdk-core | 3.30.4, 7.17.0 |
| Charts | Recharts | 3.8.1 |
| Animation | Framer Motion | 12.40.0 |
| Validation | Zod | 4.4.3 |
| API Queries | TanStack React Query | 5.101.0 |
| Lint | Biome | 2.2.0 |

---

## The 5 Agents

All agents use `Implementation.Stateless7702` (EIP-7702, not Hybrid). EOA-based, no persistent on-chain deployment needed — just an authorization signature each run.

| Agent | Private Key Env Var | Role | What It Does |
|---|---|---|---|
| **Orchestrator** | `ORCHESTRATOR_PRIVATE_KEY` | Root receiver + re-delegator | Receives user grant, calls Venice for strategy, redelegates to Dex |
| **Dex Aggregator** | `DEX_AGGREGATOR_PRIVATE_KEY` | Routing engine + re-delegator | Receives from Orchestrator, routes via LI.FI, redelegates to Staking/Yield |
| **Liquid Staking** | `LIQUID_STAKING_PRIVATE_KEY` | Deployer (Lido path) | Receives USDC, swaps to wstETH via LI.FI, sends to user |
| **Yield Agent** | `YIELD_AGENT_PRIVATE_KEY` | Deployer (LI.FI Earn path) | Receives USDC, deposits to LI.FI Earn vault, sends receipt to user |
| **Risk Guardian** | `RISK_GUARDIAN_PRIVATE_KEY` | Anomaly detector | Roadmap — auto-revoke on anomaly (not implemented) |

**Stretch agents (UI only):**
- **Uniswap LP** — builds LP position calldata, user signs client-side (no agent signing)
- **Ondo RWA** — roadmap token aggregator (display only, no execution)

---

## Smart Account Setup

### Implementation: Stateless7702

- Agents are fresh EOAs upgraded via EIP-7702 authorization each run
- No persistent on-chain deployment (no CREATE2 factory)
- Address is deterministic from private key (via `viem privateKeyToAccount`)
- Smart account wraps the EOA; same address throughout

```ts
// backend — load all 5 agents
const account = accountFromPrivateKey(env.AGENT_KEY);
const smartAccount = await toStateless7702SmartAccount(account);
// smartAccount.address = agent's on-chain identity
// smartAccount.environment = { DelegationManager, ...implementations }

// frontend — user
const smartAccount = await toWalletSmartAccount(walletClient);
```

### One-Time Setup (mainnet)

```bash
pnpm fund 0.0001        # Distribute gas ETH to 5 agents from FUNDER_PRIVATE_KEY
pnpm upgrade-agents     # Each agent signs EIP-7702 authorization and broadcasts it
```

No USDC pre-funding needed. USDC flows from user's delegated account through 1Shot to each agent leg.

---

## ERC-7715 Grant — The Single User Prompt

The user signs **one permission** off-chain via MetaMask extension (≥13.23). No gas.

```ts
wallet_requestExecutionPermissions([{
  chainId: 8453,
  to: orchestratorAddress,
  permission: {
    type: "erc20-token-periodic",
    data: {
      tokenAddress: USDC_ADDRESS,
      periodAmount: maxAmount + FEE_HEADROOM,  // e.g., 200.05 USDC
      periodDuration: 86400,                    // 24 hours
      justification: "Delegate USDC to the Orchestrator agent",
    },
    isAdjustmentAllowed: true,
  },
  expiry: Math.floor(Date.now() / 1000) + 3600,  // 1 hour
}]);
```

Result: `context` → `decodeDelegations(context)[0]` → signed root `Delegation` (off-chain EIP-191 sig).

**Path:** `frontend/src/hooks/useDelegationFlow.ts` lines 294–323

---

## Redelegation Chain — Authority Narrowing

The central pattern: every hop creates a new delegation where `maxAmount` ≤ parent's `maxAmount`. You cannot raise authority; you can only narrow it. The DelegationManager enforces all caps at redemption.

### Delegation Chain Structure

```
USER  ($200/day USDC via ERC-7715)
  │
  └─ ROOT: user → orchestrator  [cap: $200.05]
       └─ [Backend: Orchestrator signs]
       └─ HOP 1: orchestrator → dexAggregator  [cap: $200.05]
            └─ [Backend: Dex Aggregator signs]
            ├─ HOP 2a: dexAggregator → liquidStaking  [cap: $100.05]
            │    └─ [Backend: Liquid Staking signs]
            │    └─ HOP 3a: liquidStaking → 1Shot target  [cap: $100.05]
            │         └─ [1Shot redeems on-chain]
            │         └─ Transfer $100 USDC → liquidStaking
            │         └─ liquidStaking.deployerSwap() → LI.FI → wstETH → USER WALLET
            │
            └─ HOP 2b: dexAggregator → yieldAgent  [cap: $100]
                 └─ [Backend: Yield Agent signs]
                 └─ HOP 3b: yieldAgent → 1Shot target  [cap: $100]
                      └─ [1Shot redeems on-chain]
                      └─ Transfer $100 USDC → yieldAgent
                      └─ yieldAgent.deployerSwap() → LI.FI Earn vault → USER WALLET
```

### Caveat Used: `Erc20TransferAmount`

| CaveatType | Parameters | Enforces |
|---|---|---|
| `Erc20TransferAmount` | `{ tokenAddress, maxAmount }` | Max cumulative ERC-20 spend per delegation |

- Redelegations can **only lower** `maxAmount` or **add** new caveats — never raise/remove parent constraints
- Violations surface **at on-chain redemption**, not at creation

```ts
// lib/delegation/caveats.ts
function erc20SpendCapCaveats(environment, tokenAddress, maxAmount) {
  return [{
    enforcer: environment.caveats.Erc20TransferAmount,
    terms: encodeAbiParameters([tokenAddress]),
    args: encodeAbiParameters([maxAmount]),
  }];
}
```

### Exact Delegation Object Structure

```ts
interface Delegation {
  delegate: Address;     // target (recipient of authority)
  delegator: Address;    // source (grantor)
  authority: Hex;        // hash(parentDelegation) or root hash
  caveats: Caveat[];     // [{enforcer, terms, args}, ...]
  salt: Hex;             // unique per delegation (replay guard)
  signature?: Hex;       // EIP-191 sig from delegator
}

interface Caveat {
  enforcer: Address;     // caveat contract (MetaMask-provided)
  terms: Hex;            // condition (e.g., token address)
  args: Hex;             // limit (e.g., max amount in wei)
}
```

---

## 1Shot Integration

**Relayer URL:** `https://relayer.1shotapi.com/relayers`  
**Chain:** Base Mainnet (8453)  
**Fee Token:** USDC (no native gas needed from user)

### 6-Step Flow

```ts
// [1] Check capabilities
await getCapabilities("8453")
  → relayer_getCapabilities
  → { "8453": { feeCollector, targetAddress, tokens[] } }

// [2] Get fee estimate
await getFeeData("8453", USDC_ADDRESS)
  → relayer_getFeeData
  → { minFee, rate, ... }

// [3] Build bundle + estimate gas
await estimate7710Transaction({
  chainId: "8453",
  transactions: [
    {
      permissionContext: [deployerToTarget, dexToDeployer, orchToDex, signedRoot],
      executions: [
        { target: USDC, data: transfer(feeCollector, fee), value: "0" },  // leg 0 only
        { target: USDC, data: transfer(deployerAddress, legAmount), value: "0" },
      ]
    },
    // one entry per leg
  ],
  authorizationList?: [EIP-7702 authorizations],
})
  → { success, requiredPaymentAmount, context }

// [4] If fee changed, rebuild + re-estimate

// [5] Submit
await send7710Transaction({ ...params, context: estimate.result.context })
  → taskId (string)

// [6] Poll every 4s
await getStatus(taskId)
  → { status: 100|110|200|400|500, hash? }
  // 100=Queued, 110=Submitted, 200=Confirmed, 400=Rejected, 500=Reverted
```

**Path:** `frontend/src/lib/oneshot/relayer.ts` (lines 78–173 for fee handling in runner)

### Fee Calculation

- `max(convertedFee from rate, minFee)` — not hardcoded
- Default fallback: 0.05 USDC if relayer gives no `minFee`
- Fee transfer is the **first execution** in leg 0's bundle only

---

## Venice AI Integration

**Model:** `qwen3-235b-a22b-instruct-2507` (strict JSON capable)  
**Base URL:** `https://api.venice.ai/api/v1`  
**Auth:** Bearer token (server-side only)  
**Timeout:** 30 seconds

### System Prompt

```
"You convert a user's DeFi intent into a delegation strategy. Output ONLY JSON matching the schema.
The split_ratio values must sum to 1, and the sum of allocation amounts must not exceed total_budget.
Use the provided asset, total_budget, and chain."
```

### Strict JSON Schema (passed as `response_format`)

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["asset", "total_budget", "chain", "allocations", "residual"],
  "properties": {
    "asset": { "type": "string" },
    "total_budget": { "type": "number" },
    "chain": { "type": "string" },
    "residual": { "type": "number" },
    "allocations": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["protocol", "action", "split_ratio", "amount", "spend_cap"],
        "properties": {
          "protocol": { "type": "string" },
          "action": { "type": "string" },
          "split_ratio": { "type": "number" },
          "amount": { "type": "number" },
          "spend_cap": { "type": "number" }
        }
      }
    }
  }
}
```

### Zod Validation (code-side)

```ts
strategySchema = z.object({
  asset: z.string(),
  total_budget: z.number().positive(),
  chain: z.string(),
  allocations: z.array(allocationSchema).min(1),
  residual: z.number().nonnegative().default(0),
})
  .refine(s => Math.abs(s.allocations.reduce((sum, a) => sum + a.split_ratio, 0) - 1) < 1e-6)
  .refine(s => s.allocations.reduce((sum, a) => sum + a.amount, 0) <= s.total_budget);
```

### Fallback Logic

On Venice 429 (rate limit) or any non-200:
- Detect protocol from intent keywords: "lido" → Lido, "uniswap"/"lp" → Uniswap, else LI.FI
- Return single allocation with 100% of budget

**Path:** `frontend/src/lib/venice/reasoning.ts` lines 150–197

---

## DeFi Integrations

### Lido (Liquid Staking)

**What:** Stake USDC → wstETH via LI.FI. Real staking on mainnet.

**Data feeds:**
```
GET https://eth-api.lido.fi/v1/protocol/steth/apr/sma    # 7-day SMA + APR series
GET https://eth-api.lido.fi/v1/protocol/steth/apr/last   # latest APR
```
- 5-min cache
- Used in `LiquidStakingDetail` card (recharts gradient area chart)

**Execution:**
```ts
const swap = await buildSwapExecution({
  fromToken: USDC,
  toToken: WSTETH,
  fromAmount: 100e6,
  toAddress: userWallet,  // output goes to user, not agent
});
```

**Path:** `frontend/src/lib/lido/apr.ts`

### LI.FI (Dex Aggregator + Yield Vaults)

**What:** Multi-chain routing, yield vault deposits, token data.

| Endpoint | Purpose |
|---|---|
| `GET /v1/quote` | Swap calldata + slippage |
| `GET /v1/tokens?chains=8453` | Token list + logos |
| `GET /v1/tools?chains=8453` | Exchanges, bridges |
| `GET https://earn.li.fi/v1/vaults?chainId=8453` | Vault list + APY/TVL |

- Integrator header: `x-lifi-api-key: redelegator-finance`
- `toAddress: userWallet` for all swaps (zero agent custody)
- Default slippage: 0.5%
- Earn/tools cache: 5 min; tokens cache: 1 hour

**Paths:** `lib/lifi/swap.ts`, `lib/lifi/earn.ts`, `lib/lifi/tools.ts`

### Uniswap v3 (LP — Client-Side)

**What:** Build LP calldata on-server, user signs on-client. LP NFT minted directly to user address.

**Pool:** USDC/WETH 0.05% (tickSpacing 10) — `0xd0b53d9277642d899df5c87a3966a349a798f224`  
**Position Manager:** `0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1`

```ts
// Read pool on-chain
const slot0 = await pool.slot0();  // sqrtPriceX96, tick

// Build position
const position = Position.fromAmount1({
  pool,
  tickLower: nearestUsableTick(TickMath.MIN_TICK, spacing),
  tickUpper: nearestUsableTick(TickMath.MAX_TICK, spacing),
  amount1: amountUSDC,
});

// Generate calldata
const { calldata, value } = NonfungiblePositionManager.addCallParameters(position, {
  recipient: userWallet,
  deadline: now + 20 minutes,
  slippageTolerance: 50 bps,
  useNative: Ether.onChain(8453),
});

// Return: approvals + mint tx for user to sign
return {
  approvals: [{ to: USDC, data: approve(POSITION_MANAGER, amount1), value: "0" }],
  create: { to: POSITION_MANAGER, data: calldata, value: ethNeeded },
};
```

**Constraint:** LP cannot be mixed with other legs in the same delegation (enforced in `useDelegationFlow` line 189–192).

**Path:** `frontend/src/lib/uniswap/lp.ts`

### Ondo RWA (Roadmap)

Fetches USDY, OUSG, ONDO tokens from LI.FI token list. Display only — no execution.

---

## Kill-Switch (Revocation)

**Who can call:** User (original delegator)  
**Effect:** Instantly disables the root delegation → all downstream agents' authority dies  
**Cascade:** Any attempt to redeem any sub-delegation fails at `DelegationManager.redeemDelegations`

```ts
// frontend/src/lib/delegation/revoke.ts
export function encodeDisableDelegation(delegation: Delegation): Hex {
  return DelegationManager.encode.disableDelegation({ delegation });
}

// frontend/src/hooks/useDelegationFlow.ts lines 388–412
const revoke = useCallback(async () => {
  const root = state.rootDelegation;
  if (!walletClient || !root) return;

  setState(prev => ({ ...prev, revoked: true }));  // optimistic UI grey-out

  const userAccount = await toWalletSmartAccount(walletClient);
  const bundler = createBaseBundlerClient(`${window.location.origin}/api/bundler`);

  await bundler.sendUserOperation({
    account: userAccount,
    calls: [{
      to: delegationManagerAddress(),
      data: encodeDisableDelegation(root),
      value: 0n,
    }],
  });
}, [walletClient, state.rootDelegation]);
```

- Uses bundler (Pimlico or custom `/api/bundler`) to send the UserOperation
- `fail silently` — error caught but UI stays in `revoked: true` state

---

## All API Routes

| Route | Method | Purpose | Real? |
|---|---|---|---|
| `/api/agents` | GET | List 5 agent addresses | Real |
| `/api/execute` | POST | Build + submit delegation chain | Real |
| `/api/agents/swap` | POST | Deployer executes LI.FI swap | Real (on-chain) |
| `/api/status` | GET | Poll 1Shot relayer status | Real |
| `/api/venice/reasoning` | POST | Intent → strategy | Real (Venice) |
| `/api/uniswap/lp` | POST | Build LP calldata | Real (pool read + SDK) |
| `/api/lifi/quote` | POST | Get swap quote | Real (LI.FI) |
| `/api/lifi/earn` | GET | Fetch vaults + APY | Real (LI.FI) |
| `/api/lifi/tools` | GET | Exchanges, bridges, tokens | Real (LI.FI) |
| `/api/lido/apr` | GET | stETH APR + series | Real (Lido) |
| `/api/ondo/tokens` | GET | USDY, OUSG, ONDO | Real (LI.FI) |
| `/api/uniswap/pools` | GET | Top pools | Real (DeFiLlama) |
| `/api/oneshot/capabilities` | GET | Relayer capabilities | Real |
| `/api/bundler` | POST | Proxy to Pimlico bundler | Proxy |
| `/api/onchain` | GET | On-chain delegation state | Real (contract read) |

### POST /api/execute (The Orchestration Core)

```ts
// Input
{
  signedRootDelegation: Delegation,   // user's grant to Orchestrator
  rootTokenAddress: Address,          // USDC
  legs: ExecutionLeg[],               // [{ deployer, amount }, ...]
  authorizationList?: unknown[]       // EIP-7702 (if needed)
}

// Output
{ steps: [{ id, label, status, taskId? }] }
```

Internally: loads agents → 1Shot capabilities → estimate → adjust fee → send → returns task IDs.

### POST /api/agents/swap

```ts
// Input
{ deployer: "liquidStaking" | "yieldAgent", amount: string, userAddress?: Address }

// Output
{ approveHash: string, swapHash: string, toToken: Address, recipient: Address }
```

Deployer signs + sends real LI.FI swap. Output (wstETH or vault token) goes to **user wallet**.

---

## Payment Flow

```
User USDC ($200)
  │
  ├─ [Sign ERC-7715 grant — no gas, off-chain]
  │   └─ Authority to Orchestrator ($200 + 0.05 USDC fee headroom)
  │
  ├─ POST /api/execute
  │   └─ 1Shot relayer (on-chain):
  │       ├─ Transfer $0.05 USDC → feeCollector
  │       ├─ Transfer $100 USDC → Liquid Staking agent
  │       │    └─ Agent calls LI.FI: USDC → wstETH → USER WALLET ✓
  │       └─ Transfer $100 USDC → Yield Agent
  │            └─ Agent deposits to LI.FI Earn vault → USER WALLET ✓
  │
  └─ [Anytime] revoke: DelegationManager.disableDelegation(root)
       └─ All agents instantly powerless
```

---

## UI Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Header: Logo · Chain Badge · Connect Wallet                │
├─────────────────────────────────┬───────────────────────────┤
│                                 │                           │
│   Main Canvas (Pannable)        │   AssistantPanel          │
│   ├─ Radial agent graph         │   ├─ Intent input         │
│   │   ├─ Orchestrator (center)  │   ├─ Chips: "Lido only"  │
│   │   ├─ Dex Aggregator         │   ├─ Submit button        │
│   │   ├─ Liquid Staking         │   ├─ Strategy preview     │
│   │   ├─ Yield Agent            │   └─ Agent detail panel   │
│   │   └─ Risk Guardian          │                           │
│   │                             │                           │
│   ├─ AgentNode (circular)       │                           │
│   │   └─ Status ring:           │                           │
│   │       amber = active        │                           │
│   │       green = done          │                           │
│   │       red = error           │                           │
│   │       grey = idle           │                           │
│   │                             │                           │
│   └─ (on agent click)           │                           │
│       AgentDetailPanel (right)  │                           │
│       ├─ LiquidStakingDetail    │                           │
│       ├─ DexAggregatorDetail    │                           │
│       ├─ YieldAgentDetail       │                           │
│       ├─ UniswapLpDetail        │                           │
│       └─ OndoRwaDetail          │                           │
│                                 │                           │
│   + LiveActivityCard (overlay)  │                           │
│     ├─ RedelegationFlow anim.   │                           │
│     ├─ ActivityFeed (steps)     │                           │
│     └─ PermissionReport         │                           │
│         ├─ ALLOWS: ...          │                           │
│         ├─ PREVENTS: ...        │                           │
│         └─ WORST CASE: ...      │                           │
└─────────────────────────────────┴───────────────────────────┘
```

### AgentNode.tsx — Status Rings

```
Color state driven by agent execution phase:
  amber  = active (currently executing)
  green  = done (completed successfully)
  red    = error (failed)
  grey   = idle / not yet reached
```

Same ring-color system Gekko adopted for its pipeline stepper.

### Real Data Feeds in UI

| Source | Component | Data |
|---|---|---|
| Lido API | LiquidStakingDetail | APR (SMA + latest), 7-day recharts area chart |
| LI.FI Earn | YieldAgentDetail | Vaults (name, APY, TVL, protocol icon) |
| LI.FI Tools | DexAggregatorDetail | Exchanges, bridges, token list |
| DeFiLlama | UniswapLpDetail | Top pools (TVL, APY) |
| LI.FI Tokens | DexAggregatorDetail | Token logos + symbols |
| Ondo via LI.FI | OndoRwaDetail | USDY, OUSG, ONDO + price |

---

## Core Hook: useDelegationFlow

```ts
const {
  phase,           // "idle" | "reasoning" | "signing" | "executing" | "done" | "error"
  strategy,        // Venice output (allocations)
  steps,           // RunStep[] (redelegate, redeem, swap, ...)
  milestones,      // User-facing (Reasoning, Signing, Executing)
  error,           // Error message
  rootDelegation,  // Signed root (after ERC-7715)
  revoked,         // Kill-switch invoked
  run,             // (intent: string) => void
  revoke,          // () => void
  isRunning,       // bool
  canRevoke,       // bool (root exists && !revoked)
} = useDelegationFlow();
```

**Path:** `frontend/src/hooks/useDelegationFlow.ts`

---

## Environment Variables

### Server-Side Schema (`lib/config/env.server.ts`)

```ts
const serverEnvSchema = z.object({
  VENICE_API_KEY: z.string().optional(),
  VENICE_BASE_URL: z.string().default("https://api.venice.ai/api/v1"),
  VENICE_MODEL: z.string().default("qwen3-235b-a22b-instruct-2507"),
  LIFI_API_KEY: z.string().optional(),
  LIFI_BASE_URL: z.string().default("https://li.quest/v1"),
  LIFI_EARN_BASE_URL: z.string().default("https://earn.li.fi/v1"),
  LIFI_INTEGRATOR: z.string().default("redelegator-finance"),
  LIDO_API_URL: z.string().default("https://eth-api.lido.fi"),
  UNISWAP_API_KEY: z.string().optional(),
  ONESHOT_RELAYER_URL: z.string().default("https://relayer.1shotapi.com/relayers"),
  RPC_URL: z.string().optional(),
  BUNDLER_URL: z.string().optional(),
  ORCHESTRATOR_PRIVATE_KEY: z.string().optional(),
  DEX_AGGREGATOR_PRIVATE_KEY: z.string().optional(),
  LIQUID_STAKING_PRIVATE_KEY: z.string().optional(),
  YIELD_AGENT_PRIVATE_KEY: z.string().optional(),
  RISK_GUARDIAN_PRIVATE_KEY: z.string().optional(),
});
```

### Client-Side (Next.js public)

```
NEXT_PUBLIC_CHAIN_ID=8453
NEXT_PUBLIC_RPC_URL=https://mainnet.base.org
NEXT_PUBLIC_USDC_ADDRESS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
NEXT_PUBLIC_LIDO_ADDRESS=0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452
```

---

## Real vs. Simulated — Full Table

| Component | Status | Notes |
|---|---|---|
| ERC-7715 grant | **Real** | MetaMask ≥13.23, EIP-712, Base mainnet |
| EIP-7702 agent upgrades | **Real** | Agents self-sign authorization + broadcast |
| Delegation creation | **Real** | Off-chain EIP-191, Zod-validated, no gas |
| A2A redelegation | **Real** | Each hop is a real signed delegation |
| 1Shot relayer | **Real** | JSON-RPC to production relayer, Base mainnet |
| DelegationManager | **Real** | Base mainnet contract, enforces all caveats |
| USDC transfers | **Real** | On-chain via 1Shot target |
| LI.FI swaps | **Real** | Mainnet swaps, real routing, real slippage |
| Lido staking | **Real** | USDC → wstETH via LI.FI, real stETH |
| LI.FI Earn deposits | **Real** | Real vault deposits, APY accrual |
| Uniswap mint | **Real** | LP NFT minted to user, real liquidity |
| Revocation (kill-switch) | **Real** | `disableDelegation` on-chain, instant |
| Lido APR feed | **Real** | Live API, 5-min cache |
| LI.FI Earn vaults | **Real** | Live list, real APY/TVL |
| x402 micropayments | **NOT USED** | No Venice-to-agent payment layer |
| Hybrid smart accounts | **NOT USED** | Only Stateless7702 via EIP-7702 |
| Risk Guardian auto-revoke | **Roadmap** | Not implemented |
| Ondo allocation execution | **Roadmap** | UI display only |

---

## Comparison: Redelegator vs. Gekko

| Feature | Redelegator Finance | Gekko |
|---|---|---|
| Chain | Base **Mainnet** | Base **Sepolia** |
| Smart account type | Stateless7702 (EIP-7702) | **Hybrid** (CREATE2 factory) |
| Permission grant | ERC-7715 `wallet_grantPermissions` | ERC-7710 FunctionCall + erc20PeriodTransfer |
| Caveat type | `Erc20TransferAmount` (root delegation) | `FunctionCall` scope + `erc20PeriodTransfer` |
| A2A delegation depth | 4 hops (user → orch → dex → deployer → target) | 1 hop (user SA → target via 1Shot) |
| Authority narrowing | Yes — each hop redelegates narrower budget | No — single delegation to relayer |
| Number of agents | 5 (+ 2 roadmap) | 3 core workers + 5 virtual = 8 in marketplace |
| Marketplace competition | No — fixed routing by protocol | **Yes** — live price auction, cheapest wins |
| Venice model | qwen3-235b (strict JSON) | llama-3.3-70b (research) + deepseek-v3.2 + mistral |
| Venice output | Strict JSON strategy with Zod validation | Free-form research + structured JSON for investment mode |
| x402 micropayments | **No** (cosmetic/not implemented) | **Yes** — real HTTP 402 enforcement, agent SAs pay Venice |
| DeFi execution | **Real** (LI.FI swaps, Lido, Uniswap LP) | Research/analysis only (no DeFi execution) |
| Live feed / SSE | No SSE | **Yes** — SSE stream with auction events, reasoning logs |
| Kill-switch revocation | Yes — `disableDelegation(root)` | No |
| Real-time data feeds | Yes (Lido APR, LI.FI vaults, DeFiLlama) | Agent research queries Venice for live data |
| Agent visual graph | Radial graph (pannable/zoomable) | Linear stepper + Live Feed |

### What Redelegator Has That Gekko Doesn't
- Real DeFi execution (USDC actually becomes wstETH/vault token)
- True A2A redelegation chain (authority narrows at every hop, enforced on-chain)
- Kill-switch revocation
- Real data feeds powering the UI (Lido APR chart, LI.FI vault list, DeFiLlama pools)
- Radial pannable agent graph

### What Gekko Has That Redelegator Doesn't
- **Real x402 HTTP 402 enforcement** — agents pay Venice per call, Redelegator doesn't
- **Live marketplace price auction** — 8 agents compete, cheapest wins, shown in real-time
- **Actual research pipeline** — agents produce useful content, not just move USDC
- **SSE real-time feed** — every agent decision, bid, and reasoning step streamed live
- **Two output modes** — research markdown + investment structured JSON
- **MetaMask Hybrid SA** — deployed on-chain via SimpleFactory, broader compatibility

---

## Skills System

Redelegator ships a `skills/` directory — markdown files that act as LLM context. Each skill covers one capability domain.

```
skills/
├── skills.json                     # skill ID → path mapping
├── redelegator-a2a-flow/SKILL.md   # Read this first — full end-to-end
├── metamask-smart-account-setup/   # toMetaMaskSmartAccount, Implementations
├── metamask-delegation-create/     # Root delegation (user → orchestrator)
├── metamask-redelegation-create/   # Narrowing redelegation (A2A)
├── metamask-caveats-reference/     # Scopes + caveat enforcers
├── metamask-delegation-redeem/     # On-chain redeem + execute
├── metamask-delegation-revoke/     # Kill-switch (disableDelegation)
├── venice-reasoning/               # Intent → strategy (strict JSON)
├── oneshot-gas-sponsorship/        # Gas relay + fee quote
├── lifi-quote/                     # LI.FI swap/bridge quote
├── lifi-swap/                      # Execute LI.FI swap
├── lifi-earn/                      # LI.FI Earn vault deposit
├── lido-staking/                   # Lido stake (ETH → stETH)
└── uniswap-lp-api/                 # Headless Uniswap v3 mint
```

This pattern is useful for AI-assisted development — each domain has authoritative context that Claude or another LLM can load on demand.

---

## Hackathon Achievements

- [x] ERC-7715 + EIP-7702 smart account integration (mainnet)
- [x] Attenuated A2A redelegation chain — authority narrows at every hop, enforced on-chain
- [x] Venice AI strict-JSON reasoning with Zod validation + deterministic fallback
- [x] 1Shot gasless relay with USDC fee, context blob forwarding
- [x] Zero-custody execution — assets land in user wallet, never held by agents
- [x] Kill-switch revocation (`disableDelegation`)
- [x] Live permission report (ALLOWS / PREVENTS / WORST CASE)
- [x] Full-screen activity card with BaseScan links + step durations
- [x] Real DeFi integrations: Lido staking, LI.FI swaps, Uniswap v3 LP
- [x] Real live data feeds: Lido APR chart, LI.FI vaults, DeFiLlama pools

**Roadmap:**
- [ ] Risk Guardian auto-revoke (anomaly detection)
- [ ] Ondo RWA allocation
- [ ] Hybrid smart accounts (per-user sub-vaults)
- [ ] ERC-7715 advanced permissions
