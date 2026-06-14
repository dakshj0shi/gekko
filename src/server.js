require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { AGENTS, RATE_LIMITS, BUDGET, SYSTEM, NETWORK, ONESHOT, VENICE, X402 } = require('./config');
const dispatchEvents = require('./event-bus');
const ServiceRegistry = require('./registry');
const EscrowManager = require('./escrow');
const OrchestratorAgent = require('./agents/orchestrator');
const ResearchAgent = require('./agents/research-agent');
const WriterAgent = require('./agents/writer-agent');
const ValidatorAgent = require('./agents/validator-agent');
const AgentWallet = require('./wallet');
const { VeniceClient } = require('./venice');
const { createX402Middleware } = require('./x402-server');
const { createX402FetchForAgent } = require('./x402-client');
const { getDelegationChain } = require('./delegation');
const { buildPermissionRequestParams, parseGrantedPermissions } = require('./permissions');
const {
  getCapabilities,
  estimate7710Transaction,
  send7710Transaction,
  getTaskStatus,
  waitForTask,
  encodeERC20Transfer,
  buildAgentPaymentExecutions,
  USDC_BASE,
  ONESHOT_FEE_ADDRESS,
  ONESHOT_FEE_USDC,
  ONESHOT_TARGET,
  BASE_EXPLORER,
} = require('./oneshot');

const REASONING_ACTIONS = new Set([
  'subtasks_planned', 'agent_discovered', 'dispatching_task',
  'budget_exceeded', 'payment_initiated', 'payment_completed',
  'escrow_created', 'escrow_released', 'goal_received', 'goal_completed',
  'dynamic_planning', 'validation_result', 'research_empty',
]);

// ── App Setup ────────────────────────────────────────────────────

const app = express();
app.use(express.json({ limit: '100kb' }));

// CORS — expose x402 payment headers for browser clients
app.use(cors({
  origin: (origin, cb) => {
    const allowed = [
      `http://localhost:${SYSTEM.port}`,
      'http://localhost:3000',
      SYSTEM.deployedUrl,
    ].filter(Boolean);
    if (!origin || allowed.includes(origin)) return cb(null, true);
    cb(null, false);
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-API-Key', 'PAYMENT-SIGNATURE'],
  exposedHeaders: ['PAYMENT-REQUIRED', 'PAYMENT-RESPONSE'],
}));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

const API_KEY = process.env.DISPATCH_API_KEY || null;
app.use('/api/goal', (req, res, next) => {
  if (!API_KEY) return next();
  if (req.method !== 'POST') return next();
  const key = req.headers['x-api-key'] || req.query.key;
  if (key !== API_KEY) return res.status(401).json({ error: 'Invalid or missing API key.' });
  next();
});

app.use((req, res, next) => {
  res.setTimeout(120000, () => {
    if (!res.headersSent) res.status(504).json({ error: 'Request timeout' });
  });
  next();
});

const outDir = path.join(__dirname, '..', 'out');
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(fs.existsSync(outDir) ? outDir : publicDir));

// ── Core State ───────────────────────────────────────────────────

const registry = new ServiceRegistry();
const escrowManager = new EscrowManager();
const masterTimeline = [];
const sseClients = new Set();

dispatchEvents.on('agent-event', (event) => {
  masterTimeline.push(event);
  if (masterTimeline.length > SYSTEM.maxTimelineEvents) masterTimeline.shift();
  const data = JSON.stringify(event);
  for (const client of sseClients) client.write(`data: ${data}\n\n`);
});

// ── Agent Initialization (async — requires x402 smart account setup) ─────

let orchestrator, researcher, writer, validator;
let veniceClient;

