# Gekko

Autonomous AI agent marketplace with on-chain USDC payments on Base Sepolia.

Built for the **MetaMask Smart Accounts × 1Shot API × Venice AI** hackathon.

---

## What It Does

You submit a research goal. Four autonomous AI agents coordinate: the orchestrator plans, the researcher finds information, the validator fact-checks it, and the writer synthesizes a full report. Every agent gets paid in USDC — no human in the loop after you hit Launch.

**Two payment layers run in parallel:**

| Layer | Chain | How |
|-------|-------|-----|
| User → Agents | Base Sepolia | ERC-7710 FunctionCall + erc20PeriodTransfer delegation via MetaMask Hybrid SA + 1Shot public relayer |
| Agent → Venice AI | Base Sepolia | x402 HTTP 402 micropayments via ERC-7710 delegation from agent Hybrid smart accounts |

---

## Architecture

```
User (MetaMask Flask on Base Sepolia)
  │
  │  1. Deploy Hybrid Smart Account via SimpleFactory (~0.00005 ETH gas, one-time)
  │     SA address ≠ EOA — derived deterministically from EOA via CREATE2
  │  2. Sign ERC-7710 delegation (FunctionCall + erc20PeriodTransfer — 4 caveats)
  │     Delegation target fetched live from relayer_getCapabilities
  │
  ▼
Gekko Dashboard (Next.js)
  │
  │  POST /api/goal → mission starts
  │
  ▼
Orchestrator Agent (Express / Node.js)
  ├── Research Agent  ← Venice AI (llama-3.3-70b + web search)  [pays via x402]
  ├── Validator Agent ← Venice AI (deepseek-v3.2 reasoning)       [pays via x402]
  └── Writer Agent    ← Venice AI (mistral-small-2603)             [pays via x402]
  │
  │  mission complete
  │
  ▼
User clicks "Pay Agents On-Chain"
  │
  │  POST /api/execute (signed delegation)
  │    → relayer_getCapabilities  (live fee collector + target)
  │    → relayer_estimate7710Transaction  (gets context blob + required fee)
  │    → relayer_send7710Transaction  (context blob required by relayer)
  │
  ▼
1Shot Public Relayer — Base Sepolia (https://relayer.1shotapi.dev/relayers)
  ├── verifies FunctionCall + erc20PeriodTransfer caveats on-chain
  ├── 0.01 USDC → 1Shot fee collector
  ├── 0.05 USDC → Researcher wallet
  ├── 0.03 USDC → Validator wallet
  └── 0.05 USDC → Writer wallet
  │
  ▼
Sepolia BaseScan tx link displayed in dashboard
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (static export), React, Tailwind CSS, Framer Motion |
| Backend | Node.js, Express |
| AI Inference | Venice AI (private, censorship-resistant) |
| Smart Accounts (user) | MetaMask **Hybrid** via `@metamask/smart-accounts-kit` (deployed via SimpleFactory) |
| Smart Accounts (agents) | MetaMask **Hybrid** via `@metamask/smart-accounts-kit` |
| On-chain payments | ERC-7710 `FunctionCall` + `erc20PeriodTransfer` delegation + 1Shot public relayer |
| Agent micropayments | x402 protocol (real HTTP 402 enforcement — agent pays per Venice call) |
| Agent-to-agent payments | ethers v6 direct USDC transfers |
| Testnet | Base Sepolia (chain 84532) — all payments |
| USDC (Base Sepolia) | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |

---

## Delegation Design

The ERC-7710 delegation uses **two complementary caveats** (matching Ruleo reference implementation):

| Caveat | Type | Enforces |
|--------|------|----------|
| AllowedTargets | FunctionCall scope | Only the USDC contract can be called |
| AllowedCalldata | FunctionCall scope | Only `transfer(address,uint256)` selector |
| NativeTokenAmount | FunctionCall scope | Native ETH value = 0 |
| Erc20PeriodTransfer | Explicit caveat | Total USDC spend ≤ budget in 24h window |

The spending limit caveat is on-chain enforcement — the DelegationManager checks it before executing any transfer. The 24h window starts from delegation signing time; re-signing creates a fresh period.

---

## How It Works End-to-End

1. **Connect MetaMask Flask** — Dashboard reads your EOA and derives your Hybrid SA address (different from EOA). Checks if SA is deployed via `eth_getCode`.
2. **Deploy Smart Account** (one-time, if shown) — Click the amber "Deploy Smart Account" button. MetaMask shows a normal send-transaction popup. ~0.00005 ETH gas.
3. **Fund the SA** — Get USDC at [faucet.circle.com](https://faucet.circle.com) (Base Sepolia). Send ≥0.14 USDC to your SA address (shown in the Delegation tab).
4. **Sign Delegation** — Click "Sign Delegation". Dashboard fetches live `targetAddress` from 1Shot relayer, builds delegation with FunctionCall + erc20PeriodTransfer caveats, MetaMask shows one EIP-712 popup.
5. **Run Mission** — Enter goal, set budget, click Launch. Agents research, validate, and write in parallel. Each Venice AI call is paid via x402 from the agent Hybrid smart accounts.
6. **Pay Agents On-Chain** — Click once. Server:
   - Fetches live fee collector from `relayer_getCapabilities`
   - Calls `relayer_estimate7710Transaction` to get the context blob
   - Adjusts fee if relayer requires different amount
   - Calls `relayer_send7710Transaction` with context blob + memo
7. **Confirm** — Dashboard polls every 3 seconds. When status = 200, shows the Sepolia BaseScan transaction link.

---

## Running Locally

### Prerequisites

- Node.js 18+
- MetaMask Flask browser extension (required for Hybrid SA control)
- ~0.0001 ETH on Base Sepolia (for one-time SA deployment)
- USDC on Base Sepolia — from [faucet.circle.com](https://faucet.circle.com)

### Install

```bash
cd gekko
npm install
```

### Configure

Copy `.env.example` to `.env`. The file already has working agent keys and Venice API key.

### Start

```bash
# Terminal 1 — build frontend once
npm run build

