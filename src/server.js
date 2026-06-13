require('dotenv').config();
const express = require('express');
const path = require('path');
const { AGENTS, RATE_LIMITS, BUDGET, SYSTEM, NETWORK, ONESHOT, VENICE, X402 } = require('./config');
const dispatchEvents = require('./event-bus');
const ServiceRegistry = require('./registry');
const EscrowManager = require('./escrow');
const OrchestratorAgent = require('./agents/orchestrator');
const ResearchAgent = require('./agents/research-agent');
const WriterAgent = require('./agents/writer-agent');
const ValidatorAgent = require('./agents/validator-agent');
const AgentWallet = require('./wallet');
const OneShotClient = require('./oneshot');
const { VeniceClient } = require('./venice');
const { x402Middleware } = require('./x402-server');
const { getDelegationChain } = require('./delegation');
const { buildPermissionRequest, parseGrantedPermissions } = require('./permissions');

const REASONING_ACTIONS = new Set([
  'subtasks_planned', 'agent_discovered', 'dispatching_task',
  'budget_exceeded', 'payment_initiated', 'payment_completed',
  'escrow_created', 'escrow_released', 'goal_received', 'goal_completed',
  'dynamic_planning', 'validation_result', 'research_empty',
]);

// ── App Setup ────────────────────────────────────────────────────

const app = express();
app.use(express.json({ limit: '100kb' }));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowed = [
    `http://localhost:${SYSTEM.port}`,
    `http://localhost:3000`,
    SYSTEM.deployedUrl,
  ].filter(Boolean);
  if (!origin || allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key, X-Payment');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
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

const fs = require('fs');
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

// ── Agent Initialization ─────────────────────────────────────────

let orchestrator, researcher, writer, validator;
let oneShotClient, veniceClient;

function makeWallet(privateKey) {
  if (!privateKey) return null;
  return new AgentWallet(privateKey, oneShotClient, NETWORK);
}

function initAgents() {
  oneShotClient = new OneShotClient(ONESHOT.apiKey);
  veniceClient = new VeniceClient(VENICE.apiKey);

  const rConf = AGENTS.researcher;
  const wConf = AGENTS.writer;
  const vConf = AGENTS.validator;
  const oConf = AGENTS.orchestrator;

  researcher = new ResearchAgent({
    name: rConf.name,
    agentWallet: makeWallet(rConf.privateKey),
  });

  writer = new WriterAgent({
    name: wConf.name,
    agentWallet: makeWallet(wConf.privateKey),
  });

  validator = new ValidatorAgent({
    name: vConf.name,
    agentWallet: makeWallet(vConf.privateKey),
  });

  orchestrator = new OrchestratorAgent({
    name: oConf.name,
    agentWallet: makeWallet(oConf.privateKey),
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
}

function allAgents() {
  return [
    { name: 'orchestrator', agent: orchestrator },
    { name: 'researcher', agent: researcher },
    { name: 'writer', agent: writer },
    { name: 'validator', agent: validator },
  ];
}

// ── x402-gated Venice AI proxy routes ───────────────────────────

const x402Options = {
  recipient: X402.treasuryAddress || '0x0000000000000000000000000000000000000000',
  tokenAddress: NETWORK.usdcAddress,
  chainId: String(NETWORK.chainId),
};

app.post('/api/venice/chat',
  x402Middleware({ ...x402Options, amount: X402.chatPrice }),
  async (req, res) => {
    try {
      if (!veniceClient) return res.status(503).json({ error: 'Venice AI not configured' });
      const { model, messages, ...opts } = req.body;
      const result = await veniceClient.chat(model, messages, opts);
      res.json(result);
    } catch (err) {
      console.error('Venice chat error:', err.message);
      res.status(502).json({ error: 'Venice AI request failed' });
    }
  }
);

app.post('/api/venice/search',
  x402Middleware({ ...x402Options, amount: X402.searchPrice }),
  async (req, res) => {
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
  }
);

// ── API Routes ───────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    agents: {
      orchestrator: { name: orchestrator?.name, wallet: orchestrator?.walletAddress },
      researcher: { name: researcher?.name, wallet: researcher?.walletAddress },
      writer: { name: writer?.name, wallet: writer?.walletAddress },
      validator: { name: validator?.name, wallet: validator?.walletAddress },
    },
    services: registry.getAll().length,
    escrows: escrowManager.getAll().length,
    network: NETWORK.name,
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
  if (maxPerTask !== undefined && (!Number.isFinite(Number(maxPerTask)) || Number(maxPerTask) <= 0))
    return res.status(400).json({ error: 'maxPerTask must be a positive number' });

  const now = Date.now();
  if (now - lastGoalTime < RATE_LIMITS.goalCooldownMs) {
    const wait = Math.ceil((RATE_LIMITS.goalCooldownMs - (now - lastGoalTime)) / 1000);
    return res.status(429).json({ error: `Rate limited. Try again in ${wait}s.` });
  }

  while (goalHourWindow.length && goalHourWindow[0] < now - RATE_LIMITS.oneHourMs) goalHourWindow.shift();
  if (goalHourWindow.length >= RATE_LIMITS.maxGoalsPerHour) {
    return res.status(429).json({ error: `Rate limited. Max ${RATE_LIMITS.maxGoalsPerHour} goals per hour.` });
  }

  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  const ipTimes = ipGoalCounts.get(clientIp) || [];
  const recentIpGoals = ipTimes.filter(t => t > now - RATE_LIMITS.oneHourMs);
  if (recentIpGoals.length >= RATE_LIMITS.maxGoalsPerHour) {
    return res.status(429).json({ error: `Rate limited. Max ${RATE_LIMITS.maxGoalsPerHour} goals per hour per client.` });
  }
  recentIpGoals.push(now);
  ipGoalCounts.set(clientIp, recentIpGoals);

  lastGoalTime = now;
  goalHourWindow.push(now);

  const safeBudget = Math.min(budget || orchestrator.budget.total, BUDGET.maxPerGoal);
  const safePerTask = Math.min(maxPerTask || orchestrator.budget.perTask, BUDGET.maxPerTask);
  if (budget || maxPerTask) orchestrator.setBudget(safeBudget, safePerTask);

  // Apply ERC-7715 permissions from frontend if provided
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
    } catch (err) {
      balances[name] = { error: 'Balance check failed' };
    }
  }));
  res.json({ balances });
});