async function initAgents() {
  veniceClient = new VeniceClient(VENICE.apiKey);

  const rConf = AGENTS.researcher;
  const wConf = AGENTS.writer;
  const vConf = AGENTS.validator;
  const oConf = AGENTS.orchestrator;

  // Create x402 payment-aware fetch per agent (wraps ERC-7710 delegation flow)
  const [orchFetch, resFetch, wriFetch] = await Promise.all([
    createX402FetchForAgent(oConf.privateKey),
    createX402FetchForAgent(rConf.privateKey),
    createX402FetchForAgent(wConf.privateKey),
  ]);

  const makeWallet = (privateKey) => {
    if (!privateKey) return null;
    return new AgentWallet(privateKey, null, NETWORK);
  };

  researcher = new ResearchAgent({
    name: rConf.name,
    agentWallet: makeWallet(rConf.privateKey),
    fetchWithPayment: resFetch,
  });

  writer = new WriterAgent({
    name: wConf.name,
    agentWallet: makeWallet(wConf.privateKey),
    fetchWithPayment: wriFetch,
  });

  // Validator shares researcher keypair — reuse the same fetch instance
  validator = new ValidatorAgent({
    name: vConf.name,
    agentWallet: makeWallet(vConf.privateKey),
    fetchWithPayment: resFetch,
  });

  orchestrator = new OrchestratorAgent({
    name: oConf.name,
    agentWallet: makeWallet(oConf.privateKey),
    fetchWithPayment: orchFetch,
    registry,
    escrowManager,
  });

  orchestrator.registerWorker(researcher);
  orchestrator.registerWorker(writer);
  orchestrator.registerWorker(validator);
  orchestrator.setBudget(BUDGET.defaultTotal, BUDGET.defaultPerTask);

  if (rConf.service) researcher.registerService(registry, rConf.service);
  if (wConf.service) writer.registerService(registry, wConf.service);
  if (vConf.service) validator.registerService(registry, vConf.service);

  console.log('Gekko agents initialized:');
  console.log(`  Orchestrator: ${oConf.address}`);
  console.log(`  Researcher:   ${rConf.address}`);
  console.log(`  Writer:       ${wConf.address}`);
  console.log(`  Network:      ${NETWORK.name} (chainId ${NETWORK.chainId})`);
  console.log(`  x402 mode:    ${X402.enabled ? 'ENABLED (ERC-7710 delegation payments)' : 'demo (pass-through)'}`);
}

function allAgents() {
  return [
    { name: 'orchestrator', agent: orchestrator },
    { name: 'researcher',   agent: researcher },
    { name: 'writer',       agent: writer },
    { name: 'validator',    agent: validator },
  ];
}

// ── API Routes ───────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    agents: {
      orchestrator: { name: orchestrator?.name, wallet: orchestrator?.walletAddress },
      researcher:   { name: researcher?.name,   wallet: researcher?.walletAddress },
      writer:       { name: writer?.name,       wallet: writer?.walletAddress },
      validator:    { name: validator?.name,    wallet: validator?.walletAddress },
    },
    services: registry.getAll().length,
    escrows:  escrowManager.getAll().length,
    network:  NETWORK.name,
    x402:     X402.enabled ? 'enabled' : 'demo',
  });
});

// Rate limiting
let lastGoalTime = 0;
const goalHourWindow = [];
const ipGoalCounts = new Map();

setInterval(() => {
  const cutoff = Date.now() - RATE_LIMITS.oneHourMs;
  for (const [ip, times] of ipGoalCounts) {
    const valid = times.filter(t => t > cutoff);
    if (valid.length === 0) ipGoalCounts.delete(ip);
    else ipGoalCounts.set(ip, valid);
  }
}, 600000);

app.post('/api/goal', async (req, res) => {
  const { goal, budget, maxPerTask, permissionContext } = req.body;
  if (!goal || typeof goal !== 'string') return res.status(400).json({ error: 'goal is required' });
  if (goal.length > SYSTEM.maxGoalLength) return res.status(400).json({ error: `goal must be under ${SYSTEM.maxGoalLength} characters` });
  if (budget !== undefined && (!Number.isFinite(Number(budget)) || Number(budget) <= 0))
    return res.status(400).json({ error: 'budget must be a positive number' });

  const now = Date.now();
  if (now - lastGoalTime < RATE_LIMITS.goalCooldownMs) {
    const wait = Math.ceil((RATE_LIMITS.goalCooldownMs - (now - lastGoalTime)) / 1000);
    return res.status(429).json({ error: `Rate limited. Try again in ${wait}s.` });
  }

  while (goalHourWindow.length && goalHourWindow[0] < now - RATE_LIMITS.oneHourMs) goalHourWindow.shift();
  if (goalHourWindow.length >= RATE_LIMITS.maxGoalsPerHour)
    return res.status(429).json({ error: `Rate limited. Max ${RATE_LIMITS.maxGoalsPerHour} goals per hour.` });

  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  const ipTimes = ipGoalCounts.get(clientIp) || [];
  const recentIpGoals = ipTimes.filter(t => t > now - RATE_LIMITS.oneHourMs);
  if (recentIpGoals.length >= RATE_LIMITS.maxGoalsPerHour)
    return res.status(429).json({ error: `Rate limited. Max ${RATE_LIMITS.maxGoalsPerHour} goals per hour per client.` });
  recentIpGoals.push(now);
  ipGoalCounts.set(clientIp, recentIpGoals);

  lastGoalTime = now;
  goalHourWindow.push(now);

  const safeBudget  = Math.min(budget   || orchestrator.budget.total,   BUDGET.maxPerGoal);
  const safePerTask = Math.min(maxPerTask || orchestrator.budget.perTask, BUDGET.maxPerTask);
  if (budget || maxPerTask) orchestrator.setBudget(safeBudget, safePerTask);

  // Apply ERC-7715 permission context from frontend grant
  if (permissionContext) {
    const parsed = parseGrantedPermissions(permissionContext);
    orchestrator.setPermissions(parsed);
  }

  try {
    const results = await orchestrator.executeGoal(goal);
    res.json({ success: true, goal, report: results.report, audit: results.audit });
  } catch (err) {
    console.error('Goal failed:', err);
    res.status(500).json({ error: 'Goal execution failed. Check server logs for details.' });
  }
});

