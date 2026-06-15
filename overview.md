# Gekko — Complete Implementation Overview

> Autonomous AI agent marketplace with on-chain USDC payments  
> MetaMask Smart Accounts × 1Shot API × Venice AI Hackathon  
> Chain: **Base Sepolia** (chainId 84532)

---

## What Gekko Is

Gekko is a **full-stack autonomous agent system** where:
- 8 AI agents compete in a live price auction to win each task
- The cheapest agent wins — bid events are shown in real-time in the Live Feed
- Agents research topics (or analyze DeFi investments) using Venice AI
- Agents are paid in **real USDC on Base Sepolia** via on-chain ERC-7710 delegation
- Each Venice AI call is paid via **real x402 HTTP 402 micropayments** from agent Hybrid smart accounts

There are two distinct payment layers running in parallel:

| Layer | Who Pays | Token | Mechanism |
|---|---|---|---|
| User → Agents | User (via signed delegation) | USDC on Base Sepolia | ERC-7710 FunctionCall + erc20PeriodTransfer + 1Shot relayer |
| Agent → Venice AI | Agent Hybrid smart accounts | USDC on Base Sepolia | x402 HTTP 402 micropayments |

---

## Two Modes

### Research Mode (default)
- Agents research a topic using Venice AI with live web search
- Validator fact-checks the findings
- Writer synthesizes a professional markdown report
- Output: formatted markdown report shown in the Report tab

### Investment Analysis Mode
- User selects "Investment Analysis" before launching
- Researcher searches for DeFi yield opportunities, APY comparisons, protocol safety
- Validator fact-checks yield data
- Writer returns **structured JSON only** (no markdown)
- Output: rendered opportunity cards with APY, risk badge, allocation %, risk score bar

```json
{
  "summary": "overview paragraph",
  "opportunities": [
    { "protocol": "Aave v3", "action": "Deposit USDC", "estimatedAPY": "3.2%", "risk": "low", "allocation": "40%" }
  ],
  "riskScore": 3,
  "recommendation": "brief conclusion"
}
```

---

## Architecture

```
User (MetaMask Flask — Base Sepolia)
  │
  │  1. Deploy Hybrid Smart Account via SimpleFactory (one-time, ~0.00005 ETH)
  │     SA address ≠ EOA — derived deterministically via CREATE2
  │  2. Sign ERC-7710 delegation off-chain (FunctionCall + erc20PeriodTransfer — 4 caveats)
  │     Target address fetched live from relayer_getCapabilities
  │
  ▼
Gekko Dashboard (Next.js 16, static export, port 3001)
  │
  │  POST /api/goal { goal, mode }
  │
  ▼
Orchestrator (Express/Node.js, port 3001)
  │
  │  1. Verify USDC balance
  │  2. Plan subtasks: [research, validate, write]
  │  3. For each task: run marketplace price auction → cheapest agent wins
  │     Emits marketplace_bids SSE event (all candidates + prices)
  │     Then emits agent_discovered SSE event (winner)
  │
  ├── ResearchAgent  → Venice llama-3.3-70b + web search  [pays via x402]
  ├── ValidatorAgent → Venice deepseek-v3.2               [pays via x402]
  └── WriterAgent    → Venice mistral-small-2603          [pays via x402]
  │
  │  Emits SSE events to frontend in real-time throughout
  │
  ▼
User clicks "Pay Agents On-Chain"
  │
  │  POST /api/execute { delegation, permissionContext }
  │    1. relayer_getFeeData → get minFee (not hardcoded)
  │    2. relayer_getCapabilities → get live feeCollector + targetAddress
  │    3. relayer_estimate7710Transaction → get context blob + requiredPaymentAmount
  │    4. If fee differs → rebuild executions with correct fee → re-estimate
  │    5. relayer_send7710Transaction { context blob } → get taskId
  │    6. Poll relayer_getStatus every 3s
  │
  ▼
1Shot Public Relayer — Base Sepolia
  │  Redeems delegation on-chain via DelegationManager
  ├── verifies FunctionCall + erc20PeriodTransfer caveats on-chain
  ├── 0.01 USDC → 1Shot fee collector
  ├── 0.05 USDC → Researcher wallet (0x6eB5...)
  ├── 0.03 USDC → Validator wallet  (0x6eB5...)
  └── 0.05 USDC → Writer wallet     (0x7cB1...)
  │
  ▼
BaseScan transaction link shown in dashboard
```

