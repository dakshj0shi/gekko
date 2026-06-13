/**
 * 1Shot relayer stub — payments handled directly via ethers in wallet.js.
 * Kept so existing imports don't break.
 */
class OneShotClient {
  constructor(_apiKey) {}
  async submitTransaction() { return { status: 'noop' }; }
  async submitBatch()       { return []; }
  async getTransaction()    { return null; }
  async upgrade7702()       { return null; }
  verifyWebhookSignature()  { return false; }
}

module.exports = OneShotClient;