app.get('/api/balances', async (req, res) => {
  const balances = {};
  await Promise.all(allAgents().map(async ({ name, agent }) => {
    try {
      if (!agent?.agentWallet) { balances[name] = { usdc_balance: '0', error: 'No wallet configured' }; return; }
      const bal = await agent.getBalance();
      balances[name] = { usdc_balance: String(bal) };
    } catch { balances[name] = { error: 'Balance check failed' }; }
  }));
  res.json({ balances });
});

app.get('/api/registry', (req, res) => res.json({ services: registry.getAll() }));

app.get('/api/registry/discover', (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'q parameter required' });
  if (typeof q !== 'string' || q.length > 200) return res.status(400).json({ error: 'query too long' });
  res.json({ results: registry.discover(q) });
});

app.post('/api/registry/register', (req, res) => {
  const { agentName, walletAddress, service } = req.body;
  if (!agentName || typeof agentName !== 'string' || agentName.length > 100)
    return res.status(400).json({ error: 'agentName required (string, max 100)' });
  if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress))
    return res.status(400).json({ error: 'walletAddress must be a valid Ethereum address' });
  if (!service?.name || !service?.price || !Array.isArray(service?.capabilities))
    return res.status(400).json({ error: 'service must include name, price, and capabilities' });
  const entry = registry.register(agentName, walletAddress, '', {
    name: String(service.name).slice(0, 100),
    description: String(service.description || '').slice(0, 500),
    price: service.price,
    capabilities: service.capabilities.slice(0, 10).map(c => String(c).slice(0, 50)),
  });
  res.json({ success: true, serviceId: entry.id });
});

app.get('/api/escrows', (req, res) => res.json({ escrows: [...escrowManager.getAll()].reverse() }));

app.get('/api/timeline', (req, res) => res.json({ events: masterTimeline }));