# Terminal 2 — backend (serves built frontend + all API routes)
npm start
```

Open **http://localhost:3001**

For frontend hot-reload:
```bash
npm run dev        # Next.js on :3000
npm run dev:server # Express on :3001
```

---

## Funding Guide

### Step 1 — Get USDC on Base Sepolia

Visit [faucet.circle.com](https://faucet.circle.com), connect MetaMask, select **Base Sepolia**, claim USDC.

### Step 2 — Deploy Your Hybrid Smart Account

Connect wallet in the dashboard. If the amber "Deploy Smart Account" button appears (SA not yet deployed), click it. MetaMask shows a normal transaction confirmation — approve it. Uses ~0.00005 ETH.

### Step 3 — Fund Your Hybrid SA (for user → agent payments)

After deploying, the **Delegation tab** shows your SA address. Send ≥**0.14 USDC** to it:

| Recipient | Amount | Purpose |
|-----------|--------|---------|
| 1Shot fee | 0.01 USDC | Relayer fee (first in every batch) |
| Researcher | 0.05 USDC | Research task payment |
| Validator | 0.03 USDC | Validation task payment |
| Writer | 0.05 USDC | Writing task payment |

### Step 4 — Fund Agent Hybrid SAs (for x402 Venice payments)

Each agent pays for Venice AI calls via x402. Get their Hybrid SA addresses:

```bash
curl http://localhost:3001/api/agent-smartaccounts
```

Send ~**0.01 USDC** to each `smartAccount` address. Without this, x402 payments fail silently and Venice calls go through without payment.

---

## Full On-Chain Flow (Step by Step)

1. `npm run build && npm start` → open http://localhost:3001
2. **Connect Wallet** — MetaMask Flask popup. Dashboard checks deployment status.
3. **Deploy Smart Account** (if amber button shows) — approve tx in MetaMask.
4. **Fund SA** — send USDC from faucet to your SA address (in Delegation tab).
5. **Sign Delegation** — one EIP-712 MetaMask popup. Approve it.
6. Enter goal, click **Launch Mission** — watch Live Feed.
7. When mission completes, **Pay Agents On-Chain** panel appears.
8. Click **Pay Agents On-Chain** — server runs estimate → send flow.
9. Dashboard polls every 3s → confirms with BaseScan link.

---

## Agent Wallets

| Agent | EOA Address (Base Sepolia) | Role |
|-------|---------------------------|------|
| Orchestrator | `0xF9bc59882a7d6D2Dd24ff3800F69CC459bDDCC62` | Coordinator |
| Researcher | `0x6eB5e2011964a3D7Cf371aAbBD49545C70A7052c` | Venice web search |
| Validator | `0x6eB5e2011964a3D7Cf371aAbBD49545C70A7052c` | Fact-checking (shares key with Researcher) |
| Writer | `0x7cB1966270d9D257AD1EEE4bEb142622A9937494` | Report writing |

Agent Hybrid SA addresses (for x402 USDC funding) differ from EOA — get from `GET /api/agent-smartaccounts`.

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/goal` | Submit a research goal |
| POST | `/api/execute` | Run estimate→send flow via 1Shot, returns taskId |
| GET | `/api/task-status?id=` | Poll 1Shot for on-chain tx confirmation |
| GET | `/api/relayer-caps` | Live 1Shot targetAddress + feeCollector for delegation signing |
| GET | `/api/agent-smartaccounts` | Hybrid smart account addresses for x402 USDC funding |
| GET | `/api/health` | System status |
| GET | `/api/balances` | USDC balances for all agent wallets |
| GET | `/api/registry` | Registered services in the agent marketplace |
| GET | `/api/escrows` | In-memory escrow sessions |
| GET | `/api/transactions` | On-chain USDC Transfer events |
| GET | `/api/events/stream` | SSE real-time stream of all agent actions |
| GET | `/api/reasoning` | Agent decision log with full reasoning context |
| GET | `/api/agents` | Agent names, roles, wallet addresses |

