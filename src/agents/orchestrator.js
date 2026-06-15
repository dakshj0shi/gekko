const BaseAgent = require('./base-agent');
const { BUDGET } = require('../config');
const { validatePermissionsOnTask } = require('../permissions');
const { createToken, createChildToken, canSpawn } = require('../capability-token');
const { getMemory } = require('../mission-memory');
const spawnManager = require('../spawn-manager');
const { runDebate } = require('./debate-agent');
const SupervisorAgent = require('./supervisor-agent');
const { v4: uuidv4 } = require('uuid');

const sleep = ms => new Promise(r => setTimeout(r, ms));

const MIN_BALANCE_USDC = BUDGET.minBalance;
const DEFAULT_MAX_PRICE = BUDGET.defaultMaxPrice;
const CAPABILITY_MAP = { research: 'research', validate: 'validation', write: 'writing' };
const ROLE_MAP = { research: 'researcher', validate: 'validator', write: 'writer' };

class OrchestratorAgent extends BaseAgent {
  constructor(config) {
    super({ ...config, role: 'orchestrator' });
    this.workers = new Map();
    this.registry = config.registry || null;
    this.escrowManager = config.escrowManager || null;
    this.budget = { total: 0, spent: 0, perTask: 0 };
    this.tasks = [];
    this.permissionContext = null;
    this._demoDied = false; // tracks if demo-mode death has fired this mission
  }

  registerWorker(agent) {
    this.workers.set(agent.role, agent);
    this.log('worker_registered', { name: agent.name, role: agent.role, wallet: agent.walletAddress });
  }

  setBudget(totalBudget, maxPerTask) {
    this.budget = { total: totalBudget, spent: 0, perTask: maxPerTask };
    this.log('budget_set', { total: totalBudget, maxPerTask });
  }

  setPermissions(permissionContext) {
    this.permissionContext = permissionContext;
  }

  async executeGoal(goal, opts = {}) {
    this._resetState();
    this.missionId = uuidv4();
    this.memory = getMemory(this.missionId);
    this.log('goal_received', { goal, mode: opts.mode || 'research', missionId: this.missionId });

    // Root capability token — authority flows down from here
    this.rootToken = createToken({
      missionId: this.missionId,
      capability: 'orchestrate',
      maxBudget: this.budget.total,
      spawnRights: 3,
      confidence: 1.0,
      canDelegate: true,
      depth: 0,
    });

    // Register orchestrator as root node in spawn tree
    this.spawnNode = spawnManager.registerRoot(this.missionId, this.name, 'orchestrate');

    await this._verifyBalance();

    const subtasks = this._planSubtasks(goal);
    this.log('subtasks_planned', {
      count: subtasks.length,
      missionId: this.missionId,
      reasoning: `Decomposed goal into ${subtasks.length} subtasks: ${subtasks.map(t => t.type).join(', ')}. Estimated cost: $${subtasks.reduce((s, t) => s + t.payment, 0).toFixed(2)} USDC.`,
    });
    await sleep(3000); // let audience read the plan

    const results = {};
    const researchFindings = [];

    for (const task of subtasks) {
      await this._executeSubtask(task, goal, results, researchFindings, opts);
      await sleep(2500); // pause between tasks so feed is readable
    }

    results.research = researchFindings;

    // Run Bull/Bear/Judge debate after research, before writing
    if (researchFindings.length > 0) {
      results.debate = await this._runDebatePhase(researchFindings);
    }

    results.audit = this._generateAudit();

    // Phase 10: Supervisor audit — reviews final report for quality
    if (results.report) {
      results.supervisorVerdict = await this._runSupervisorPhase(results.report, results.debate);
    }

    if (this.spawnNode) spawnManager.complete(this.missionId, this.spawnNode.id);

    this.log('goal_completed', {
      goal,
      missionId: this.missionId,
      totalSpent: this.budget.spent,
      tasksCompleted: this.tasks.filter(t => t.status === 'completed').length,
      memory: this.memory ? this.memory.getSummary() : null,
      spawnTree: spawnManager.getTree(this.missionId),
      supervisorQuality: results.supervisorVerdict?.quality ?? null,
    });

    return results;
  }