---

## MetaMask Hybrid Smart Accounts

**Implementation:** `Implementation.Hybrid` (NOT Stateless7702)

### Why Hybrid, not Stateless7702
- MetaMask Flask throws "internal account" error with Stateless7702 for user-facing delegation
- Hybrid uses SimpleFactory (CREATE2) to deploy a counterfactual contract on-chain
- SA address ≠ EOA — it's a deterministic contract address derived from EOA
- The SA must be **deployed on-chain** before 1Shot can verify delegation signatures

### Flow
1. Frontend reads user's EOA from MetaMask Flask
2. Calls `toMetaMaskSmartAccount(walletClient, { implementation: Implementation.Hybrid })` from `@metamask/smart-accounts-kit`
3. Checks if SA is deployed: `eth_getCode(saAddress)` — if empty, shows "Deploy Smart Account" button
4. Deploy: sends a regular `eth_sendTransaction` to SimpleFactory — MetaMask shows normal tx popup
5. SA address shown in Delegation tab — user sends USDC here (not to EOA)

### Agent Hybrid SAs
- Each agent EOA also has a Hybrid SA derived from it
- Agent SAs are used for x402 payments — must be funded with USDC
- Get agent SA addresses: `GET /api/agent-smartaccounts`
- `deploySalt: '0x'` throughout

### Key File
`app/lib/smartAccount.ts` — `getSmartAccount()`, `deploySA()`, `getHybridAddress()`

---

## ERC-7710 Delegation

### Delegation Structure
The user's Hybrid SA signs one off-chain EIP-712 delegation granting the 1Shot relayer target address authority to spend USDC on its behalf.

**4 caveats total:**

| Caveat | Scope Type | Enforces |
|---|---|---|
| AllowedTargets | FunctionCall | Only USDC contract can be called |
| AllowedCalldata | FunctionCall | Only `transfer(address,uint256)` selector |
| NativeTokenAmount | FunctionCall | ETH value = 0 |
| Erc20PeriodTransfer | Explicit | Total USDC spend ≤ budget within 24h window |

**Scope type choice: `ScopeType.FunctionCall` (not `Erc20TransferAmount`)**
- We use FunctionCall scope because Erc20TransferAmount causes `CaveatEnforcer:invalid-call-type` errors with batched executions (multiple transfers in one tx)
- FunctionCall scope with AllowedTargets + AllowedCalldata + NativeTokenAmount works correctly

### Delegation Signing Flow
1. Frontend calls `GET /api/relayer-caps` → gets live `targetAddress` and `feeCollector` from 1Shot
2. Builds delegation: `createDelegation({ from: userSA, to: targetAddress, scope, caveats })`
3. Signs with `signDelegation(delegation, walletClient)` → EIP-712 popup in MetaMask
4. Stores signed delegation in React state
5. Sends it to `/api/execute` when user clicks "Pay Agents On-Chain"

### Key Files
`app/lib/delegation.ts` — `buildDelegation()`, `signDelegation()`  
`src/server.js` — `/api/relayer-caps` route

---

## 1Shot Integration

**Relayer URL:** `https://relayer.1shotapi.dev/relayers` (public, no API key required)  
**Chain:** Base Sepolia (84532)

### 6-Step Flow (src/oneshot.js)

```javascript
// 1. Get live fee estimate (added — not hardcoded)
const feeData = await getFeeData(USDC_ADDRESS)
feeAmount = BigInt(feeData.minFee)  // not hardcoded 0.01 USDC

// 2. Get live target address + fee collector
const caps = await getCapabilities()
// caps.targetAddress — who gets the delegation
// caps.feeCollector  — who gets the relay fee

// 3. Build executions
executions = [
  transfer(feeCollector, feeAmount),           // relay fee (first)
  transfer(researcherWallet, 50_000n),          // 0.05 USDC
  transfer(validatorWallet,  30_000n),          // 0.03 USDC
  transfer(writerWallet,     50_000n),          // 0.05 USDC
]

// 4. Estimate — get context blob (REQUIRED for send)
const est = await estimate7710Transaction({
  chainId: "84532",
  transactions: [{ permissionContext: [signedDelegation], executions }]
})
// est.context — MUST be forwarded to send

// 5. If fee changed, rebuild executions with est.requiredPaymentAmount → re-estimate

// 6. Send with context blob
const taskId = await send7710Transaction({ ...params, context: est.context })

// 7. Poll every 3s
const status = await getStatus(taskId)
// 100=Queued, 110=Submitted, 200=Confirmed, 400=Rejected, 500=Reverted
```

