const AGENTS = {
  orchestrator: {
    name: 'GekkoOrchestrator',
    role: 'orchestrator',
    privateKey: process.env.ORCHESTRATOR_PRIVATE_KEY,
    address: process.env.ORCHESTRATOR_ADDRESS,
  },
  researcher: {
    name: 'GekkoResearcher',
    role: 'researcher',
    privateKey: process.env.RESEARCHER_PRIVATE_KEY,
    address: process.env.RESEARCHER_ADDRESS,
    service: {
      name: 'Web Research',
      description: 'Search the web and gather data using Venice AI with live web search',
      price: 0.05,
      capabilities: ['research', 'search', 'scrape', 'data-gathering'],
    },
  },
  writer: {
    name: 'GekkoWriter',
    role: 'writer',
    privateKey: process.env.WRITER_PRIVATE_KEY,
    address: process.env.WRITER_ADDRESS,
    service: {
      name: 'Report Synthesis',
      description: 'Synthesize research into professional reports using Venice AI',
      price: 0.05,
      capabilities: ['writing', 'synthesis', 'report', 'summarization'],
    },
  },
  validator: {
    name: 'GekkoValidator',
    role: 'validator',
    // Shares researcher keypair
    privateKey: process.env.RESEARCHER_PRIVATE_KEY,
    address: process.env.RESEARCHER_ADDRESS,
    service: {
      name: 'Fact Checking',
      description: 'Validate research findings using Venice reasoning model',
      price: 0.03,
      capabilities: ['validation', 'fact-checking', 'quality-assurance'],
    },
  },
};

const RATE_LIMITS = {
  goalCooldownMs: 15000,
  maxGoalsPerHour: 10,
  oneHourMs: 3600000,
};

const BUDGET = {
  maxPerGoal: 1.0,
  maxPerTask: 0.25,
  defaultTotal: 5.0,
  defaultPerTask: 1.0,
  minBalance: 0,
  defaultMaxPrice: 0.5,
};

const SYSTEM = {
  maxTimelineEvents: 500,
  maxGoalLength: 500,
  port: process.env.PORT || 3001,
  deployedUrl: process.env.DEPLOYED_URL || null,
};

const NETWORK = {
  name: process.env.NETWORK_NAME || 'base-sepolia',
  chainId: parseInt(process.env.CHAIN_ID || '84532'),
  rpcUrl: process.env.RPC_URL || 'https://sepolia.base.org',
  usdcAddress: process.env.USDC_ADDRESS || '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  delegationManagerAddress: process.env.DELEGATION_MANAGER || '0x0000000000000000000000000000000000000000',
};

const ONESHOT = {
  apiKey: process.env.ONESHOT_API_KEY,
  baseUrl: process.env.ONESHOT_BASE_URL || 'https://api.1shot.io',
  webhookSecret: process.env.ONESHOT_WEBHOOK_SECRET,
};

const VENICE = {
  apiKey: process.env.VENICE_API_KEY,
  baseUrl: process.env.VENICE_BASE_URL || 'https://api.venice.ai/api/v1',
};

const X402 = {
  endpointBase: process.env.X402_ENDPOINT_BASE || 'http://localhost:3001',
  treasuryAddress: process.env.X402_TREASURY_ADDRESS || process.env.ORCHESTRATOR_ADDRESS,
  chatPrice: '0.001',
  searchPrice: '0.0005',
};

module.exports = { AGENTS, RATE_LIMITS, BUDGET, SYSTEM, NETWORK, ONESHOT, VENICE, X402 };
