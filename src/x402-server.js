/**
 * x402 payment middleware factory using @x402/express + @metamask/x402.
 *
 * When X402_ENABLED=true, the Venice proxy routes require a valid ERC-7710
 * delegation payment verified through the MetaMask facilitator.
 *
 * When X402_ENABLED=false (default for demo), the middleware passes all requests
 * through so the pipeline works without funded wallets.
 *
 * Server scheme: x402ExactEvmErc7710ServerScheme — routes payment verification
 * and settlement through the MetaMask facilitator at X402.facilitatorUrl.
 */
const { X402, NETWORK } = require('./config');

const NETWORK_ID = `eip155:${NETWORK.chainId}`;

/**
 * Build and return the paymentMiddleware from @x402/express.
 * Uses dynamic import because @x402/express is ESM.
 * Called once at server startup.
 */
async function createX402Middleware() {
  if (!X402.enabled) {
    // Pass-through middleware — no payment required (demo mode)
    return (_req, _res, next) => next();
  }

  const { paymentMiddleware, x402ResourceServer } = await import('@x402/express');
  const { x402ExactEvmErc7710ServerScheme } = await import('@metamask/x402');

  if (!X402.treasuryAddress || X402.treasuryAddress === '0x0000000000000000000000000000000000000000') {
    console.warn('[x402] X402_TREASURY_ADDRESS not set — x402 middleware disabled');
    return (_req, _res, next) => next();
  }

  const resourceServer = new x402ResourceServer().register(
    NETWORK_ID,
    new x402ExactEvmErc7710ServerScheme()
  );

  return paymentMiddleware(
    {
      [`POST /api/venice/chat`]: {
        accepts: [
          {
            scheme: 'exact',
            price: X402.chatPrice,
            network: NETWORK_ID,
            payTo: X402.treasuryAddress,
            extra: { assetTransferMethod: 'erc7710' },
          },
        ],
        description: 'Venice AI chat inference',
        mimeType: 'application/json',
      },
      [`POST /api/venice/search`]: {
        accepts: [
          {
            scheme: 'exact',
            price: X402.searchPrice,
            network: NETWORK_ID,
            payTo: X402.treasuryAddress,
            extra: { assetTransferMethod: 'erc7710' },
          },
        ],
        description: 'Venice AI web search',
        mimeType: 'application/json',
      },
    },
    resourceServer
  );
}

module.exports = { createX402Middleware, NETWORK_ID };