### Critical: Context Blob
The `context` returned by `estimate7710Transaction` **must** be forwarded to `send7710Transaction`. This was the missing piece that caused rejections — the relayer locks the fee quote in the context blob.

### Key File
`src/oneshot.js` — `getFeeData()`, `getCapabilities()`, `estimate7710Transaction()`, `send7710Transaction()`, `getTaskStatus()`

---

## x402 Micropayments (Agent → Venice AI)

**Status:** REAL (`X402_ENABLED=true`) — not cosmetic  
**Facilitator:** `https://tx-sentinel-base-sepolia.dev-api.cx.metamask.io/platform/v2/x402`

Every agent call to the Venice AI proxy triggers a real USDC micropayment from the agent's Hybrid smart account.

### Prices
| Route | Price |
|---|---|
| `POST /api/venice/chat` | $0.001 USDC per call |
| `POST /api/venice/search` | $0.0005 USDC per call |

### How It Works
1. Agent calls Venice via internal proxy `POST /api/venice/chat` or `/api/venice/search`
2. x402 middleware intercepts and responds `HTTP 402 Payment Required`
3. Agent's x402 client uses agent's Hybrid SA to pay via `handleX402Payment()`
4. On successful payment, request retries and returns Venice response
5. Treasury (orchestrator address) receives the USDC

### Key Files
`src/x402-server.js` — middleware, priceTable  
`src/x402-client.js` — `createX402FetchForAgent()`, handles 402 retry  
`src/agents/base-agent.js` — `callAPI()` uses x402-aware fetch

---

## Agent Marketplace (8 Registered Services)

The orchestrator discovers agents from the ServiceRegistry, runs a price auction, and selects the cheapest.

### All 8 Agents

| Agent | Price | Category | Type |
|---|---|---|---|
| GekkoSourcer | $0.04 | Research | Virtual (shares researcher wallet) |
| GekkoResearcher | $0.05 | Research | Core worker |
| GekkoForecaster | $0.09 | Research | Virtual (shares orchestrator wallet) |
| GekkoAnalyst | $0.08 | Research + Investment | Virtual (shares writer wallet) |
| GekkoValidator | $0.03 | Validation | Core worker |
| GekkoDebater | $0.045 | Validation | Virtual (shares researcher wallet) |
| GekkoSummarizer | $0.025 | Writing | Virtual (shares writer wallet) |
| GekkoWriter | $0.05 | Writing | Core worker |

### Virtual Agent Pattern
Virtual agents (Sourcer, Forecaster, Debater, Summarizer, Analyst) share wallets with core agents. They register as separate services so the marketplace shows real price competition. In `_findAgent()`, if a virtual agent wins the auction, wallet-address matching routes execution to the actual core agent worker with the same wallet — no separate execution infrastructure needed.

**Result:** Judges see 8 agents competing on price in the Live Feed. Execution routes correctly to the 3 core workers.

### Price Auction Flow
```
Orchestrator needs "research" capability
  → registry.find('research') → 4 candidates
  → sort by price ascending
  → emit marketplace_bids event (all candidates + prices)
  → emit agent_discovered event (winner = GekkoSourcer $0.04)
  → execute task via GekkoResearcher (same wallet as Sourcer)
```

### Live Feed Output
```
[AUCTION] 4 agents bid for "research":
  GekkoSourcer     $0.04  ← WINNER (emerald)
  GekkoResearcher  $0.05  (struck through)
  GekkoAnalyst     $0.08  (struck through)
  GekkoForecaster  $0.09  (struck through)
```

### Key Files
`src/registry.js` — `ServiceRegistry`, `register()`, `find()`  
`src/config.js` — `AGENTS` (3 core) + `ADDITIONAL_SERVICES` (5 virtual)  
`src/agents/orchestrator.js` — `_findAgent()`, `marketplace_bids` event

---

## Venice AI Models

| Agent | Model | Purpose |
|---|---|---|
| ResearchAgent | `llama-3.3-70b` | Web search + data gathering |
| ValidatorAgent | `deepseek-v3.2` | Fact-checking + reasoning |
| WriterAgent | `mistral-small-2603` | Report writing + JSON output |

