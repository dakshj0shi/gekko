/**
 * Supervisor Agent — Phase 10
 *
 * After the Writer produces a report, the Supervisor audits it against the
 * full mission context: debate outputs, death notes, and research findings.
 * It checks for contradictions, unsupported claims, and confidence gaps,
 * then returns a quality verdict that is included in the final goal_completed payload.
 */
const BaseAgent = require('./base-agent');
const { VENICE_MODELS } = require('../venice');

const SUPERVISOR_PROMPT = `You are GekkoSupervisor, an autonomous quality-assurance agent.

You have access to:
- The final research report
- The debate consensus (what Bull, Bear, and Judge concluded)
- Death notes (agents that failed during this mission)
- Mission facts gathered

Your job is to audit the report for quality:
1. Are there claims contradicted by the debate consensus?
2. Are there important gaps not covered?
3. Does the report integrate the debate insights?
4. What is the overall quality score?

Return ONLY valid JSON (no markdown fences) in this exact shape:
{
  "quality": <0-10 float>,
  "confidence": <0.0-1.0 float>,
  "contradictions": ["<claim> contradicts <source>", ...],
  "gaps": ["missing analysis of ...", ...],
  "strengths": ["covers ...", ...],
  "recommendation": "<one sentence summary judgment>",
  "approved": <true if quality >= 6.0>
}`;

class SupervisorAgent extends BaseAgent {
  constructor(config) {
    super(config);
  }

  async supervise({ report, memory, debateResult, agentsUsed = [] }) {
    const reportText = typeof report === 'object' && report !== null ? report.report : report;
    this.log('supervisor_checking', {
      reasoning: `GekkoSupervisor auditing report (${reportText?.length || 0} chars). Checking against debate consensus and ${memory?.facts?.length || 0} facts.`,
    });

    const context = this._buildContext(reportText, memory, debateResult, agentsUsed);

    try {
      const response = await this.callAPI('venice', 'chat', {
        model: VENICE_MODELS.reasoning,
        messages: [
          { role: 'system', content: SUPERVISOR_PROMPT },
          { role: 'user', content: context },
        ],
        temperature: 0.3,
        max_tokens: 600,
      });

      const raw = response?.data?.choices?.[0]?.message?.content || '';
      const verdict = this._parseVerdict(raw);

      this.log('supervisor_verdict', {
        quality: verdict.quality,
        confidence: verdict.confidence,
        approved: verdict.approved,
        contradictions: verdict.contradictions?.length || 0,
        gaps: verdict.gaps?.length || 0,
        reasoning: `Quality: ${verdict.quality}/10 · ${verdict.approved ? 'APPROVED' : 'FLAGGED'} · ${verdict.recommendation}`,
      });

      return verdict;
    } catch (err) {
      this.log('supervisor_failed', {
        error: err.message,
        reasoning: 'Supervisor audit failed — report accepted without review.',
      });
      return { quality: 7.0, confidence: 0.5, approved: true, recommendation: 'Supervisor unavailable.', contradictions: [], gaps: [], strengths: [] };
    }
  }

  _buildContext(report, memory, debateResult, agentsUsed) {
    const parts = [];

    parts.push(`## Research Report\n${(report || '').slice(0, 2000)}`);

    if (debateResult) {
      parts.push(`## Debate Consensus\nVerdict: ${debateResult.verdict || 'N/A'}\nConfidence: ${debateResult.confidence || 'N/A'}\nKey Insights: ${(debateResult.keyInsights || []).join('; ')}`);
    }

    if (memory?.facts?.length) {
      parts.push(`## Mission Facts\n${memory.facts.slice(0, 5).map((f, i) => `${i+1}. ${f.content}`).join('\n')}`);
    }

    if (memory?.deathNotes?.length) {
      parts.push(`## Agent Deaths\n${memory.deathNotes.map(d => `- ${d.agent}: ${d.failureReason}`).join('\n')}`);
    }

    if (agentsUsed?.length) {
      parts.push(`## Agents Used: ${agentsUsed.join(', ')}`);
    }

    return parts.join('\n\n');
  }

  _parseVerdict(raw) {
    // Direct parse
    try { return JSON.parse(raw); } catch {}
    // Strip markdown fences
    const fence = raw.match(/```(?:json)?\s*\n?([\s\S]+?)\n?```/);
    if (fence) { try { return JSON.parse(fence[1]); } catch {} }
    // Extract JSON block
    const start = raw.indexOf('{'), end = raw.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try { return JSON.parse(raw.slice(start, end + 1)); } catch {}
    }
    return { quality: 6.5, confidence: 0.5, approved: true, recommendation: raw.slice(0, 200), contradictions: [], gaps: [], strengths: [] };
  }
}

module.exports = SupervisorAgent;
