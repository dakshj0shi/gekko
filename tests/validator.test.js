/**
 * Unit tests for the Validator agent.
 *
 * Tests fact-checking pipeline, provider fallback, and prompt generation.
 */
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

process.env.RESEARCHER_LOCUS_API_KEY = 'test-res-key';
process.env.RESEARCHER_WALLET_ADDRESS = '0xRES';
// Validator uses researcher's wallet — no separate credentials

const ValidatorAgent = require('../src/agents/validator-agent');

describe('ValidatorAgent', () => {
  let validator;

  beforeEach(() => {
    validator = new ValidatorAgent({
      name: 'TestValidator',
      locusApiKey: 'test-val-key',
      walletAddress: '0xVAL',
    });
  });

  it('should have correct role', () => {
    assert.equal(validator.role, 'validator');
    assert.equal(validator.name, 'TestValidator');
  });

  it('should validate research findings with mock LLM', async () => {
    validator.callAPI = async () => ({
      data: {
        choices: [{ message: { content: '**Overall Quality:** 8/10\n**Confidence:** high\n**Issues Found:** none\n**Recommendation:** proceed' } }],
      },
    });

    const findings = [
      { query: 'DeFi on Base', scrapedData: 'Base is an L2...', searchResults: 'Uniswap, Aave...', timestamp: new Date().toISOString() },
    ];

    const result = await validator.validate(findings);
    assert.equal(result.validated, true);
    assert.equal(result.sourcesChecked, 1);
    assert.ok(result.report.includes('8/10'));
    assert.equal(result.provider, 'venice-reasoning');
  });

  it('should fall back to passthrough when all providers fail', async () => {
    validator.callAPI = async () => { throw new Error('API unavailable'); };

    const findings = [{ query: 'test', scrapedData: null, searchResults: null, timestamp: new Date().toISOString() }];
    const result = await validator.validate(findings);

    assert.equal(result.validated, false);
    assert.equal(result.provider, 'passthrough');
    assert.equal(result.sourcesChecked, 1);
  });

  it('should try venice-reasoning first then venice-fast', async () => {
    const callOrder = [];
    validator.callAPI = async (provider) => {
      callOrder.push(provider);
      if (provider === 'venice-reasoning') throw new Error('Reasoning down');
      return {
        data: {
          choices: [{ message: { content: 'Validated via Venice Fast' } }],
        },
      };
    };

    const findings = [{ query: 'test', scrapedData: 'data', searchResults: null, timestamp: new Date().toISOString() }];
    const result = await validator.validate(findings);

    assert.deepEqual(callOrder, ['venice-reasoning', 'venice-fast']);
    assert.equal(result.provider, 'venice-fast');
    assert.equal(result.validated, true);
  });

  it('should build prompt with source data', () => {
    const findings = [
      { query: 'test query', scrapedData: 'scraped content here', searchResults: 'search results here' },
    ];
    const prompt = validator._buildPrompt(findings);
    assert.ok(prompt.includes('test query'));
    assert.ok(prompt.includes('scraped content here'));
    assert.ok(prompt.includes('search results here'));
    assert.ok(prompt.includes('Overall Quality'));
  });
});