**Do NOT use:** `venice-reasoning-preview`, `mistral-31-24b` (both 404)

### Investment Mode Prompt Changes
- **ResearchAgent:** Prefixes query with `"DeFi yield opportunities APY protocol comparison risk: "` when `mode === 'investment'`
- **WriterAgent:** Swaps to `INVESTMENT_SYSTEM_PROMPT` requiring JSON-only output with the opportunity schema

### Key Files
`src/agents/research-agent.js` — `research(query, mode)`  
`src/agents/writer-agent.js` — `synthesize(findings, format, mode)`, `INVESTMENT_SYSTEM_PROMPT`  
`src/agents/validator-agent.js` — `validate(findings)`  
`src/venice.js` — `VeniceClient`, `VENICE_MODELS`

---

## Backend (Express, Node.js)

### All API Endpoints

| Method | Endpoint | What It Does |
|---|---|---|
| POST | `/api/goal` | Submit goal + mode → runs full pipeline |
| POST | `/api/execute` | Run estimate→send 1Shot flow, returns taskId |
| GET | `/api/task-status?id=` | Poll 1Shot for on-chain confirmation |
| GET | `/api/relayer-caps` | Live targetAddress + feeCollector for delegation signing |
| GET | `/api/agent-smartaccounts` | Hybrid SA addresses for x402 USDC funding |
| GET | `/api/health` | System status |
| GET | `/api/balances` | USDC balances for all agent wallets |
| GET | `/api/registry` | All 8 registered services |
| GET | `/api/escrows` | In-memory escrow sessions |
| GET | `/api/transactions` | On-chain USDC Transfer events |
| GET | `/api/events/stream` | SSE real-time stream of all agent actions |
| GET | `/api/reasoning` | Agent decision log with full reasoning context |
| GET | `/api/agents` | Agent names, roles, EOA wallet addresses |
| POST | `/api/venice/chat` | x402-gated Venice chat proxy |
| POST | `/api/venice/search` | x402-gated Venice search proxy |

### Key Files
`src/server.js` — all routes, SSE stream, agent initialization  
`src/agents/orchestrator.js` — `executeGoal()`, `_findAgent()`, `_executeWork()`  
`src/registry.js` — `ServiceRegistry`  
`src/escrow.js` — `EscrowManager`  
`src/event-bus.js` — `dispatchEvents` (Node.js EventEmitter)

---

## SSE Real-Time Event System

Frontend subscribes to `GET /api/events/stream`. Every agent action emits a named event.

### Event Names (stepper/UI depends on these — do not rename)

| Event | Emitted By | When |
|---|---|---|
| `balance_verified` | Orchestrator | After checking USDC balance |
| `subtasks_planned` | Orchestrator | After decomposing goal into subtasks |
| `marketplace_bids` | Orchestrator | Before each agent_discovered (shows all bidders) |
| `agent_discovered` | Orchestrator | After selecting winning agent |
| `escrow_created` | Orchestrator | When task payment is locked |
| `research_started` | ResearchAgent | At start of Venice search |
| `venice_search_completed` | ResearchAgent | After Venice search returns |
| `research_completed` | ResearchAgent | After full research phase done |
| `validation_completed` | ValidatorAgent | After fact-check complete |
| `escrow_released` | Orchestrator | When work is verified, payment released |
| `synthesis_completed` | WriterAgent | After report/JSON is written |
| `goal_completed` | Orchestrator | Final event; includes full results |

---

## Frontend (Next.js 16)

**Built:** Static export (`next build`), served by Express from `/out`  
**Dev:** `npm run dev` (port 3000) + `npm run dev:server` (port 3001)  
**Main file:** `app/page.tsx`

### State Machine
```typescript
// Key state variables
mode: 'research' | 'investment'         // mode toggle
phase: 'idle' | 'running' | 'complete'  // mission phase
events: AgentEvent[]                    // SSE events for Live Feed
report: string                          // raw output (markdown or JSON string)
investmentData: object | null           // parsed JSON from investment mode
permissionContext: string | null        // signed delegation from MetaMask
taskId: string | null                   // 1Shot task ID after execute
txHash: string | null                   // BaseScan tx hash after confirmation
```

