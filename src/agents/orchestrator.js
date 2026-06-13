const BaseAgent = require('./base-agent');
const { BUDGET } = require('../config');
const { validatePermissionsOnTask } = require('../permissions');

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
    this.permissionContext = null; // Set via setPermissions() from frontend grant
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

  async executeGoal(goal) {
    this._resetState();
    this.log('goal_received', { goal });

    await this._verifyBalance();

    const subtasks = this._planSubtasks(goal);
    this.log('subtasks_planned', {
      count: subtasks.length,
      reasoning: `Decomposed goal into ${subtasks.length} subtasks: ${subtasks.map(t => t.type).join(', ')}. Estimated cost: $${subtasks.reduce((s, t) => s + t.payment, 0).toFixed(2)} USDC.`,
    });

    const results = {};
    const researchFindings = [];

    for (const task of subtasks) {
      await this._executeSubtask(task, goal, results, researchFindings);
    }

    results.research = researchFindings;
    results.audit = this._generateAudit();

    this.log('goal_completed', {
      goal,
      totalSpent: this.budget.spent,
      tasksCompleted: this.tasks.filter(t => t.status === 'completed').length,
    });

    return results;
  }

  _resetState() {
    this.tasks = [];
    this.taskLog = [];
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

  async _executeSubtask(task, goal, results, researchFindings) {
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

    const agent = this._findAgent(task.type);
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
      reasoning: `Dispatching "${task.type}" to ${agent.name} via ERC-7710 delegation. Budget: $${task.payment} USDC.`,
    });

    const escrowSession = await this._createEscrow(task, agent, goal);
    const workDone = await this._executeWork(task, agent, results, researchFindings);
    if (workDone) {
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

  async _executeWork(task, agent, results, researchFindings) {
    try {
      if (task.type === 'research') {
        const findings = await agent.research(task.query);
        if (!findings.searchResults && !findings.supplementaryResults) {
          this.log('research_empty', { query: task.query, reasoning: 'Venice search returned empty results.' });
        }
        researchFindings.push(findings);
      } else if (task.type === 'validate') {
        const validation = await agent.validate(researchFindings);
        results.validation = validation;
        this.log('validation_result', {
          validated: validation.validated,
          provider: validation.provider,
          reasoning: `Fact-check ${validation.validated ? 'completed' : 'skipped'} via ${validation.provider}. ${validation.sourcesChecked} sources checked.`,
        });
      } else if (task.type === 'write') {
        results.report = await agent.synthesize(researchFindings);
      }
      return true;
    } catch (err) {
      this.log('task_failed', { error: err.message, task: task.description });
      task.status = 'execution_failed';
      task.error = err.message;
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

  _findAgent(taskType) {
    if (this.registry) {
      const capability = CAPABILITY_MAP[taskType] || taskType;
      const services = this.registry.findByCapability(capability);
      if (services.length > 0) {
        const service = services.sort((a, b) => {
          if (a.price !== b.price) return a.price - b.price;
          const repA = this.registry.getReputation(a.agentName).score;
          const repB = this.registry.getReputation(b.agentName).score;
          return repB - repA;
        })[0];
        let matched = null;
        for (const [, agent] of this.workers) {
          if (agent.name === service.agentName) { matched = agent; break; }
          if (!matched && agent.walletAddress === service.walletAddress) matched = agent;
        }
        if (matched) {
          this.log('agent_discovered', {
            type: 'registry',
            agent: service.agentName,
            service: service.serviceName,
            price: service.price,
            reasoning: `Selected ${service.agentName} from registry — cheapest for "${capability}" at $${service.price} USDC/task.`,
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
      tasks.push({ type: 'research', description: `Research: ${query}`, query, payment: researchPrice, status: 'pending' });
    }
    tasks.push({ type: 'validate', description: `Fact-check: ${goal}`, payment: validatePrice, status: 'pending' });
    tasks.push({ type: 'write', description: `Synthesize report: ${goal}`, payment: writePrice, status: 'pending' });

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