  async _runDebatePhase(researchFindings) {
    this.log('debate_started', {
      missionId: this.missionId,
      findingCount: researchFindings.length,
      reasoning: 'Starting Bull/Bear/Judge debate on research findings.',
    });
    await sleep(3000); // let audience see debate is starting

    // Register debate agents in the spawn tree
    const researcher = this.workers.get('researcher');
    const debateConfig = {
      fetchWithPayment: researcher?.fetchWithPayment,
      agentWallet: researcher?.agentWallet,
    };

    // Spawn debate trio as children of the root orchestrator node
    const bullNode  = this.spawnNode ? spawnManager.spawnChild(this.missionId, this.spawnNode.id, 'GekkoBull',  'debate', 0) : null;
    const bearNode  = this.spawnNode ? spawnManager.spawnChild(this.missionId, this.spawnNode.id, 'GekkoBear',  'debate', 0) : null;
    const judgeNode = this.spawnNode ? spawnManager.spawnChild(this.missionId, this.spawnNode.id, 'GekkoJudge', 'debate', 0) : null;

    try {
      const debate = await runDebate(researchFindings, debateConfig);

      if (bullNode)  spawnManager.complete(this.missionId, bullNode.id);
      if (bearNode)  spawnManager.complete(this.missionId, bearNode.id);
      if (judgeNode) spawnManager.complete(this.missionId, judgeNode.id);

      // Store in mission memory
      if (this.memory) {
        this.memory.addDebateOutput(debate);
      }

      this.log('debate_completed', {
        missionId: this.missionId,
        verdict: debate.verdict,
        confidence: debate.confidence,
        reasoning: `Debate complete. Verdict: ${debate.verdict} (confidence: ${(debate.confidence * 100).toFixed(0)}%). ${debate.keyInsights?.length || 0} key insights.`,
      });

      return debate;
    } catch (err) {
      if (bullNode)  spawnManager.kill(this.missionId, bullNode.id, err.message);
      if (bearNode)  spawnManager.kill(this.missionId, bearNode.id, err.message);
      if (judgeNode) spawnManager.kill(this.missionId, judgeNode.id, err.message);
      this.log('debate_failed', { error: err.message, reasoning: 'Debate failed — continuing without consensus.' });
      return null;
    }
  }

  async _runSupervisorPhase(report, debateResult) {
    const supervisorWorker = this.workers.get('validator') || this.workers.get('researcher');
    const supervisor = new SupervisorAgent({
      name: 'GekkoSupervisor',
      role: 'supervisor',
      agentWallet: supervisorWorker?.agentWallet || this.agentWallet,
      fetchWithPayment: supervisorWorker?.fetchWithPayment || this.fetchWithPayment,
    });

    const agentsUsed = [...this.workers.keys()];
    const verdict = await supervisor.supervise({
      report,
      memory: this.memory,
      debateResult,
      agentsUsed,
    });

    if (this.memory) {
      this.memory.addFact({
        content: `Supervisor verdict: quality ${verdict.quality}/10, ${verdict.approved ? 'approved' : 'flagged'}. ${verdict.recommendation}`,
        source: 'GekkoSupervisor',
        confidence: verdict.confidence,
        agentName: 'GekkoSupervisor',
      });
    }

    return verdict;
  }

  _resetState() {
    this.tasks = [];
    this.taskLog = [];
    this.missionId = null;
    this.rootToken = null;
    this.memory = null;
    this.spawnNode = null;
    this._demoDied = false;
    for (const [, agent] of this.workers) agent.taskLog = [];
    this.budget.spent = 0;
  }