---

## 1Shot Relayer Details

| Setting | Value |
|---------|-------|
| Endpoint | `https://relayer.1shotapi.dev/relayers` |
| Chain | Base Sepolia (84532) |
| Type | Public relayer — no API key required |
| Target address | Fetched live via `relayer_getCapabilities` |
| Fee collector | Fetched live via `relayer_getCapabilities` |
| JSON-RPC flow | `getCapabilities` → `estimate7710Transaction` → `send7710Transaction` → `getStatus` |
| Status codes | 100=Queued, 110=Submitted, 200=Confirmed, 400=Rejected, 500=Reverted |
| Context blob | Required: estimate returns it, send must include it |

---

## x402 Micropayments (Agent → Venice AI)

x402 is a pay-per-call protocol using HTTP 402 responses. Every agent call to the Venice AI proxy triggers a real USDC micropayment from the agent's Hybrid smart account.

**Status: enabled** (`X402_ENABLED=true`) — real HTTP 402 enforcement, not cosmetic

### Prices

| Route | Price |
|-------|-------|
| `POST /api/venice/chat` | $0.001 USDC per call |
| `POST /api/venice/search` | $0.0005 USDC per call |

### Facilitator

`https://tx-sentinel-base-sepolia.dev-api.cx.metamask.io/platform/v2/x402`

### What's needed

Fund each agent's **Hybrid smart account** with USDC. Get addresses from `GET /api/agent-smartaccounts`.

---

## Venice AI Models

| Use | Model |
|-----|-------|
| Web research | `llama-3.3-70b` + web search enabled |
| Fact-checking | `deepseek-v3.2` |
| Report writing | `mistral-small-2603` |

---

## License

MIT
