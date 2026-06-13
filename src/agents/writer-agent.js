const BaseAgent = require('./base-agent');
const { VENICE_MODELS } = require('../venice');

const MAX_OUTPUT_TOKENS = 4096;
const PRIMARY_TRUNCATE_LIMIT = 3000;
const SUPPLEMENTARY_TRUNCATE_LIMIT = 2000;

const LLM_PROVIDERS = [
  {
    name: 'venice',
    endpoint: 'chat',
    buildBody: (prompt) => ({
      model: VENICE_MODELS.fast,
      messages: [
        { role: 'system', content: 'You are a professional report writer. Produce clear, well-structured reports with actionable takeaways.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: MAX_OUTPUT_TOKENS,
      temperature: 0.7,
    }),
  },
];

class WriterAgent extends BaseAgent {
  constructor(config) {
    super({ ...config, role: 'writer' });
  }

  async synthesize(researchFindings, outputFormat = 'report') {
    this.log('synthesis_started', { inputSources: researchFindings.length, format: outputFormat });

    const prompt = this._buildPrompt(researchFindings, outputFormat);

    for (const provider of LLM_PROVIDERS) {
      try {
        const result = await this.callAPI(provider.name, provider.endpoint, provider.buildBody(prompt));
        this.log('synthesis_completed', { provider: provider.name, format: outputFormat });

        const content = this._extractContent(result);
        return {
          report: content,
          format: outputFormat,
          provider: provider.name,
          sourcesUsed: researchFindings.length,
          timestamp: new Date().toISOString(),
        };
      } catch (err) {
        this.log('synthesis_provider_failed', { provider: provider.name, error: err.message });
      }
    }

    this.log('synthesis_fallback_used', { reason: 'Venice AI unavailable' });
    return {
      report: this._fallbackSummary(researchFindings),
      format: outputFormat,
      provider: 'fallback',
      sourcesUsed: researchFindings.length,
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

  _buildPrompt(findings, format) {
    const sections = findings.map((f, i) => {
      let content = `## Source ${i + 1}: ${f.query}\n`;
      if (f.searchResults) {
        content += `Search results (via Venice AI):\n${this._truncate(f.searchResults, PRIMARY_TRUNCATE_LIMIT)}\n\n`;
      }
      if (f.supplementaryResults) {
        content += `Supplementary findings:\n${this._truncate(f.supplementaryResults, SUPPLEMENTARY_TRUNCATE_LIMIT)}\n\n`;
      }
      return content;
    });

    const today = new Date().toISOString().split('T')[0];
    return `Based on the following research findings, create a clear, professional ${format} with key insights and actionable takeaways.

IMPORTANT: Do NOT use placeholder text like "[Your Name]", "[Current Date]", or "[Link]". Instead:
- Use "Gekko Research Team" as the author
- Use "${today}" as the date
- For source links, use actual URLs from the research data if available, or omit the links section

Research findings:\n\n${sections.join('\n')}`;
  }

  _truncate(data, limit) {
    const str = typeof data === 'string' ? data : JSON.stringify(data);
    return str.slice(0, limit);
  }

  _fallbackSummary(findings) {
    const sections = findings.map((f, i) => {
      let section = `## Finding ${i + 1}: ${f.query}\n`;
      if (f.searchResults) section += '- Search results obtained via Venice AI\n';
      if (!f.searchResults) section += '- No data collected (Venice AI unavailable)\n';
      return section;
    });

    return `# Research Report\n\n${sections.join('\n')}\n\n---\nGenerated at: ${new Date().toISOString()}\nNote: Full synthesis requires a funded agent wallet for x402 Venice AI access.`;
  }
}

module.exports = WriterAgent;