app.get('/api/events/stream', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.write(`data: ${JSON.stringify({ action: 'connected', timestamp: new Date().toISOString() })}\n\n`);
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

// ERC-7715 permission request parameters for the frontend
app.get('/api/permissions/request', (req, res) => {
  const params = buildPermissionRequestParams(
    AGENTS.orchestrator.address,
    NETWORK.usdcAddress,
    BUDGET.maxPerGoal,
    NETWORK.chainId
  );
  res.json({ permissionParams: params });
});

// ERC-7710 delegation chain for the UI
app.get('/api/delegations', (req, res) => {
  res.json({ delegations: getDelegationChain() });
});

app.get('/api/audit', (req, res) => {
  res.json({
    orchestrator: orchestrator?.getAuditTrail(),
    workers: {
      researcher: researcher?.getAuditTrail(),
      writer:     writer?.getAuditTrail(),
      validator:  validator?.getAuditTrail(),
    },
    budget: orchestrator?.budget,
    tasks:  orchestrator?.tasks,
  });
});

app.get('/api/reasoning', (req, res) => {
  const reasoningEvents = masterTimeline.filter(e => e.reasoning || REASONING_ACTIONS.has(e.action));
  res.json({ reasoning: reasoningEvents });
});

app.get('/api/agents', (req, res) => {
  res.json({
    agents: allAgents().map(({ agent }) => ({
      name:       agent?.name,
      role:       agent?.role,
      wallet:     agent?.walletAddress,
      reputation: registry.getReputation(agent?.name),
    })),
  });
});

app.get('/api/reputation', (req, res) => res.json({ reputations: registry.getAllReputations() }));

app.get('/api/transactions', async (req, res) => {
  try {
    const { ethers } = require('ethers');
    const provider = new ethers.JsonRpcProvider(NETWORK.rpcUrl);
    const ERC20_ABI = ['event Transfer(address indexed from, address indexed to, uint256 value)'];
    const usdc = new ethers.Contract(NETWORK.usdcAddress, ERC20_ABI, provider);
    const all = [];
    const seen = new Set();
    const agentList = allAgents().filter(a => a.agent?.walletAddress);
    let fromBlock;
    try { const latest = await provider.getBlockNumber(); fromBlock = Math.max(0, latest - 2000); }
    catch { fromBlock = 0; }
    await Promise.all(agentList.map(async ({ name, agent }) => {
      const addr = agent.walletAddress;
      if (seen.has(addr)) return;
      seen.add(addr);
      try {
        const outEvents = await usdc.queryFilter(usdc.filters.Transfer(addr, null), fromBlock);
        outEvents.forEach(e => all.push({
          _agent: name,
          from_address: addr,
          to_address: e.args.to,
          amount_usdc: Number(ethers.formatUnits(e.args.value, 6)),
          status: 'confirmed',
          tx_hash: e.transactionHash,
          created_at: new Date().toISOString(),
          memo: '',
        }));
      } catch { /* RPC may not support event queries */ }
    }));
    all.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    res.json({ transactions: all });
  } catch (err) {
    console.error('Transaction fetch failed:', err);
    res.status(500).json({ error: 'Failed to fetch transactions.' });
  }
});

// Venice AI proxy routes — x402 middleware applied globally via paymentMiddleware
// (configured in createX402Middleware for POST /api/venice/chat and /search)
app.post('/api/venice/chat', async (req, res) => {
  try {
    if (!veniceClient) return res.status(503).json({ error: 'Venice AI not configured' });
    const { model, messages, ...opts } = req.body;
    const result = await veniceClient.chat(model, messages, opts);
    res.json(result);
  } catch (err) {
    console.error('Venice chat error:', err.message);
    res.status(502).json({ error: 'Venice AI request failed' });
  }
});

app.post('/api/venice/search', async (req, res) => {
  try {
    if (!veniceClient) return res.status(503).json({ error: 'Venice AI not configured' });
    const query = req.body.q || req.body.query || '';
    const { model, venice_parameters } = req.body;
    const result = await veniceClient.search(query, { model, venice_parameters });
    res.json(result);
  } catch (err) {
    console.error('Venice search error:', err.message);
    res.status(502).json({ error: 'Venice AI search failed' });
  }
});

// ── 1Shot ERC-7710 on-chain execution ────────────────────────────

/**
 * POST /api/execute
 * Submits a signed ERC-7710 delegation + agent payment executions to 1Shot.
 * Body: { signedDelegation, recipients?, goalId? }
 * signedDelegation comes from signDelegationForOneShot() in the browser.
 */
app.post('/api/execute', async (req, res) => {
  try {
    const { signedDelegation, recipients, goalId } = req.body;

    if (!signedDelegation) {
      return res.status(400).json({ error: 'signedDelegation required' });
    }

    // Step 1: Get live relayer capabilities (target address + fee collector)
    const caps = await getCapabilities();
    const feeCollector = caps.feeCollector;

    // Step 2: Default recipients — Researcher + Validator + Writer
    const payTo = recipients?.length ? recipients : [
      { address: AGENTS.researcher.address, amountUsdc: 0.05 },
      { address: AGENTS.validator.address,  amountUsdc: 0.03 },
      { address: AGENTS.writer.address,     amountUsdc: 0.05 },
    ];

    // Step 3: Build executions with mock fee (fee first, then agent transfers)
    let feeAmount = ONESHOT_FEE_USDC; // 0.01 USDC default
    let executions = buildAgentPaymentExecutions(payTo, feeCollector, feeAmount);

    // Step 4: Estimate to get context blob and required fee
    // The context blob MUST be forwarded to relayer_send7710Transaction
    let estimate = await estimate7710Transaction(signedDelegation, executions);
    const requiredFee = BigInt(estimate.requiredPaymentAmount || '0');

    // Step 5: If relayer requires a different fee, rebuild executions and re-estimate
    if (requiredFee > 0n && requiredFee !== feeAmount) {
      console.log(`[execute] fee adjusted: ${feeAmount} → ${requiredFee}`);
      feeAmount = requiredFee;
      executions = buildAgentPaymentExecutions(payTo, feeCollector, feeAmount);
      estimate = await estimate7710Transaction(signedDelegation, executions);
    }

    // Step 6: Submit to 1Shot with context from estimate
    const taskId = await send7710Transaction(signedDelegation, executions, {
      context: estimate.context,
      memo: `gekko_${goalId || Date.now()}`,
    });

    res.json({
      goalId,
      taskId,
      txHash: null,      // not yet confirmed — frontend polls task-status
      confirmed: false,
      pending: true,
      explorer: BASE_EXPLORER,
    });
  } catch (err) {
    console.error('[execute] ERROR:', err.message);
    res.status(500).json({ error: err.message || 'Execution failed' });
  }
});

/**
 * GET /api/relayer-caps
 * Returns live 1Shot relayer capabilities: targetAddress (delegate for delegation.to)
 * and feeCollector. Frontend uses targetAddress when signing the ERC-7710 delegation
 * so the delegation.to always matches what the relayer expects.
 */
app.get('/api/relayer-caps', async (req, res) => {
  try {
    const caps = await getCapabilities();
    res.json({
      targetAddress: caps.targetAddress,
      feeCollector:  caps.feeCollector,
      chainId:       84532,
    });
  } catch (err) {
    // Fall back to hardcoded constants if relayer is unreachable
    console.warn('[relayer-caps] using fallback:', err.message);
    res.json({
      targetAddress: ONESHOT_TARGET,
      feeCollector:  ONESHOT_FEE_ADDRESS,
      chainId:       84532,
    });
  }
});

/**
 * GET /api/task-status?id=<taskId>
 * Poll 1Shot relayer for on-chain transaction status.
 */
app.get('/api/task-status', async (req, res) => {
  const { id } = req.query;
  if (!id || typeof id !== 'string' || id.length > 200) {
    return res.status(400).json({ error: 'id parameter required' });
  }
  try {
    const status = await getTaskStatus(id);
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/agent-smartaccounts
 * Returns the Hybrid smart account addresses for each agent on Base Sepolia.
 * These are the addresses that need USDC funding for x402 micropayments.
 */
app.get('/api/agent-smartaccounts', async (req, res) => {
  try {
    const { createPublicClient, http } = await import('viem');
    const { baseSepolia } = await import('viem/chains');
    const { privateKeyToAccount } = await import('viem/accounts');
    const { toMetaMaskSmartAccount, Implementation } = await import('@metamask/smart-accounts-kit');

    const publicClient = createPublicClient({ chain: baseSepolia, transport: http(NETWORK.rpcUrl) });

    const agentKeys = [
      { name: 'orchestrator', key: AGENTS.orchestrator.privateKey },
      { name: 'researcher',   key: AGENTS.researcher.privateKey },
      { name: 'validator',    key: AGENTS.validator.privateKey },
      { name: 'writer',       key: AGENTS.writer.privateKey },
    ];

    const accounts = await Promise.all(agentKeys.map(async ({ name, key }) => {
      if (!key) return { name, eoa: null, smartAccount: null };
      const account = privateKeyToAccount(key);
      const sa = await toMetaMaskSmartAccount({
        client: publicClient,
        implementation: Implementation.Hybrid,
        deployParams: [account.address, [], [], []],
        deploySalt: '0x',
        signer: { account },
      });
      return { name, eoa: account.address, smartAccount: sa.address };
    }));

    res.json({
      chain: 'Base Sepolia (84532)',
      usdc: process.env.USDC_ADDRESS,
      note: 'Fund each smartAccount address with USDC for x402 micropayments',
      accounts,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SPA fallback
app.get('*', (req, res) => {
  const staticRoot = fs.existsSync(outDir) ? outDir : publicDir;
  const indexPath = path.join(staticRoot, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.status(404).send('Frontend not built. Run: npm run build');
});

app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  if (!res.headersSent) res.status(500).json({ error: 'An internal error occurred.' });
});

// ── Async startup ────────────────────────────────────────────────

async function startServer() {
  // 1. Build x402 payment middleware (async because @x402/express is ESM)
  //    paymentMiddleware intercepts POST /api/venice/* before the handlers above
  const x402Mw = await createX402Middleware();
  // Register BEFORE the Venice route handlers so it intercepts first
  app.use(x402Mw);

  // 2. Initialize agents (async because smart account wrapping is async)
  try {
    await initAgents();
  } catch (err) {
    console.warn('Agent init warning:', err.message);
  }

  // 3. Start listening
  app.listen(SYSTEM.port, () => {
    console.log(`\nGekko running on http://localhost:${SYSTEM.port}`);
    console.log(`Network: ${NETWORK.name} (chain ${NETWORK.chainId})`);
    console.log(`x402:    ${X402.enabled ? 'enabled — ERC-7710 delegation payments active' : 'demo mode — set X402_ENABLED=true to enable payments'}\n`);
  });
}

startServer().catch(err => {
  console.error('Server startup failed:', err);
  process.exit(1);
});
