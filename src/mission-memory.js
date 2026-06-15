const dispatchEvents = require('./event-bus');

const memories = new Map(); // missionId → MissionMemory

class MissionMemory {
  constructor(missionId) {
    this.missionId = missionId;
    this.createdAt = new Date().toISOString();
    this.facts = [];
    this.citations = [];
    this.deathNotes = [];
    this.debateOutputs = [];
    this.completedTasks = [];
    this.failedTasks = [];
    this.agentHistory = [];
    this.reasoningSummaries = [];
  }

  addFact({ content, source, confidence = 0.8, agentName }) {
    const fact = { content, source, confidence, agentName, timestamp: new Date().toISOString() };
    this.facts.push(fact);
    this._emit('memory_fact_added', { factCount: this.facts.length });
    return fact;
  }

  addCitation({ title, url, excerpt, confidence = 0.7 }) {
    const citation = { title, url, excerpt, confidence, timestamp: new Date().toISOString() };
    this.citations.push(citation);
    return citation;
  }

  addDeathNote({ agent, failureReason, confidence = 0 }) {
    const note = { agent, failureReason, confidence, timestamp: new Date().toISOString() };
    this.deathNotes.push(note);
    this._emit('death_note_created', { agent, failureReason });
    return note;
  }

  addDebateOutput({ bullSummary, bearSummary, consensus, confidence, bullStrength, bearStrength }) {
    const output = { bullSummary, bearSummary, consensus, confidence, bullStrength, bearStrength, timestamp: new Date().toISOString() };
    this.debateOutputs.push(output);
    this._emit('memory_updated', { type: 'debate', missionId: this.missionId });
    return output;
  }

  recordAgent(agentName, action, result = null) {
    this.agentHistory.push({ agentName, action, result, timestamp: new Date().toISOString() });
  }

  addCompletedTask({ task, agent, result, duration }) {
    this.completedTasks.push({ task, agent, result, duration, timestamp: new Date().toISOString() });
  }

  addFailedTask({ task, agent, reason }) {
    this.failedTasks.push({ task, agent, reason, timestamp: new Date().toISOString() });
  }

  // Returns a condensed context string for the writer to reference
  getContext() {
    const parts = [];

    if (this.facts.length > 0) {
      parts.push('## Key Facts\n' + this.facts.slice(-10).map(f => `- ${f.content} (confidence: ${f.confidence})`).join('\n'));
    }

    if (this.debateOutputs.length > 0) {
      const d = this.debateOutputs[this.debateOutputs.length - 1];
      parts.push(`## Debate Consensus\n${d.consensus}\nConfidence: ${d.confidence}`);
    }

    if (this.deathNotes.length > 0) {
      parts.push('## Failures Noted\n' + this.deathNotes.map(n => `- ${n.agent}: ${n.failureReason}`).join('\n'));
    }

    return parts.join('\n\n');
  }

  getSummary() {
    return {
      missionId: this.missionId,
      facts: this.facts.length,
      citations: this.citations.length,
      deathNotes: this.deathNotes.length,
      debates: this.debateOutputs.length,
      completedTasks: this.completedTasks.length,
      failedTasks: this.failedTasks.length,
    };
  }

  toJSON() {
    return {
      missionId: this.missionId,
      createdAt: this.createdAt,
      facts: this.facts,
      citations: this.citations,
      deathNotes: this.deathNotes,
      debateOutputs: this.debateOutputs,
      completedTasks: this.completedTasks,
      failedTasks: this.failedTasks,
      agentHistory: this.agentHistory,
    };
  }

  _emit(action, details = {}) {
    dispatchEvents.emit('agent-event', {
      timestamp: new Date().toISOString(),
      agent: 'MissionMemory',
      role: 'memory',
      action,
      missionId: this.missionId,
      ...details,
    });
  }
}

function getMemory(missionId) {
  if (!memories.has(missionId)) {
    memories.set(missionId, new MissionMemory(missionId));
  }
  return memories.get(missionId);
}

function getAllMemories() {
  return Array.from(memories.values()).map(m => m.getSummary());
}

// Keep at most 20 mission memories (oldest evicted first)
function evictOld() {
  if (memories.size > 20) {
    const oldest = memories.keys().next().value;
    memories.delete(oldest);
  }
}

module.exports = { MissionMemory, getMemory, getAllMemories };