  async _verifyBalance() {
    try {
      const balance = await this.getBalance();
      this.log('balance_verified', { balance, wallet: this.walletAddress });
      if (balance < MIN_BALANCE_USDC) {
        throw new Error(`Orchestrator wallet balance too low ($${balance.toFixed(4)} USDC). Fund wallet before running goals.`);
      }
    } catch (err) {
      if (err.message.includes('too low')) throw err;
      this.log('balance_check_warning', {
        error: err.message,
        reasoning: 'Could not verify wallet balance. Proceeding with caution.',
      });
    }
  }

  async _executeSubtask(task, goal, results, researchFindings, opts = {}) {
    if (this.budget.spent + task.payment > this.budget.total) {
      this.log('budget_exceeded', { spent: this.budget.spent, taskCost: task.payment });
      task.status = 'skipped_budget';
      this.tasks.push(task);
      return;
    }

    // ERC-7715 caveat check
    if (this.permissionContext) {
      const check = validatePermissionsOnTask(this.permissionContext, task.payment);
      if (!check.allowed) {
        this.log('permission_denied', { reason: check.reason, task: task.description });
        task.status = 'permission_denied';
        this.tasks.push(task);
        return;
      }
    }

    const agent = this._findAgent(task.type, task.token);
    if (!agent) {
      this.log('no_agent_found', { type: task.type });
      task.status = 'no_agent';
      this.tasks.push(task);
      return;
    }

    this.log('dispatching_task', {
      type: 'dispatch',
      task: task.description,
      to: agent.name,
      budget: task.payment,
      missionId: this.missionId,
      tokenId: task.token?.id,
      capability: task.token?.capability,
      depth: task.token?.depth ?? 0,
      reasoning: `Dispatching "${task.type}" to ${agent.name} via ERC-7710 delegation. Budget: $${task.payment} USDC.`,
    });
    await sleep(2500); // let audience see who was hired

    const escrowSession = await this._createEscrow(task, agent, goal);
    let workDone = await this._executeWork(task, agent, results, researchFindings, opts);

    // If agent died, find a replacement from the marketplace and retry once
    if (!workDone && task.type === 'research') {
      const replacement = this._findAgent(task.type, task.token);
      if (replacement && replacement.name !== agent.name) {
        this.log('agent_replacement', {
          original: agent.name,
          replacement: replacement.name,
          task: task.description,
          reasoning: `${agent.name} is quarantined. Spawning replacement: ${replacement.name} from marketplace. Death note recorded.`,
        });
        await sleep(3000); // let audience see the replacement spawn
        const escrowSession2 = await this._createEscrow(task, replacement, goal);
        workDone = await this._executeWork(task, replacement, results, researchFindings, opts);
        if (workDone) await this._releasePayment(task, replacement, escrowSession2);
      }
    } else if (workDone) {
      await this._releasePayment(task, agent, escrowSession);
    }

    this.tasks.push(task);

    if (this.registry) {
      const success = task.status === 'completed';
      this.registry.recordOutcome(agent.name, success, success ? task.payment : 0);
    }
  }

  async _createEscrow(task, agent, goal) {
    if (!this.escrowManager) return null;

    if (agent.walletAddress === this.workers.get('researcher')?.walletAddress && agent.role === 'validator') {
      this.log('escrow_skipped_shared_wallet', {
        type: 'escrow',
        agent: agent.name,
        reasoning: `Skipping escrow for ${agent.name} — shares wallet with researcher.`,
      });
      return { sessionId: null, skipPayment: true };
    }

    try {
      const session = await this.escrowManager.createEscrow(agent.agentWallet, {
        amount: task.payment,
        description: task.description,
        buyerAgent: this.name,
        sellerAgent: agent.name,
        metadata: { goal, taskType: task.type },
      });

      if (session?.sessionId) {
        await this.escrowManager.preflight(this.agentWallet, session.sessionId);
      }
      return session;
    } catch (err) {
      this.log('escrow_fallback', {
        type: 'escrow',
        error: err.message,
        reasoning: `Escrow failed: ${err.message}. Falling back to direct wallet payment.`,
      });
      return null;
    }
  }

