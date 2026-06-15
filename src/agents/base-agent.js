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
   * @param {Function} [config.fetchWithPayment] - x402-aware fetch from createX402FetchForAgent()
   */
  constructor({ name, role, agentWallet, fetchWithPayment }) {
    this.id = uuidv4();
    this.name = name;
    this.role = role;
    this.agentWallet = agentWallet;
    this.walletAddress = agentWallet?.address || null;
    // fetchWithPayment handles the full x402 ERC-7710 delegation payment flow.
    // Falls back to global fetch if not provided (demo mode / unfunded).
    this.fetchWithPayment = fetchWithPayment || fetch.bind(globalThis);
    this.taskLog = [];
    this.isDead = false;
    this.quarantinedUntil = 0;
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
   * Uses fetchWithPayment which automatically handles the 402 → ERC-7710
   * delegation payment → retry flow when X402_ENABLED=true.
   *
   * @param {string} _provider - ignored (all calls route to Venice)
   * @param {string} endpoint - 'chat' | 'search'
   * @param {object} params - Request body
   */
  async callAPI(_provider, endpoint, params) {
    this.log('api_call', { type: 'api', provider: 'venice', endpoint });

    const url = `${X402.endpointBase}/api/venice/${endpoint}`;

    const response = await this.fetchWithPayment(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => response.status);
      throw new Error(`Venice ${endpoint} failed (${response.status}): ${errText}`);
    }

    const data = await response.json();

    this.log('api_call_completed', { type: 'api', provider: 'venice', endpoint, success: true });

    return { data };
  }

  // Mark this agent as dead and enter a 30-second quarantine
  die(reason, missionId = null) {
    const QUARANTINE_MS = 30_000;
    this.isDead = true;
    this.quarantinedUntil = Date.now() + QUARANTINE_MS;
    this.log('agent_died', {
      reason,
      missionId,
      quarantinedUntil: new Date(this.quarantinedUntil).toISOString(),
      reasoning: `Agent ${this.name} died: ${reason}. Quarantined for 30s.`,
    });
  }

  // Returns true if in the 30-second quarantine window
  isQuarantined() {
    if (!this.isDead) return false;
    if (Date.now() >= this.quarantinedUntil) {
      // Quarantine expired — resurrect
      this.isDead = false;
      this.quarantinedUntil = 0;
      this.log('agent_resurrected', { reasoning: `${this.name} quarantine expired — back in service.` });
      return false;
    }
    return true;
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