app.get('/api/registry', (req, res) => {
  res.json({ services: registry.getAll() });
});

app.get('/api/registry/discover', (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'q parameter required' });
  if (typeof q !== 'string' || q.length > 200) return res.status(400).json({ error: 'query must be a string under 200 characters' });
  res.json({ results: registry.discover(q) });
});

app.post('/api/registry/register', (req, res) => {
  const { agentName, walletAddress, service } = req.body;
  if (!agentName || typeof agentName !== 'string' || agentName.length > 100)
    return res.status(400).json({ error: 'agentName is required (string, max 100 chars)' });
  if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress))
    return res.status(400).json({ error: 'walletAddress must be a valid Ethereum address' });
  if (!service?.name || !service?.price || !Array.isArray(service?.capabilities))
    return res.status(400).json({ error: 'service must include name, price, and capabilities array' });
  if (typeof service.price !== 'number' || service.price <= 0 || service.price > 10)
    return res.status(400).json({ error: 'service.price must be between 0 and 10 USDC' });

  const entry = registry.register(agentName, walletAddress, '', {
    name: String(service.name).slice(0, 100),
    description: String(service.description || '').slice(0, 500),
    price: service.price,
    capabilities: service.capabilities.slice(0, 10).map(c => String(c).slice(0, 50)),
  });
  res.json({ success: true, serviceId: entry.id, message: 'Service registered.' });
});

app.get('/api/escrows', (req, res) => {
  res.json({ escrows: [...escrowManager.getAll()].reverse() });
});

app.get('/api/timeline', (req, res) => {
  res.json({ events: masterTimeline });
});

