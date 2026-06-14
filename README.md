# Gekko

Autonomous AI agent marketplace with on-chain USDC payments on Base.

Built for the **MetaMask Smart Accounts × 1Shot API × Venice AI** hackathon.

---

## What It Does

You submit a research goal. Four autonomous AI agents coordinate: the orchestrator plans, the researcher finds information, the validator fact-checks it, and the writer synthesizes a full report. Every agent gets paid in USDC — no human in the loop after you hit Launch.

**Two payment layers run in parallel:**

| Layer | Chain | How |
|-------|-------|-----|
| Agent-to-agent | Base Sepolia | ethers.js direct USDC transfers |
| User → Agents | Base mainnet | ERC-7710 delegation via MetaMask + 1Shot |

The on-chain flow is gasless for the user — you sign a delegation once, and 1Shot's relayer executes the USDC transfers on your behalf with no ETH required.

---

## Architecture

```
User (MetaMask on Base mainnet)
  │
  │  signs ERC-7710 delegation
  │  (grants 1Shot permission to spend USDC from smart account)
  │
  ▼
Gekko Dashboard (Next.js)
  │
  │  POST /api/goal → mission starts
  │
  ▼
Orchestrator Agent (Express / Node.js)
  ├── Research Agent  ← Venice AI (llama-3.3-70b + web search)
  ├── Validator Agent ← Venice AI (deepseek-v3.2 reasoning)
  └── Writer Agent    ← Venice AI (mistral-small-2603)
  │
  │  mission complete
  │
  ▼
User clicks "Pay Agents On-Chain"
  │
  │  POST /api/execute (signed delegation + executions)
  │
  ▼
1Shot Permissionless Relayer (Base mainnet)
  ├── 0.01 USDC → 1Shot fee address
  ├── 0.05 USDC → Researcher wallet
  ├── 0.03 USDC → Validator wallet
  └── 0.05 USDC → Writer wallet
  │
  ▼
BaseScan tx link displayed in dashboard
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15 (static export), React, Tailwind CSS |
| Backend | Node.js, Express |
| AI Inference | Venice AI (private, censorship-resistant) |
| Smart Accounts | MetaMask Hybrid Smart Account (`@metamask/smart-accounts-kit`) |
| On-chain payments | ERC-7710 delegation + 1Shot permissionless relayer |
| Agent payments | ethers v6 direct USDC transfers |
| Micropayments | x402 protocol (`@metamask/x402`, disabled in demo) |
| Testnet | Base Sepolia (agent wallets) |
| Mainnet | Base (user → agent payments) |
| USDC (mainnet) | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| USDC (sepolia) | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |

---

## How 1Shot + ERC-7710 Works

1. **Connect MetaMask** — Gekko derives your counterfactual Hybrid Smart Account address (deterministic from your EOA).
2. **Sign Delegation** — MetaMask switches to Base mainnet and asks you to sign an EIP-712 delegation granting 1Shot's relayer address permission to transfer USDC from your smart account (capped at 0.14 USDC).
3. **Run Mission** — Agents do the research work. No on-chain activity yet.
4. **Pay Agents On-Chain** — You click once. The server sends your signed delegation + the payment executions to 1Shot. The relayer executes all USDC transfers in a single gasless transaction on Base mainnet.
5. **Confirm** — A BaseScan link appears when the transaction confirms.

No ETH needed. No gas wallet. The 0.01 USDC fee covers gas for the entire batch.

---

## Running Locally

### Prerequisites

- Node.js 18+
- MetaMask browser extension
- USDC on Base mainnet (in your MetaMask smart account — see below)

### Install

```bash
cd gekko
npm install
```

### Configure

Copy `.env.example` to `.env`. The file already has working agent keys and Venice API key for local development.

### Start

```bash
# Terminal 1 — build frontend once
npm run build

