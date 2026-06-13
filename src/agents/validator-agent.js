const BaseAgent = require('./base-agent');
const { VENICE_MODELS } = require('../venice');

const LLM_PROVIDERS = [
  {
    name: 'venice-reasoning',
    endpoint: 'chat',
    buildBody: (prompt) => ({
      model: VENICE_MODELS.reasoning,
      messages: [
        { role: 'system', content: 'You are a fact-checking agent. Evaluate research findings for accuracy, flag unsupported claims, and rate overall confidence. Be concise.' },
        { role: 'user', content: prompt },
      ],
    }),
  },
  {
    name: 'venice-fast',
    endpoint: 'chat',
    buildBody: (prompt) => ({
      model: VENICE_MODELS.fast,
      messages: [
        { role: 'system', content: 'You are a fact-checking agent. Evaluate research findings for accuracy, flag unsupported claims, and rate overall confidence. Be concise.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 2048,
      temperature: 0.3,
    }),
  },
];

class ValidatorAgent extends BaseAgent {
  constructor(config) {
    super({ ...config, role: 'validator' });
  }

  async validate(researchFindings) {
    this.log('validation_started', { inputSources: researchFindings.length });

    const prompt = this._buildPrompt(researchFindings);

    for (const provider of LLM_PROVIDERS) {
      try {
        const result = await this.callAPI(provider.name, provider.endpoint, provider.buildBody(prompt));
        this.log('validation_completed', { provider: provider.name });

        const content = this._extractContent(result);
        return {
          validated: true,
          report: content,
          provider: provider.name,
          sourcesChecked: researchFindings.length,
          timestamp: new Date().toISOString(),
        };
      } catch (err) {
        this.log('validation_provider_failed', { provider: provider.name, error: err.message });
      }
    }

    this.log('validation_skipped', { reason: 'All Venice providers failed' });
    return {
      validated: false,
      report: 'Validation skipped — Venice AI unavailable.',
      provider: 'passthrough',
      sourcesChecked: researchFindings.length,
      timestamp: new Date().toISOString(),
    };
  }

  _extractContent(result) {
    const data = result.data?.choices?.[0]?.message?.content
      || result.data?.choices?.[0]?.text
      || result.data?.result
      || (typeof result.data === 'string' ? result.data : JSON.stringify(result.data));
    return data;
  }

  _buildPrompt(findings) {
    const sections = findings.map((f, i) => {
      let content = `## Source ${i + 1}: ${f.query}\n`;
      if (f.searchResults) {
        const str = typeof f.searchResults === 'string' ? f.searchResults : JSON.stringify(f.searchResults);
        content += `Search results:\n${str.slice(0, 2000)}\n\n`;
      }
      return content;
    });

    return `Fact-check the following research findings. For each source:
1. Rate confidence (high/medium/low)
2. Flag any claims that seem unsupported or outdated
3. Note if key information is missing
4. Give an overall quality score (1-10)

Research findings:\n\n${sections.join('\n')}

Respond in this format:
**Overall Quality:** X/10
**Confidence:** high/medium/low
**Issues Found:** (list or "none")
**Recommendation:** proceed / needs more research`;
  }
}

module.exports = ValidatorAgent;