  async _executeWork(task, agent, results, researchFindings, opts = {}) {
    const startTime = Date.now();

    // Demo mode: first research agent always dies to showcase death/replacement flow
    if (task.type === 'research' && !this._demoDied && process.env.DEMO_AGENT_DEATH === 'true') {
      this._demoDied = true;
      const demoNode = this.spawnNode
        ? spawnManager.spawnChild(this.missionId, this.spawnNode.id, agent.name, 'research', task.payment)
        : null;
      const reason = 'hallucination detected — research confidence below threshold (0.12)';
      if (typeof agent.die === 'function') agent.die(reason, this.missionId);
      if (demoNode) spawnManager.kill(this.missionId, demoNode.id, reason);
      if (this.memory) {
        this.memory.addDeathNote({
          agent: agent.name,
          failureReason: 'Confidence 0.12 < 0.30 threshold. Agent produced low-quality research. Quarantined for 30s.',
          confidence: 0.12,
        });
      }
      this.log('agent_died', {
        agent: agent.name,
        reason,
        missionId: this.missionId,
        reasoning: `${agent.name} quarantined: ${reason}. Orchestrator will reassign task to next marketplace candidate.`,
      });
      await sleep(4000); // dramatic pause — let audience see the death
      return false;
    }

    // Register this agent as a child node in the spawn tree
    const agentNode = this.spawnNode
      ? spawnManager.spawnChild(this.missionId, this.spawnNode.id, agent.name, task.token?.capability || task.type, task.payment)
      : null;

    try {
      if (task.type === 'research') {
        const findings = await agent.research(task.query, opts.mode, {
          token: task.token,
          missionId: this.missionId,
          nodeId: agentNode?.id,
        });
        const hasResults = findings.searchResults || findings.supplementaryResults;
        if (!hasResults) {
          this.log('research_empty', { query: task.query, reasoning: 'Venice search returned empty results.' });
          // Agent produced nothing — quarantine briefly and record death note
          if (typeof agent.die === 'function') agent.die('hallucination/empty: research returned no results', this.missionId);
          if (this.memory) {
            this.memory.addDeathNote({ agent: agent.name, failureReason: 'Empty research output', confidence: 0 });
          }
          if (agentNode) spawnManager.kill(this.missionId, agentNode.id, 'empty results');
        }
        researchFindings.push(findings);
        if (this.memory && findings.searchResults?.length > 0) {
          this.memory.addFact({
            content: `Research on "${task.query}" yielded ${findings.searchResults.length} results`,
            source: 'venice-search',
            confidence: 0.8,
            agentName: agent.name,
          });
          this.memory.recordAgent(agent.name, 'research', { query: task.query });
        }
        if (this.memory) {
          this.memory.addCompletedTask({ task: task.description, agent: agent.name, result: 'findings collected', duration: Date.now() - startTime });
        }
        if (agentNode) spawnManager.complete(this.missionId, agentNode.id);
      } else if (task.type === 'validate') {
        const validation = await agent.validate(researchFindings);
        results.validation = validation;
        this.log('validation_result', {
          validated: validation.validated,
          provider: validation.provider,
          reasoning: `Fact-check ${validation.validated ? 'completed' : 'skipped'} via ${validation.provider}. ${validation.sourcesChecked} sources checked.`,
        });
        if (this.memory) {
          this.memory.recordAgent(agent.name, 'validate', { validated: validation.validated });
          this.memory.addCompletedTask({ task: task.description, agent: agent.name, result: validation.validated ? 'passed' : 'flagged', duration: Date.now() - startTime });
        }
        if (agentNode) spawnManager.complete(this.missionId, agentNode.id);
      } else if (task.type === 'write') {
        const memoryContext = this.memory ? this.memory.getContext() : '';
        results.report = await agent.synthesize(researchFindings, 'report', opts.mode, memoryContext);
        if (this.memory) {
          this.memory.recordAgent(agent.name, 'write', { format: opts.mode });
          this.memory.addCompletedTask({ task: task.description, agent: agent.name, result: 'report generated', duration: Date.now() - startTime });
        }
        if (agentNode) spawnManager.complete(this.missionId, agentNode.id);
      }
      return true;
    } catch (err) {
      this.log('task_failed', { error: err.message, task: task.description });
      task.status = 'execution_failed';
      task.error = err.message;
      if (this.memory) {
        this.memory.addFailedTask({ task: task.description, agent: agent.name, reason: err.message });
        this.memory.addDeathNote({ agent: agent.name, failureReason: err.message, confidence: 0 });
      }
      if (typeof agent.die === 'function') agent.die(`execution error: ${err.message.slice(0, 80)}`, this.missionId);
      if (agentNode) spawnManager.kill(this.missionId, agentNode.id, err.message);
      return false;
    }
  }

