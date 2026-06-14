# Gekko — Project Context

> This file is the single source of truth for AI sessions working on this codebase.
> Read this before making any changes.

---

## What Gekko Is

Gekko is an **autonomous agent-to-agent payment marketplace** built for the MetaMask Smart Accounts × 1Shot API × Venice AI hackathon. A user submits a research goal; four AI agents coordinate, pay each other in USDC, and deliver a full research report — all without human intervention.

**Dual payment layers:**
- **Backend (Base Sepolia)**: Agent-to-agent payments via `ethers.js` direct USDC transfers. Simulates gracefully if wallets are unfunded.
- **Frontend (Base mainnet)**: User → Agent payments via ERC-7710 delegation + 1Shot permissionless relayer. Gasless for the user (no ETH needed).

**Stack**: Venice AI (private LLM inference) · x402 micropayment protocol (disabled in demo) · MetaMask Hybrid Smart Accounts · ERC-7710 delegation · 1Shot permissionless relayer · ethers v6 · Base Sepolia + Base mainnet

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
│   ├── page.tsx              # Dashboard — MetaMask connect, delegation signing, on-chain payment
│   ├── lib/
│   │   └── smartAccount.ts   # Browser-side MetaMask delegation signing for 1Shot
│   ├── layout.tsx            # Root layout, fonts, metadata
│   └── globals.css           # Tailwind + keyframes + scrollbar
│
├── src/
│   ├── config.js             # All env vars, agent configs, rate limits, budget caps
│   ├── server.js             # Express — all API routes, SSE stream, x402-gated Venice proxy
│   │                           Also: POST /api/execute, GET /api/task-status (1Shot)
│   ├── venice.js             # Venice AI client — OpenAI-compatible chat/search
│   ├── oneshot.js            # 1Shot JSON-RPC client — REAL implementation (not stub)
│   ├── wallet.js             # AgentWallet — USDC balance (ethers), direct transfer
│   ├── x402-client.js        # Per-agent x402 fetch wrapper
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
         c. agent.execute(task) — calls Venice AI
         d. orchestrator.pay() — direct USDC transfer via ethers (simulated if unfunded)
      4. validator.validate() — fact-check via Venice deepseek-v3.2
      5. writer.synthesize() — full report via Venice mistral-small-2603
      6. Return { success, report, audit }
```

### ERC-7710 on-chain payment flow (frontend-initiated):

```
User connects MetaMask
  → switchToBase() — MetaMask switches to Base mainnet (chainId 0x2105 = 8453)
  → createBaseSmartAccount() — toMetaMaskSmartAccount (Hybrid, deterministic from EOA)
  → createDelegation() — ERC-7710 delegation to 1Shot target (0x26a529...)
      scope: { type: ScopeType.Erc20TransferAmount, tokenAddress: USDC_BASE, maxAmount }
  → smartAccount.signDelegation() — MetaMask EIP-712 popup
  → signedDelegation stored in frontend state

After mission completes:
  User clicks "Pay Agents On-Chain"
  → POST /api/execute { signedDelegation, recipients? }
    → buildAgentPaymentExecutions() — [feeExecution, ...agentPayments]
    → send7710Transaction(signedDelegation, executions) — 1Shot JSON-RPC
      POST https://relayer.1shotapi.com/relayers
        method: relayer_send7710Transaction
        header: x-api-key: <ONESHOT_API_KEY>
    → returns taskId immediately (non-blocking)
  → frontend polls GET /api/task-status?id=<taskId> every 3s
  → on confirmed: shows https://basescan.org/tx/<txHash>
```

### Real-time events (SSE):
```
Any agent action → event-bus.js → server.js rolling buffer (max 500)
  → GET /api/events/stream → page.tsx updates timeline, stepper, live feed
```

---

## 1Shot Integration Details (`src/oneshot.js`)

- **Relayer endpoint**: `https://relayer.1shotapi.com/relayers`
- **Auth**: `x-api-key: <ONESHOT_API_KEY>` header (required — without it, relayer has `chains: []`)
- **Fee target**: `0x26a529124f0bbf9af9d8f9f84a43efe47cf1199a` (delegate + fee recipient)
- **Fee amount**: `BigInt(10_000)` = 0.01 USDC (must be FIRST execution in every batch)
- **Chain**: Base mainnet only (chainId 8453)
- **USDC on Base mainnet**: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- **JSON-RPC methods used**: `relayer_send7710Transaction`, `relayer_getStatus`
- **Task status polling**: every 2500ms, up to 60s

