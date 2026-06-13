const CircuitBreaker = require('./circuit-breaker');

const BASE_URL = process.env.VENICE_BASE_URL || 'https://api.venice.ai/api/v1';

const MODELS = {
  reasoning: process.env.VENICE_REASONING_MODEL || 'deepseek-v3.2',
  fast: process.env.VENICE_FAST_MODEL || 'mistral-small-2603',
  search: process.env.VENICE_SEARCH_MODEL || 'llama-3.3-70b',
};

class VeniceClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.breaker = new CircuitBreaker('venice');
  }

  async _request(path, body) {
    if (!this.breaker.canRequest()) {
      throw new Error('Venice API circuit breaker open — retrying in 30s');
    }

    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });

    const data = await res.json();

    if (!res.ok) {
      if (res.status >= 500) this.breaker.onFailure();
      throw new Error(`Venice API ${res.status}: ${JSON.stringify(data)}`);
    }

    this.breaker.onSuccess();
    return data;
  }

  /**
   * Chat completion — OpenAI-compatible.
   * Set venice_parameters.enable_web_search = 'on' for web search.
   */
  async chat(model, messages, options = {}) {
    return this._request('/chat/completions', {
      model,
      messages,
      ...options,
    });
  }

  /**
   * Web-search augmented chat. Venice routes the query through live web search
   * before generating a response.
   */
  async search(query, options = {}) {
    return this._request('/chat/completions', {
      model: options.model || MODELS.search,
      messages: [{ role: 'user', content: query }],
      venice_parameters: { enable_web_search: 'on' },
      ...options,
    });
  }

  /** Image generation via Venice. */
  async image(prompt, options = {}) {
    return this._request('/image/generate', {
      model: options.model || 'fluently-xl',
      prompt,
      ...options,
    });
  }
}

module.exports = { VeniceClient, VENICE_MODELS: MODELS };
