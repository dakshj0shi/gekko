const X402Client = require('../x402-client');
const { v4: uuidv4 } = require('uuid');
const dispatchEvents = require('../event-bus');
const { X402 } = require('../config');

const LOG_DETAIL_LIMIT = 200;

class BaseAgent {
  /**
   * @param {object} config
   * @param {string} config.name
   * @param {string} config.role
   * @param {AgentWallet} config.agentWallet
   */
  constructor({ name, role, agentWallet }) {
    this.id = uuidv4();
    this.name = name;
    this.role = role;
    this.agentWallet = agentWallet;
    this.walletAddress = agentWallet?.address || null;
    this.x402 = agentWallet ? new X402Client(agentWallet) : null;
    this.taskLog = [];
  }

  log(action, details = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      agent: this.name,
      role: this.role,
      action,
      ...details,
    };
    this.taskLog.push(entry);
    dispatchEvents.emit('agent-event', entry);
    console.log(`[${this.name}] ${action}`, JSON.stringify(details).slice(0, LOG_DETAIL_LIMIT));
    return entry;
  }

  async getBalance() {
    if (!this.agentWallet) return 0;
    return this.agentWallet.getBalance();
  }

  /**
   * Send USDC to another agent via the 1Shot relayer (gas paid in USDC).
   */
  async payAgent(recipientAddress, amount, taskDescription) {
    this.log('payment_initiated', {
      type: 'payment',
      to: recipientAddress,
      amount,
      task: taskDescription,
    });

    const result = await this.agentWallet.transfer(recipientAddress, amount, taskDescription);

    this.log('payment_completed', {
      type: 'payment',
      amount,
      to: recipientAddress,
      txId: result.txId,
    });

    return result;
  }

  /**
   * Call a Venice AI endpoint through the local x402-gated proxy.
   * Each call costs a USDC micropayment (x402 protocol).
   * @param {string} provider - 'venice' (ignored — all calls route to Venice)
   * @param {string} endpoint - 'chat' | 'search'
   * @param {object} params - Request body
   */
  async callAPI(provider, endpoint, params) {
    this.log('api_call', { type: 'api', provider: 'venice', endpoint });

    const url = `${X402.endpointBase}/api/venice/${endpoint}`;

    const result = await this.x402.fetchJSON(url, {
      method: 'POST',
      body: JSON.stringify(params),
    });

    this.log('api_call_completed', {
      type: 'api',
      provider: 'venice',
      endpoint,
      success: true,
    });

    return { data: result };
  }

  registerService(registry, serviceDef) {
    return registry.register(this.name, this.walletAddress, null, serviceDef);
  }

  getAuditTrail() {
    return {
      agentId: this.id,
      agentName: this.name,
      role: this.role,
      wallet: this.walletAddress,
      log: this.taskLog,
    };
  }
}

module.exports = BaseAgent;