app.get('/api/events/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write(`data: ${JSON.stringify({ action: 'connected', timestamp: new Date().toISOString() })}\n\n`);
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

// 1Shot webhook — confirms on-chain tx settlement
app.post('/api/webhooks/oneshot', express.text({ type: '*/*' }), (req, res) => {
  const webhookSecret = ONESHOT.webhookSecret;
  const signature = req.headers['x-signature-256'] || req.headers['x-1shot-signature'];

  if (webhookSecret && oneShotClient) {
    const payload = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    if (!oneShotClient.verifyWebhookSignature(payload, signature, webhookSecret)) {
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const { txId, status, txHash } = body;

  if (status === 'confirmed' && txId) {
    escrowManager.confirmByTxId(txId, txHash);
    dispatchEvents.emit('agent-event', {
      timestamp: new Date().toISOString(),
      agent: '1shot',
      action: 'payment_confirmed',
      type: 'payment',
      txId,
      txHash,
    });
  }

  res.json({ received: true });
});

// ERC-7715 permission request descriptor for the frontend
app.get('/api/permissions/request', (req, res) => {
  const request = buildPermissionRequest(
    AGENTS.orchestrator.address,
    NETWORK.usdcAddress,
    BUDGET.maxPerGoal,
    NETWORK.chainId
  );
  res.json({ permissionRequest: request });
});

// ERC-7710 delegation chain for the UI
app.get('/api/delegations', (req, res) => {
  const chain = getDelegationChain();
  res.json({ delegations: chain });
});

app.get('/api/audit', (req, res) => {
  const workerAudits = {};
  if (researcher) workerAudits.researcher = researcher.getAuditTrail();
  if (writer) workerAudits.writer = writer.getAuditTrail();
  if (validator) workerAudits.validator = validator.getAuditTrail();
  res.json({
    orchestrator: orchestrator?.getAuditTrail(),
    workers: workerAudits,
    budget: orchestrator?.budget,
    tasks: orchestrator?.tasks,
  });
});

app.get('/api/reasoning', (req, res) => {
  const reasoningEvents = masterTimeline.filter(e => e.reasoning || REASONING_ACTIONS.has(e.action));
  res.json({ reasoning: reasoningEvents });
});

app.get('/api/agents', (req, res) => {
  res.json({
    agents: allAgents().map(({ agent }) => ({
      name: agent?.name,
      role: agent?.role,
      wallet: agent?.walletAddress,
      reputation: registry.getReputation(agent?.name),
    })),
  });
});

app.get('/api/reputation', (req, res) => {
  res.json({ reputations: registry.getAllReputations() });
});

// On-chain transactions — query USDC Transfer events via ethers
app.get('/api/transactions', async (req, res) => {
  try {
    const { ethers } = require('ethers');
    const provider = new ethers.JsonRpcProvider(NETWORK.rpcUrl);
    const ERC20_ABI = ['event Transfer(address indexed from, address indexed to, uint256 value)'];
    const usdc = new ethers.Contract(NETWORK.usdcAddress, ERC20_ABI, provider);
    const all = [];
    const seen = new Set();

    const agentList = allAgents().filter(a => a.agent?.walletAddress);

    // Look back ~2000 blocks (~67 min on Base)
    let fromBlock;
    try {
      const latest = await provider.getBlockNumber();
      fromBlock = Math.max(0, latest - 2000);
    } catch { fromBlock = 0; }

    await Promise.all(agentList.map(async ({ name, agent }) => {
      if (!agent?.walletAddress) return;
      const addr = agent.walletAddress;
      if (seen.has(addr)) return;
      seen.add(addr);

      try {
        // Outgoing transfers from this agent
        const outFilter = usdc.filters.Transfer(addr, null);
        const outEvents = await usdc.queryFilter(outFilter, fromBlock);
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
      } catch { /* RPC may not support event queries on all networks */ }
    }));

    all.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    res.json({ transactions: all });
  } catch (err) {
    console.error('Transaction fetch failed:', err);
    res.status(500).json({ error: 'Failed to fetch transactions.' });
  }
});

// SPA fallback
app.get('*', (req, res) => {
  const staticRoot = fs.existsSync(outDir) ? outDir : publicDir;
  const indexPath = path.join(staticRoot, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('Frontend not built. Run: npm run build');
  }
});

app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  if (!res.headersSent) res.status(500).json({ error: 'An internal error occurred.' });
});

try {
  initAgents();
} catch (err) {
  console.warn('Agent init warning:', err.message);
}

app.listen(SYSTEM.port, () => {
  console.log(`Gekko running on http://localhost:${SYSTEM.port}`);
  console.log(`Network: ${NETWORK.name} (chain ${NETWORK.chainId})`);
});