### UI Layout
```
┌─ Header ──────────────────────────────────────────────────┐
│  Logo  Gekko  [chain badge]  [Deploy SA button]  [wallet] │
└───────────────────────────────────────────────────────────┘
┌─ Left Panel (agent roster) ─┬─ Right Panel (main) ────────┐
│  GekkoOrchestrator   [ring] │  [mode toggle R/I]          │
│  GekkoResearcher     [ring] │  [goal textarea]            │
│  GekkoValidator      [ring] │  [budget slider]            │
│  GekkoWriter         [ring] │  [Launch Mission button]    │
│                             │                             │
│  All 8 marketplace agents   │  ┌─ Tabs ────────────────┐ │
│  with prices                │  │ Report | Marketplace  │ │
│                             │  │ Delegation | Escrow   │ │
│  Status pips:               │  │ Transactions          │ │
│  amber = running            │  │ Reasoning | Live Feed │ │
│  emerald = done             │  └───────────────────────┘ │
│  grey = idle                │                             │
└─────────────────────────────┴─────────────────────────────┘
```

### Key UI Features

**Mode Toggle (above textarea):**  
Research (default) | Investment Analysis (amber theme when selected)

**Pipeline Stepper (in Live Feed):**  
6 steps — done=emerald, active=amber, error=red  
Steps: Balance Check → Marketplace Auction → Research → Validation → Writing → Payment

**Live Feed — marketplace_bids events:**  
Rendered as amber auction cards showing all competing agents with prices, winner highlighted in emerald, losers struck through

**Left Panel — Agent Roster:**  
Circular avatars (w-8 h-8 rounded-full) with color-coded status rings (amber pip when active, emerald when done)

**Marketplace Tab:**  
8 agents grouped into categories (Research, Validation, Writing, Investment). Core agents highlighted. Shows price and capabilities.

**Delegation Tab — Chain Tree:**  
4-layer visualization:  
USER EOA → Hybrid SA (with caveat details) → 1Shot Target → Payment Targets grid  
Shows amounts, enforcer types, BaseScan link when confirmed

**Report Tab:**  
- Research mode: standard markdown renderer
- Investment mode: rendered opportunity cards with risk badges (green/amber/red), APY, allocation %, risk score bar

**Investment JSON Parsing (`tryParseInvestmentJson`):**  
Handles 3 cases: direct JSON.parse → markdown fence extraction → first `{` to last `}` extraction

### Key Files
`app/page.tsx` — entire frontend (~900 lines)  
`app/lib/smartAccount.ts` — Hybrid SA deployment + address derivation  
`app/lib/delegation.ts` — delegation building + signing

---

## Agent Wallets (Base Sepolia EOA)

| Role | EOA Address |
|---|---|
| Orchestrator | `0xF9bc59882a7d6D2Dd24ff3800F69CC459bDDCC62` |
| Researcher + Validator (shared) | `0x6eB5e2011964a3D7Cf371aAbBD49545C70A7052c` |
| Writer | `0x7cB1966270d9D257AD1EEE4bEb142622A9937494` |

Agent Hybrid SA addresses differ from EOA — get from `GET /api/agent-smartaccounts` (used for x402 USDC funding).

---

## Contract Addresses (Base Sepolia)

| Contract | Address |
|---|---|
| USDC | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| 1Shot Relayer Target | `0xf1ef956eff4181Ce913b664713515996858B9Ca9` (fallback; fetched live) |
| 1Shot Fee Collector | `0xE936e8FAf4A5655469182A49a505055B71C17604` (fallback; fetched live) |
| DelegationManager | Resolved by `getSmartAccountsEnvironment(84532)` from `@metamask/smart-accounts-kit` |

---

## Payment Amounts (per mission)

| Recipient | Amount | Purpose |
|---|---|---|
| 1Shot fee collector | 0.01 USDC (dynamic via getFeeData) | Relay fee |
| GekkoResearcher | 0.05 USDC | Research task |
| GekkoValidator | 0.03 USDC | Validation task |
| GekkoWriter | 0.05 USDC | Writing task |
| **Total** | **0.14 USDC** | Per mission |

---

## Environment Variables

```bash
# Agent wallets (Base Sepolia)
ORCHESTRATOR_PRIVATE_KEY=0x...
ORCHESTRATOR_ADDRESS=0xF9bc59...
RESEARCHER_PRIVATE_KEY=0x...
RESEARCHER_ADDRESS=0x6eB5e2...
WRITER_PRIVATE_KEY=0x...
WRITER_ADDRESS=0x7cB1966...

# Venice AI
VENICE_API_KEY=...

# Network
CHAIN_ID=84532
RPC_URL=https://sepolia.base.org
USDC_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e

# x402
X402_ENABLED=true
X402_FACILITATOR_URL=https://tx-sentinel-base-sepolia.dev-api.cx.metamask.io/platform/v2/x402
```

