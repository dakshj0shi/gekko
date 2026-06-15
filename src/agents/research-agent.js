const BaseAgent = require('./base-agent');
const { VENICE_MODELS } = require('../venice');
const spawnManager = require('../spawn-manager');
const { canSpawn } = require('../capability-token');

class ResearchAgent extends BaseAgent {
  constructor(config) {
    super({ ...config, role: 'researcher' });
    this.spawnNodeId = null; // set when this agent is registered in spawn tree
  }

  async research(query, mode = null, opts = {}) {
    this.log('research_started', { query, mode, missionId: opts.missionId });

    const searchQuery = mode === 'investment'
      ? `DeFi yield opportunities APY protocol comparison risk: ${query}`
      : query;

    const isUrl = searchQuery.startsWith('http://') || searchQuery.startsWith('https://');

    // Spawn parallel child searches when token allows and query is complex enough
    const token = opts.token;
    const missionId = opts.missionId;
    const nodeId = opts.nodeId; // parent node in spawn tree

    const useSpawn = !isUrl && token && missionId && nodeId
      && canSpawn(token) && spawnManager.canSpawnChild(missionId, nodeId)
      && searchQuery.length > 30;

    let searchResults, supplementaryResults;

    if (useSpawn) {
      // Decompose into 2 parallel child searches
      const subQueries = this._buildSubQueries(searchQuery, mode);
      this.log('spawn_decomposing', {
        missionId,
        subQueries,
        reasoning: `Decomposing "${searchQuery.slice(0, 60)}" into ${subQueries.length} parallel child searches.`,
      });

      const childResults = await Promise.allSettled(
        subQueries.map((sq, i) => this._runChildSearch(missionId, nodeId, sq, i))
      );

      // Merge fulfilled results
      const successful = childResults.filter(r => r.status === 'fulfilled' && r.value?.result);
      searchResults = successful.length > 0
        ? successful.map(r => r.value.result).filter(Boolean)
        : await this._searchVenice(searchQuery, isUrl);

      supplementaryResults = null; // sub-searches cover supplementary
    } else {
      // Original single-agent flow
      searchResults = await this._searchVenice(searchQuery, isUrl);
      supplementaryResults = !isUrl ? await this._searchVeniceFallback(searchQuery) : null;
    }

    const findings = {
      query: searchQuery,
      scrapedData: null,
      searchResults,
      supplementaryResults,
      timestamp: new Date().toISOString(),
    };

    this.log('research_completed', {
      query,
      hasSearchResults: !!searchResults,
      hasSupplementary: !!supplementaryResults,
      spawned: useSpawn,
      providers: ['venice-search', supplementaryResults && 'venice-chat'].filter(Boolean),
    });

    return findings;
  }

  /** Run a single child search as a spawn node */
  async _runChildSearch(missionId, parentNodeId, subQuery, index) {
    const childName = `SearchAgent-${index + 1}`;
    const childNode = spawnManager.spawnChild(missionId, parentNodeId, childName, 'search', 0);
    if (!childNode) return { subQuery, result: null };

    try {
      const result = await this._searchVenice(subQuery, false);
      spawnManager.complete(missionId, childNode.id);
      this.log('child_search_completed', { childName, subQuery: subQuery.slice(0, 60), missionId });
      return { subQuery, result };
    } catch (err) {
      spawnManager.kill(missionId, childNode.id, err.message);
      this.log('child_search_failed', { childName, error: err.message, missionId });
      return { subQuery, result: null };
    }
  }

  /** Generate 2 sub-queries from the main query */
  _buildSubQueries(query, mode) {
    if (mode === 'investment') {
      return [
        `${query} — APY rates, yields, and protocol performance`,
        `${query} — risks, audits, and security considerations`,
      ];
    }
    return [
      `${query} — key metrics, data, and current state`,
      `${query} — trends, challenges, and future outlook`,
    ];
  }

  /** Primary: Venice web-search augmented chat. */
  async _searchVenice(query, isUrl) {
    try {
      const result = await this.callAPI('venice', 'search', {
        q: isUrl ? `site:${query}` : query,
        model: VENICE_MODELS.search,
        venice_parameters: { enable_web_search: 'on' },
      });
      this.log('venice_search_completed', { query: query.slice(0, 80) });
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
      this.log('venice_chat_fallback_completed', { query: query.slice(0, 80) });
      return result.data;
    } catch (err) {
      this.log('venice_chat_fallback_failed', { error: err.message });
      return null;
    }
  }
}

module.exports = ResearchAgent;
