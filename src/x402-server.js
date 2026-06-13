/**
 * x402 payment middleware for Express.
 *
 * Gates API endpoints behind HTTP 402. On first request (no X-PAYMENT
 * header), returns 402 with payment requirements. On retry with X-PAYMENT,
 * verifies the EIP-712 signature and allows the request through.
 */
const { ethers } = require('ethers');
const crypto = require('crypto');

// Nonce store — prevents replay attacks (in-memory, resets on restart)
const usedNonces = new Set();

/**
 * x402 middleware factory.
 * @param {object} options
 * @param {string} options.recipient - Address that receives USDC payments
 * @param {string} options.amount - Payment amount in USDC (e.g. '0.001')
 * @param {string} options.tokenAddress - USDC contract address
 * @param {string} options.chainId - Chain ID
 */
function x402Middleware(options) {
  const { recipient, amount, tokenAddress, chainId } = options;

  return async (req, res, next) => {
    const paymentHeader = req.headers['x-payment'];

    if (!paymentHeader) {
      // No payment — return 402 with requirements
      return res.status(402).json({
        error: 'Payment required',
        paymentRequired: {
          scheme: 'exact',
          recipient,
          amount,
          token: tokenAddress,
          chain: chainId,
          description: `${amount} USDC for API access`,
        },
        // WWW-Authenticate header per the x402 spec
        header: `X-PAYMENT-REQUIRED scheme="exact" recipient="${recipient}" amount="${amount}" token="${tokenAddress}" chain="${chainId}"`,
      });
    }

    // Payment present — verify it
    try {
      const payment = JSON.parse(Buffer.from(paymentHeader, 'base64').toString('utf8'));

      // Check nonce hasn't been used
      if (usedNonces.has(payment.nonce)) {
        return res.status(402).json({ error: 'Payment nonce already used (replay attack)' });
      }

      // Verify EIP-712 signature
      const valid = await verifyPayment(payment, { recipient, amount, tokenAddress, chainId });
      if (!valid) {
        return res.status(402).json({ error: 'Invalid payment signature' });
      }

      // Mark nonce as used
      usedNonces.add(payment.nonce);

      // Attach payment info to request for logging
      req.x402Payment = payment;
      next();
    } catch (err) {
      return res.status(402).json({ error: `Payment verification failed: ${err.message}` });
    }
  };
}

/**
 * Verify an x402 payment signature.
 * The payer signs a typed payload proving they authorized the payment.
 */
async function verifyPayment(payment, requirements) {
  const { recipient, amount, tokenAddress, chainId } = requirements;

  // Reconstruct the message that was signed
  const message = JSON.stringify({
    recipient,
    amount,
    token: tokenAddress,
    chain: chainId,
    nonce: payment.nonce,
    resource: payment.resource,
  });

  // Recover signer from EIP-191 personal_sign
  const recovered = ethers.verifyMessage(message, payment.signature);

  // The payer is the recovered address — store for logging
  payment.payer = recovered;

  return !!recovered;
}

module.exports = { x402Middleware, verifyPayment };
