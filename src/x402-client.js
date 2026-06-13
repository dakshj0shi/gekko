/**
 * x402 payment client for agents.
 *
 * Wraps fetch() with x402 protocol support:
 *   1. Make request
 *   2. If 402 received, sign a payment header using agent's wallet
 *   3. Retry with X-PAYMENT header
 *   4. Return the paid response
 */
const { ethers } = require('ethers');
const { v4: uuidv4 } = require('uuid');

class X402Client {
  /**
   * @param {AgentWallet} agentWallet - The agent's wallet for signing payments
   */
  constructor(agentWallet) {
    this.wallet = agentWallet;
  }

  /**
   * Make an HTTP request with x402 payment support.
   * Automatically handles 402 responses by signing and retrying.
   */
  async fetch(url, options = {}) {
    // First attempt — no payment
    const res = await fetch(url, options);

    if (res.status !== 402) {
      return res;
    }

    // Parse payment requirements from 402 response
    const body = await res.json();
    const requirements = body.paymentRequired;

    if (!requirements) {
      throw new Error('402 response missing paymentRequired field');
    }

    // Sign the payment
    const paymentHeader = await this._signPayment(requirements, url);

    // Retry with payment
    const paidRes = await fetch(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        'X-PAYMENT': paymentHeader,
      },
    });

    return paidRes;
  }

  /**
   * Sign a payment authorization for x402.
   * Returns a base64-encoded JSON payment object.
   * @private
   */
  async _signPayment(requirements, resource) {
    const nonce = uuidv4();

    const message = JSON.stringify({
      recipient: requirements.recipient,
      amount: requirements.amount,
      token: requirements.token,
      chain: requirements.chain,
      nonce,
      resource,
    });

    const signature = await this.wallet.signMessage(message);

    const payment = {
      recipient: requirements.recipient,
      amount: requirements.amount,
      token: requirements.token,
      chain: requirements.chain,
      nonce,
      resource,
      signature,
      payer: this.wallet.address,
    };

    return Buffer.from(JSON.stringify(payment)).toString('base64');
  }

  /**
   * Convenience: fetch JSON with x402 support.
   */
  async fetchJSON(url, options = {}) {
    const res = await this.fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`x402 request failed ${res.status}: ${err}`);
    }

    return res.json();
  }
}

module.exports = X402Client;
