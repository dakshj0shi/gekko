const BaseAgent = require('./base-agent');
const { VENICE_MODELS } = require('../venice');

class ResearchAgent extends BaseAgent {
  constructor(config) {
    super({ ...config, role: 'researcher' });
  }

  async research(query) {
    this.log('research_started', { query });

    const isUrl = query.startsWith('http://') || query.startsWith('https://');
    const searchResults = await this._searchVenice(query, isUrl);
    const supplementaryResults = !isUrl ? await this._searchVeniceFallback(query) : null;

    const findings = {
      query,
      scrapedData: null,
      searchResults,
      supplementaryResults,
      timestamp: new Date().toISOString(),
    };

    this.log('research_completed', {
      query,
      hasSearchResults: !!searchResults,
      hasSupplementary: !!supplementaryResults,
      providers: ['venice-search', supplementaryResults && 'venice-chat'].filter(Boolean),
    });

    return findings;
  }

  /** Primary: Venice web-search augmented chat. */
  async _searchVenice(query, isUrl) {
    try {
      const result = await this.callAPI('venice', 'search', {
        q: isUrl ? `site:${query}` : query,
        model: VENICE_MODELS.search,
        venice_parameters: { enable_web_search: 'on' },
      });
      this.log('venice_search_completed', { query });
      return result.data;
    } catch (err) {
      this.log('venice_search_failed', { error: err.message });
      return null;
    }
  }

  /** Fallback: Venice reasoning chat for supplementary context. */
  async _searchVeniceFallback(query) {
    try {
      const result = await this.callAPI('venice', 'chat', {
        model: VENICE_MODELS.fast,
        messages: [
          { role: 'system', content: 'You are a research assistant. Provide factual, well-sourced information.' },
          { role: 'user', content: `Research and summarize: ${query}` },
        ],
        venice_parameters: { enable_web_search: 'on' },
      });
      this.log('venice_chat_fallback_completed', { query });
      return result.data;
    } catch (err) {
      this.log('venice_chat_fallback_failed', { error: err.message });
      return null;
    }
  }
}

module.exports = ResearchAgent;