# Terminal 2 — backend (agents + API, serves built frontend)
npm start
```

Open **http://localhost:3001**

For frontend hot-reload during development:
```bash
npm run dev        # Next.js on :3000
npm run dev:server # Express on :3001
```

---

## Funding the Smart Account (Required for On-Chain Payments)

The ERC-7710 on-chain payment flow requires USDC in your MetaMask Hybrid Smart Account on Base mainnet. This is NOT your regular MetaMask EOA address — it's a counterfactual smart contract wallet derived from your EOA.

**To get your smart account address:**
1. Open http://localhost:3001
2. Click "Connect Wallet"
3. Your smart account address appears in the Delegation panel

**To fund it:**
Send at least **0.14 USDC** to your smart account address on Base mainnet:

| Recipient | Amount | Purpose |
|-----------|--------|---------|
| 1Shot fee | 0.01 USDC | Relayer fee (mandatory, first execution) |
| Researcher | 0.05 USDC | Research task payment |
| Validator | 0.03 USDC | Validation task payment |
| Writer | 0.05 USDC | Writing task payment |

Bridge USDC to Base mainnet: https://bridge.base.org

---

## Full On-Chain Flow (End to End)

1. `npm start` and open http://localhost:3001
2. **Connect Wallet** — MetaMask popup, approve connection
3. **Sign Delegation** — MetaMask switches to Base mainnet, sign EIP-712 delegation
4. Enter a research goal and click **Launch Mission**
5. Watch real-time progress in the Live Feed (SSE)
6. When mission completes, the "Pay Agents On-Chain" panel appears
7. Click **Pay Agents On-Chain** — server submits to 1Shot
8. Dashboard polls for confirmation every 3 seconds
9. When confirmed: BaseScan transaction link appears

---

## Agent Wallets

| Agent | Address | Role |
|-------|---------|------|
| Orchestrator | `0xF9bc59882a7d6D2Dd24ff3800F69CC459bDDCC62` | Coordinator |
| Researcher | `0x6eB5e2011964a3D7Cf371aAbBD49545C70A7052c` | Venice web search |
| Validator | `0x6eB5e2011964a3D7Cf371aAbBD49545C70A7052c` | Fact-checking |
| Writer | `0x7cB1966270d9D257AD1EEE4bEb142622A9937494` | Report writing |

Fund these with USDC on Base Sepolia to enable real agent-to-agent transfers. Without funds, payments simulate gracefully and the research pipeline still runs.

Base Sepolia USDC faucet: https://faucet.circle.com

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/goal` | Submit a research goal |
| POST | `/api/execute` | Submit signed delegation to 1Shot, returns taskId |
| GET | `/api/task-status?id=` | Poll 1Shot for on-chain tx confirmation |
| GET | `/api/health` | System status |
| GET | `/api/balances` | USDC balances for all agent wallets |
| GET | `/api/registry` | Registered services in the agent marketplace |
| GET | `/api/escrows` | In-memory escrow sessions |
| GET | `/api/transactions` | On-chain USDC Transfer events |
| GET | `/api/reasoning` | Agent decision log with full reasoning context |
| GET | `/api/agents` | Agent names, roles, wallet addresses |
| GET | `/api/events/stream` | SSE real-time stream of all agent actions |

---

## Dashboard Panels

- **Mission Control** — goal input, budget slider, Launch button
- **Agent Roster** — live status of all four agents
- **Live Feed** — real-time SSE stream of every action
- **Report** — final synthesized output with markdown rendering
- **Marketplace** — registered services with prices
- **Transactions** — on-chain USDC transfers with BaseScan links
- **Delegation** — your signed delegation details (delegator, delegate, caveats)
- **Reasoning** — agent decision log

---

## Venice AI Models

| Use | Model |
|-----|-------|
| Web research | `llama-3.3-70b` + web search enabled |
| Fact-checking | `deepseek-v3.2` |
| Report writing | `mistral-small-2603` |

Venice AI provides private, uncensored LLM inference with no request logging or data retention.

---

## License

MIT