  async _releasePayment(task, agent, escrowSession) {
    if (escrowSession?.skipPayment) {
      this.log('payment_skipped_shared_wallet', { task: task.description, amount: task.payment });
      this.budget.spent += task.payment;
      task.status = 'completed';
      return;
    }

    if (escrowSession?.sessionId) {
      try {
        await this.escrowManager.releasePayment(this.agentWallet, escrowSession.sessionId, agent.walletAddress);
        this.budget.spent += task.payment;
        task.status = 'completed';
        return;
      } catch (err) {
        this.log('escrow_pay_failed', { error: err.message, reasoning: `Escrow pay failed: ${err.message}. Falling back to direct payment.` });
      }
    }

    // Direct wallet payment (with one retry)
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await this.payAgent(agent.walletAddress, task.payment, task.description);
        this.budget.spent += task.payment;
        task.status = 'completed';
        return;
      } catch (err) {
        if (attempt === 1) {
          this.log('payment_retry', { error: err.message, reasoning: `Direct payment failed, retrying in 2s.` });
          await new Promise(r => setTimeout(r, 2000));
        } else {
          this.log('payment_failed', { error: err.message, task: task.description });
          task.status = 'work_done_unpaid';
          task.error = err.message;
        }
      }
    }
  }

  _scoreService(service, capability, confidence = 1.0) {
    const rep = this.registry.getReputation(service.agentName);
    const reputationScore = rep?.score ?? 1.0;
    const specializationWeight = service.capabilities.includes(capability) ? 1.5 : 1.0;
    const price = Math.max(service.price, 0.001); // prevent division by zero
    return (confidence * reputationScore * specializationWeight) / price;
  }

  _findAgent(taskType, token = null) {
    if (this.registry) {
      const capability = CAPABILITY_MAP[taskType] || taskType;
      const confidence = token?.confidence ?? 1.0;
      const services = this.registry.findByCapability(capability);

      if (services.length > 0) {
        // Dynamic scoring: (confidence × reputation × specializationWeight) / price
        const scored = services
          .map(s => ({
            ...s,
            _score: this._scoreService(s, capability, confidence),
            _rep: this.registry.getReputation(s.agentName)?.score ?? 1.0,
          }))
          .sort((a, b) => b._score - a._score);

        // Emit marketplace competition event with scores
        if (scored.length > 1) {
          this.log('marketplace_bids', {
            type: 'marketplace',
            capability,
            candidates: scored.map(s => ({
              name: s.agentName,
              price: s.price,
              score: +s._score.toFixed(4),
              reputation: +s._rep.toFixed(2),
            })),
            reasoning: `${scored.length} agents bid for "${capability}". Dynamic scoring: (confidence × reputation × specialization) / price. Top: ${scored[0].agentName} (score ${scored[0]._score.toFixed(3)}).`,
          });
        }

        // Select highest-scored non-quarantined agent
        for (const service of scored) {
          let matched = null;
          for (const [, agent] of this.workers) {
            if (agent.name === service.agentName) { matched = agent; break; }
            if (!matched && agent.walletAddress === service.walletAddress) matched = agent;
          }
          if (!matched) continue;

          // Ensure the matched agent instance has the necessary execution method for the task
          if (taskType === 'research' && typeof matched.research !== 'function') continue;
          if (taskType === 'validate' && typeof matched.validate !== 'function') continue;
          if (taskType === 'write' && typeof matched.synthesize !== 'function') continue;

          if (typeof matched.isQuarantined === 'function' && matched.isQuarantined()) {
            this.log('agent_quarantined_skip', {
              agent: matched.name,
              reasoning: `${matched.name} is quarantined — skipping to next candidate.`,
            });
            continue;
          }

          this.log('agent_discovered', {
            type: 'registry',
            agent: service.agentName,
            service: service.serviceName,
            price: service.price,
            score: +service._score.toFixed(4),
            reputation: +service._rep.toFixed(2),
            candidates: scored.slice(0, 5).map(s => ({ name: s.agentName, price: s.price, score: +s._score.toFixed(4) })),
            reasoning: `Selected ${service.agentName} (score ${service._score.toFixed(3)}) for "${capability}". Price: $${service.price}, Rep: ${service._rep.toFixed(2)}.`,
          });
          return matched;
        }
      }
    }
    return this.workers.get(ROLE_MAP[taskType]);
  }

  _planSubtasks(goal) {
    const researchPrice = this._getServicePrice('research') || Math.min(this.budget.perTask, DEFAULT_MAX_PRICE);
    const validatePrice = this._getServicePrice('validation') || Math.min(this.budget.perTask * 0.5, 0.03);
    const writePrice = this._getServicePrice('writing') || Math.min(this.budget.perTask, DEFAULT_MAX_PRICE);

    const researchQueries = this._decomposeResearchQueries(goal);
    const tasks = [];

    for (const query of researchQueries) {
      const token = this.rootToken
        ? createChildToken(this.rootToken, 'research', researchPrice)
        : null;
      tasks.push({ type: 'research', description: `Research: ${query}`, query, payment: researchPrice, status: 'pending', token });
    }

    const validateToken = this.rootToken
      ? createChildToken(this.rootToken, 'validation', validatePrice)
      : null;
    tasks.push({ type: 'validate', description: `Fact-check: ${goal}`, payment: validatePrice, status: 'pending', token: validateToken });

    const writeToken = this.rootToken
      ? createChildToken(this.rootToken, 'writing', writePrice)
      : null;
    tasks.push({ type: 'write', description: `Synthesize report: ${goal}`, payment: writePrice, status: 'pending', token: writeToken });

    return tasks;
  }

  _decomposeResearchQueries(goal) {
    const separators = /\b(?:and|vs\.?|versus|compared to|comparing)\b/i;
    const parts = goal.split(separators).map(s => s.trim()).filter(s => s.length > 5);

    if (parts.length >= 2 && parts.length <= 3) {
      const researchPrice = this._getServicePrice('research') || Math.min(this.budget.perTask, DEFAULT_MAX_PRICE);
      if (parts.length * researchPrice <= this.budget.total * 0.6) {
        this.log('dynamic_planning', {
          reasoning: `Goal has ${parts.length} distinct facets — splitting into parallel research queries.`,
          queries: parts,
        });
        return parts;
      }
    }
    return [goal];
  }

  _getServicePrice(capability) {
    if (!this.registry) return null;
    const services = this.registry.findByCapability(capability);
    return services.length > 0 ? services[0].price : null;
  }

  _generateAudit() {
    const workerAudits = {};
    for (const [role, agent] of this.workers) {
      workerAudits[role] = agent.getAuditTrail();
    }
    return {
      orchestrator: this.getAuditTrail(),
      workers: workerAudits,
      budget: { ...this.budget },
      tasks: this.tasks,
      summary: {
        totalTasks: this.tasks.length,
        completed: this.tasks.filter(t => t.status === 'completed').length,
        failed: this.tasks.filter(t => t.status.includes('failed') || t.status === 'work_done_unpaid').length,
        totalSpent: this.budget.spent,
        remainingBudget: this.budget.total - this.budget.spent,
      },
    };
  }
}

module.exports = OrchestratorAgent;
