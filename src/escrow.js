/**
 * Escrow manager for Gekko — backed by 1Shot USDC transfers.
 *
 * Preserves the same public API as the original Locus-based escrow manager
 * so orchestrator.js needs minimal changes. The semantic difference:
 *   - createEscrow: records intent in-memory (no checkout URL generated)
 *   - preflight: checks USDC balance on-chain via ethers
 *   - releasePayment: submits a 1Shot UserOp for USDC transfer
 *
 * Session lifecycle: pending → preflight_ok → released → confirmed
 */
const { v4: uuidv4 } = require('uuid');
const dispatchEvents = require('./event-bus');

class EscrowManager {
  constructor() {
    this.sessions = new Map();
  }

  /**
   * Record escrow intent before a task begins.
   * @param {AgentWallet} agentWallet - Seller's wallet (used to verify identity)
   * @param {object} params
   * @param {number} params.amount - USDC to escrow
   * @param {string} params.description - Task description
   * @param {string} params.buyerAgent - Orchestrator name
   * @param {string} params.sellerAgent - Worker name
   * @param {object} [params.metadata]
   */
  async createEscrow(agentWallet, { amount, description, buyerAgent, sellerAgent, metadata = {} }) {
    const sessionId = uuidv4();

    const session = {
      sessionId,
      status: 'pending',
      amount,
      description,
      buyerAgent,
      sellerAgent,
      sellerAddress: agentWallet?.address || null,
      createdAt: new Date().toISOString(),
      txId: null,
      txHash: null,
      paidAt: null,
    };

    this.sessions.set(sessionId, session);

    dispatchEvents.emit('agent-event', {
      timestamp: new Date().toISOString(),
      agent: buyerAgent,
      action: 'escrow_created',
      type: 'escrow',
      amount,
      description,
      seller: sellerAgent,
      sessionId,
    });

    return session;
  }

  /**
   * Verify the orchestrator wallet has enough USDC to cover the task.
   * @param {AgentWallet} payerWallet - Orchestrator wallet
   * @param {string} sessionId - Escrow session to verify
   */
  async preflight(payerWallet, sessionId) {
    const session = this.sessions.get(sessionId);

    let canPay = false;
    try {
      const balance = await payerWallet.getBalance();
      canPay = balance >= (session?.amount || 0);
      if (session) session.status = canPay ? 'preflight_ok' : 'preflight_failed';
    } catch (err) {
      if (session) session.status = 'preflight_failed';
    }

    dispatchEvents.emit('agent-event', {
      timestamp: new Date().toISOString(),
      agent: session?.sellerAgent || 'worker',
      action: 'escrow_verified',
      type: 'escrow',
      sessionId,
      canPay,
      amount: session?.amount,
    });

    return { canPay };
  }

  /**
   * Release escrowed funds via 1Shot USDC transfer.
   * @param {AgentWallet} payerWallet - Orchestrator wallet
   * @param {string} sessionId - Escrow session to settle
   * @param {string} recipientAddress - Worker's wallet address
   */
  async releasePayment(payerWallet, sessionId, recipientAddress) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Escrow session ${sessionId} not found`);

    const result = await payerWallet.transfer(
      recipientAddress,
      session.amount,
      session.description
    );

    session.status = 'released';
    session.txId = result.txId;
    session.paidAt = new Date().toISOString();

    dispatchEvents.emit('agent-event', {
      timestamp: new Date().toISOString(),
      agent: session.buyerAgent,
      action: 'escrow_released',
      type: 'escrow',
      sessionId,
      amount: session.amount,
      seller: session.sellerAgent,
      txId: result.txId,
    });

    return result;
  }

  /**
   * Called by the 1Shot webhook handler when a tx is confirmed on-chain.
   */
  confirmByTxId(txId, txHash) {
    for (const session of this.sessions.values()) {
      if (session.txId === txId) {
        session.status = 'confirmed';
        session.txHash = txHash;
        dispatchEvents.emit('agent-event', {
          timestamp: new Date().toISOString(),
          agent: '1shot',
          action: 'checkout_confirmed',
          type: 'escrow',
          sessionId: session.sessionId,
          txHash,
        });
        return;
      }
    }
  }

  getAll() {
    return Array.from(this.sessions.values());
  }

  getPending() {
    return this.getAll().filter(s => s.status === 'pending' || s.status === 'preflight_ok');
  }
}

module.exports = EscrowManager;