---

## How to Run

```bash
cd gekko
npm install
npm run build           # build Next.js static export
npm start               # Express on :3001 (serves frontend + all API)
```

Hot-reload development:
```bash
npm run dev             # Next.js on :3000
npm run dev:server      # Express on :3001
```

---

## What Makes Gekko Unique (vs other submissions)

1. **Real x402 HTTP 402 enforcement** — agents actually pay Venice per call from Hybrid SAs. Most submissions fake this.
2. **Live marketplace price auction** — 8 agents bid in real-time, cheapest wins, shown in the Live Feed with amber auction cards. Creates a real A2A marketplace.
3. **Dual payment layer** — user pays agents AND agents pay Venice, both on-chain, both in USDC, different mechanisms (1Shot delegation vs x402).
4. **Actual research pipeline delivering content** — agents produce genuinely useful research reports or investment analyses, not just move money around.
5. **SSE real-time feed with reasoning** — every agent decision, bid, and reasoning step streams live to the browser. Full transparency.
6. **Two output modes** — research markdown + investment structured JSON allocation recommendations.
7. **MetaMask Hybrid SA** — proper on-chain smart account deployment via SimpleFactory, correct Hybrid implementation (not Stateless7702 which fails with Flask).
8. **6-step 1Shot flow with getFeeData** — includes the `relayer_getFeeData` call for accurate initial fee and mandatory context blob forwarding.

---

## Project File Map

```
gekko/
├── src/                          # Express backend
│   ├── server.js                 # All routes, SSE stream, init
│   ├── config.js                 # AGENTS, ADDITIONAL_SERVICES, X402, ONESHOT
│   ├── oneshot.js                # 1Shot JSON-RPC client (getFeeData, estimate, send)
│   ├── venice.js                 # VeniceClient, VENICE_MODELS
│   ├── wallet.js                 # AgentWallet (ethers v6, USDC balance)
│   ├── registry.js               # ServiceRegistry (8 agents)
│   ├── escrow.js                 # EscrowManager (in-memory payment tracking)
│   ├── event-bus.js              # Node.js EventEmitter (SSE backbone)
│   ├── delegation.js             # ERC-7710 delegation building
│   ├── permissions.js            # ERC-7715 permission helpers
│   ├── x402-server.js            # x402 middleware (HTTP 402 enforcement)
│   ├── x402-client.js            # x402 fetch wrapper (402 retry logic)
│   └── agents/
│       ├── base-agent.js         # BaseAgent (callAPI, log, x402 fetch)
│       ├── orchestrator.js       # executeGoal, _findAgent, marketplace_bids
│       ├── research-agent.js     # research(query, mode), Venice search
│       ├── validator-agent.js    # validate(findings), Venice reasoning
│       └── writer-agent.js       # synthesize(findings, format, mode), JSON output
├── app/                          # Next.js 16 frontend
│   ├── page.tsx                  # Entire UI (~900 lines)
│   └── lib/
│       ├── smartAccount.ts       # Hybrid SA deploy + address derivation
│       └── delegation.ts         # Delegation build + EIP-712 sign
├── public/                       # Static fallback
├── out/                          # Next.js build output (gitignored)
├── package.json                  # Next.js + Express + ethers + @metamask/smart-accounts-kit
├── next.config.js                # Static export config
├── tailwind.config.js
├── README.md                     # Full end-user docs + funding guide
├── context.md                    # Technical context for AI assistants
├── overview.md                   # This file
└── red.md                        # Full analysis of Redelegator Finance project
```

---

## Verified Working (as of last build)

- `GET /api/registry` → returns all 8 agents
- `POST /api/goal` with `mode: 'research'` → 3 `marketplace_bids` events fire, pipeline completes
- `POST /api/goal` with `mode: 'investment'` → returns parseable JSON with `opportunities`, `riskScore`, `recommendation`
- `npm run build` → `Compiled successfully in ~9s`
- Investment JSON parsing handles Venice markdown fences correctly via `tryParseInvestmentJson()`
- x402 payments flow when agent Hybrid SAs have USDC balance
