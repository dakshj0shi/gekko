const BaseAgent = require('./base-agent');
const { VENICE_MODELS } = require('../venice');

const MAX_FINDINGS_CHARS = 3000;

function truncate(str, max) {
  const s = typeof str === 'string' ? str : JSON.stringify(str);
  return s.length > max ? s.slice(0, max) + '…' : s;
}

function extractText(result) {
  return result.data?.choices?.[0]?.message?.content
    || result.data?.choices?.[0]?.text
    || result.data?.result
    || (typeof result.data === 'string' ? result.data : JSON.stringify(result.data));
}

// ── Bull Agent ────────────────────────────────────────────────────

class BullAgent extends BaseAgent {
  constructor(config) {
    super({ ...config, name: config.name || 'GekkoBull', role: 'bull' });
  }

  async argue(researchSummary) {
    this.log('bull_thinking', { length: researchSummary.length });
    try {
      const result = await this.callAPI('venice', 'chat', {
        model: VENICE_MODELS.reasoning,
        messages: [
          {
            role: 'system',
            content: 'You are an optimistic analyst. Build the strongest possible BULLISH case. Be specific, cite evidence from the research. Be concise — 3-5 key points maximum.',
          },
          {
            role: 'user',
            content: `Based on this research, build the strongest bullish argument:\n\n${researchSummary}`,
          },
        ],
        max_tokens: 800,
        temperature: 0.7,
      });
      const argument = extractText(result);
      this.log('bull_argument', { preview: argument?.slice(0, 100) });
      return { position: 'bull', argument, confidence: 0.7 };
    } catch (err) {
      this.log('bull_failed', { error: err.message });
      return { position: 'bull', argument: 'Bull analysis unavailable.', confidence: 0.5 };
    }
  }
}

// ── Bear Agent ────────────────────────────────────────────────────

class BearAgent extends BaseAgent {
  constructor(config) {
    super({ ...config, name: config.name || 'GekkoBear', role: 'bear' });
  }

  async argue(researchSummary) {
    this.log('bear_thinking', { length: researchSummary.length });
    try {
      const result = await this.callAPI('venice', 'chat', {
        model: VENICE_MODELS.reasoning,
        messages: [
          {
            role: 'system',
            content: 'You are a skeptical analyst. Build the strongest possible BEARISH case. Identify risks, weaknesses, contradictions. Be concise — 3-5 key points maximum.',
          },
          {
            role: 'user',
            content: `Based on this research, build the strongest bearish argument:\n\n${researchSummary}`,
          },
        ],
        max_tokens: 800,
        temperature: 0.7,
      });
      const argument = extractText(result);
      this.log('bear_argument', { preview: argument?.slice(0, 100) });
      return { position: 'bear', argument, confidence: 0.7 };
    } catch (err) {
      this.log('bear_failed', { error: err.message });
      return { position: 'bear', argument: 'Bear analysis unavailable.', confidence: 0.5 };
    }
  }
}

// ── Judge Agent ───────────────────────────────────────────────────

class JudgeAgent extends BaseAgent {
  constructor(config) {
    super({ ...config, name: config.name || 'GekkoJudge', role: 'judge' });
  }

  async judge(bullArg, bearArg) {
    this.log('judge_thinking', {});
    try {
      const result = await this.callAPI('venice', 'chat', {
        model: VENICE_MODELS.reasoning,
        messages: [
          {
            role: 'system',
            content: 'You are an impartial judge. Evaluate both arguments and produce a balanced consensus. Return a JSON object with: { "consensus": "summary", "confidence": 0-1, "bullStrength": 0-1, "bearStrength": 0-1, "verdict": "bullish|bearish|neutral", "keyInsights": ["point1", "point2", "point3"] }. Return ONLY valid JSON.',
          },
          {
            role: 'user',
            content: `BULL argument:\n${bullArg}\n\nBEAR argument:\n${bearArg}\n\nProvide your verdict as JSON.`,
          },
        ],
        max_tokens: 600,
        temperature: 0.3,
      });
      const raw = extractText(result);
      const verdict = this._parseVerdict(raw);
      this.log('judge_verdict', { confidence: verdict.confidence, verdict: verdict.verdict });
      return verdict;
    } catch (err) {
      this.log('judge_failed', { error: err.message });
      return {
        consensus: 'Unable to reach consensus due to technical issues.',
        confidence: 0.5,
        bullStrength: 0.5,
        bearStrength: 0.5,
        verdict: 'neutral',
        keyInsights: [],
      };
    }
  }

  _parseVerdict(raw) {
    try {
      // Try direct parse
      return JSON.parse(raw);
    } catch {
      // Try extracting JSON from markdown block
      const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/) || raw.match(/\{[\s\S]*\}/);
      if (match) {
        try { return JSON.parse(match[1] || match[0]); } catch { /* fall through */ }
      }
      return {
        consensus: raw?.slice(0, 300) || 'No consensus reached.',
        confidence: 0.5,
        bullStrength: 0.5,
        bearStrength: 0.5,
        verdict: 'neutral',
        keyInsights: [],
      };
    }
  }
}

// ── runDebate — orchestrated 3-agent debate ───────────────────────

/**
 * Runs Bull → Bear → Judge debate on research findings.
 * Returns a debate result regardless of individual agent failures.
 * All three agents reuse the same fetchWithPayment for x402 payments.
 */
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function runDebate(researchFindings, agentConfig) {
  const { fetchWithPayment, agentWallet } = agentConfig;
  const sharedConfig = { fetchWithPayment, agentWallet };

  const bull  = new BullAgent(sharedConfig);
  const bear  = new BearAgent(sharedConfig);
  const judge = new JudgeAgent(sharedConfig);

  // Summarize research into a compact string for the debate agents
  const researchSummary = truncate(
    researchFindings.map((f, i) =>
      `[Source ${i + 1}: ${f.query}]\n${
        truncate(f.searchResults || f.supplementaryResults || '(no data)', 800)
      }`
    ).join('\n\n'),
    MAX_FINDINGS_CHARS
  );

  const bullResult  = await bull.argue(researchSummary);
  await sleep(3000); // let audience read the bull argument
  const bearResult  = await bear.argue(researchSummary);
  await sleep(3000); // let audience read the bear argument
  const judgeResult = await judge.judge(bullResult.argument, bearResult.argument);
  await sleep(2000); // let audience read the verdict

  return {
    bullArgument:  bullResult.argument,
    bearArgument:  bearResult.argument,
    consensus:     judgeResult.consensus,
    confidence:    judgeResult.confidence,
    bullStrength:  judgeResult.bullStrength,
    bearStrength:  judgeResult.bearStrength,
    verdict:       judgeResult.verdict,
    keyInsights:   judgeResult.keyInsights || [],
    timestamp:     new Date().toISOString(),
  };
}

module.exports = { BullAgent, BearAgent, JudgeAgent, runDebate };
