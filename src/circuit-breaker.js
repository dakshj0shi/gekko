const CB_THRESHOLD = 5;
const CB_RESET_MS = 30000;

class CircuitBreaker {
  constructor(label = '') {
    this.label = label;
    this.failures = 0;
    this.state = 'closed';
    this.openedAt = 0;
  }

  canRequest() {
    if (this.state === 'closed') return true;
    if (this.state === 'open' && Date.now() - this.openedAt > CB_RESET_MS) {
      this.state = 'half-open';
      return true;
    }
    return this.state === 'half-open';
  }

  onSuccess() {
    this.failures = 0;
    this.state = 'closed';
  }

  onFailure() {
    this.failures++;
    if (this.failures >= CB_THRESHOLD) {
      this.state = 'open';
      this.openedAt = Date.now();
    }
  }
}

module.exports = CircuitBreaker;