The API key changes routing at the relayer level. Without it, the public relayer instance has no chain configuration and fails with "No valid payments to feeAddress". With it, requests route to the configured 1Shot backend.

---

## Frontend Delegation Signing (`app/lib/smartAccount.ts`)

Uses `@metamask/smart-accounts-kit` (same package as `@metamask/delegation-toolkit@0.13.0` — just renamed).

**Key facts:**
- Does NOT pass `parentDelegation: ROOT_AUTHORITY` to `createDelegation` — smart-accounts-kit rejects it if passed explicitly. Root authority is applied automatically.
- Reads `authority` back from the returned delegation object: `unsignedDelegation.authority ?? ROOT_AUTHORITY`
- Smart account address is deterministic: `toMetaMaskSmartAccount({ implementation: Implementation.Hybrid, deployParams: [ownerEOA, [], [], []], deploySalt: '0x' })`
- Signs on Base mainnet (chain 8453) — must switch MetaMask before signing

**Exported functions:**
- `signDelegationForOneShot(provider, ownerAddress, maxAmountUsdc)` → `DelegationRecord`
- `getSmartAccountAddress(ownerAddress)` → smart account address string

---

## Agent Details

| Agent | Address (Base Sepolia) | Role |
|-------|----------------------|------|
| Orchestrator | `0xF9bc59882a7d6D2Dd24ff3800F69CC459bDDCC62` | Coordinator + payer |
| Researcher | `0x6eB5e2011964a3D7Cf371aAbBD49545C70A7052c` | Venice web search |
| Validator | `0x6eB5e2011964a3D7Cf371aAbBD49545C70A7052c` | Same key as Researcher |
| Writer | `0x7cB1966270d9D257AD1EEE4bEb142622A9937494` | Report synthesis |

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
| POST | `/api/execute` | Submit signed delegation to 1Shot, returns taskId |
| GET | `/api/task-status?id=` | Poll 1Shot for on-chain tx status |
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

## Frontend Architecture (`app/page.tsx`)

**3-panel layout** + **tabbed bottom panel**. Single React component.

Key state related to on-chain payments:
| State | Purpose |
|-------|---------|
| `userAddress` | MetaMask EOA (eth_requestAccounts) |
| `smartAccountAddress` | Derived from EOA via getSmartAccountAddress() |
| `signedDelegation` | DelegationRecord after MetaMask EIP-712 signing |
| `signingDelegation` | Loading state during MetaMask signing |
| `onChainPayment` | State machine: `idle → executing → polling → confirmed/failed` |
| `taskId` | 1Shot task ID for polling |

**Button flow**: Connect Wallet → Sign Delegation → [delegation active] → (after mission) Pay Agents On-Chain → polling → confirmed (BaseScan link shown)

---

## Environment Variables (`.env`)

```bash
# Network (Base Sepolia — for agent-to-agent payments)
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

# 1Shot Relayer (Base mainnet — for user→agent payments)
ONESHOT_API_KEY="eI/yP+7EMizuNvA1VJGxcEXcY9rs7b6a"
ONESHOT_BASE_URL=https://1shot.io
ONESHOT_WEBHOOK_SECRET=d83ac95a...

# Venice AI
VENICE_API_KEY=VENICE_INFERENCE_KEY_4iEly-...

# x402 micropayments (disabled in demo: X402_ENABLED=false)
X402_ENDPOINT_BASE=http://localhost:3001
X402_TREASURY_ADDRESS=0xF9bc59882a7d6D2Dd24ff3800F69CC459bDDCC62

# User root wallet (MetaMask EOA — signs delegation)
USER_WALLET_ADDRESS=0xdc6cBB97A02ab92E7571C126300f7df274B538Fd

PORT=3001
DISPATCH_API_KEY=   # blank = no auth required on /api/goal
```

---

## What's Done

- [x] Venice AI integration for LLM inference (3 models, confirmed working)
- [x] Agent pipeline: research → validate → write → report (SSE real-time)
- [x] x402 micropayment middleware (disabled in demo via X402_ENABLED=false)
- [x] Real 1Shot JSON-RPC client in `src/oneshot.js` (replaces old stub)
- [x] MetaMask delegation signing in `app/lib/smartAccount.ts`
  - Chain switching to Base mainnet
  - Hybrid Smart Account creation (counterfactual, deterministic)
  - ERC-7710 delegation to 1Shot target with ERC-20 caveat
  - EIP-712 signing via MetaMask popup
- [x] `POST /api/execute` in Express — submits delegation to 1Shot, non-blocking
- [x] `GET /api/task-status` in Express — polls 1Shot for tx confirmation
- [x] Frontend payment state machine (idle → executing → polling → confirmed)
- [x] BaseScan tx link displayed on confirmation
- [x] `ONESHOT_API_KEY` sent as `x-api-key` header on all 1Shot requests
- [x] Next.js static export with TypeScript error bypass (`ignoreBuildErrors: true`)
- [x] `@metamask/delegation-toolkit` installed (confirmed = same package as smart-accounts-kit, just renamed)

---

## What's Left (Requires Funding)

The entire on-chain payment flow is implemented and structurally correct. The only blocker is the user's MetaMask Hybrid Smart Account needs USDC on Base mainnet.

### Step 1 — Get your MetaMask smart account address
Connect MetaMask to the Gekko dashboard. The UI shows your smart account address under the delegation panel. It is deterministic — derived from your MetaMask EOA using:
```
toMetaMaskSmartAccount({ implementation: Implementation.Hybrid, deployParams: [EOA, [], [], []], deploySalt: '0x' })
```

### Step 2 — Fund the smart account with USDC on Base mainnet
Send at least **0.14 USDC** to your smart account address on Base mainnet:
- 0.01 USDC = 1Shot relayer fee (first execution)
- 0.05 USDC = Researcher payment
- 0.03 USDC = Validator payment
- 0.05 USDC = Writer payment

USDC on Base mainnet: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`

You can bridge USDC from other chains using: https://bridge.base.org

### Step 3 — Test the full flow
1. `npm start` + `npm run dev`
2. Open http://localhost:3000
3. Click "Connect Wallet" → approve in MetaMask
4. Click "Sign Delegation" → MetaMask switches to Base mainnet → approve EIP-712 signing
5. Run a mission (enter goal → Launch Mission)
6. After mission completes, click "Pay Agents On-Chain"
7. Server submits to 1Shot → tx confirms on Base mainnet → BaseScan link appears

---

## Known Issues / Notes

- **1Shot relayer without API key**: `relayer.1shotapi.com/health` shows `"chains": []`. The permissionless relayer instance is unconfigured. Without `x-api-key` header, all requests fail with "No valid payments to feeAddress" — misleading error that's actually a missing chain config issue.
- **1Shot relayer WITH API key**: Routes to configured 1Shot backend. Returns "Bad Request" for invalid/fake delegations. With a real signed delegation from a funded smart account, this should succeed.
- **`@metamask/delegation-toolkit@0.13.0`** is a renamed alias of `@metamask/smart-accounts-kit` — same code. Both installed in node_modules.
- **Validator shares wallet with Researcher** — same private key, same address. Intentional (cost efficiency). Escrow skipped between them automatically.
- **Agent-to-agent payments (backend, Base Sepolia)**: via ethers.js sendTransaction. Falls back to `status:'simulated'` if wallets are unfunded.
- **x402 is ENABLED**: `X402_ENABLED=true` in `.env`. Server middleware (`src/x402-server.js`) uses `@x402/express` + `x402ExactEvmErc7710ServerScheme` on both Venice proxy routes — real payment required per call. Client wrapper (`src/x402-client.js`) gives each agent a `wrapFetchWithPayment` fetch that handles 402 → pay (ERC-7710 delegation) → retry automatically via MetaMask facilitator on Base Sepolia. Prices: $0.001/chat, $0.0005/search. Requires agent smart accounts funded with USDC on Base Sepolia. Set `X402_ENABLED=false` to revert to pass-through demo mode.
- **Next.js static export**: `output: "export"` in next.config.ts. All API routes must be in `src/server.js` (Express), not `app/api/`.

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
