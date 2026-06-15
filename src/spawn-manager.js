const { v4: uuidv4 } = require('uuid');
const dispatchEvents = require('./event-bus');

const MAX_CHILDREN = 3;
const MAX_DEPTH = 2;

// SpawnNode: { id, name, capability, parentId, budget, status, depth, spawnedAt, completedAt, diedAt, deathReason }

class SpawnManager {
  constructor() {
    this.missions = new Map(); // missionId → { nodes: Map<id, node>, rootId }
  }

  _getMission(missionId) {
    if (!this.missions.has(missionId)) {
      this.missions.set(missionId, { nodes: new Map(), rootId: null });
    }
    return this.missions.get(missionId);
  }

  registerRoot(missionId, name, capability = 'orchestrate') {
    const mission = this._getMission(missionId);
    const node = {
      id: uuidv4(),
      name,
      capability,
      parentId: null,
      budget: 0,
      status: 'active',
      depth: 0,
      spawnedAt: Date.now(),
      completedAt: null,
      diedAt: null,
      deathReason: null,
    };
    mission.nodes.set(node.id, node);
    mission.rootId = node.id;
    this._emit(missionId, 'spawn_root', { nodeId: node.id, name });
    return node;
  }

  spawnChild(missionId, parentNodeId, name, capability, budget = 0) {
    const mission = this._getMission(missionId);
    const parent = mission.nodes.get(parentNodeId);

    if (!parent) return null;
    if (parent.depth >= MAX_DEPTH) return null;

    const siblings = Array.from(mission.nodes.values()).filter(n => n.parentId === parentNodeId);
    if (siblings.length >= MAX_CHILDREN) return null;

    const node = {
      id: uuidv4(),
      name,
      capability,
      parentId: parentNodeId,
      budget,
      status: 'active',
      depth: parent.depth + 1,
      spawnedAt: Date.now(),
      completedAt: null,
      diedAt: null,
      deathReason: null,
    };
    mission.nodes.set(node.id, node);

    this._emit(missionId, 'spawn_started', {
      nodeId: node.id,
      name,
      capability,
      parentAgent: parent.name,
      depth: node.depth,
      budget,
    });

    return node;
  }

  complete(missionId, nodeId) {
    const mission = this._getMission(missionId);
    const node = mission?.nodes.get(nodeId);
    if (!node) return;
    node.status = 'completed';
    node.completedAt = Date.now();
    this._emit(missionId, 'spawn_completed', { nodeId, name: node.name, capability: node.capability });
  }

  kill(missionId, nodeId, reason) {
    const mission = this._getMission(missionId);
    const node = mission?.nodes.get(nodeId);
    if (!node) return;
    node.status = 'dead';
    node.diedAt = Date.now();
    node.deathReason = reason;
    this._emit(missionId, 'spawn_died', { nodeId, name: node.name, reason });
  }

  getTree(missionId) {
    const mission = this.missions.get(missionId);
    if (!mission) return [];
    return Array.from(mission.nodes.values());
  }

  canSpawnChild(missionId, parentNodeId) {
    const mission = this._getMission(missionId);
    const parent = mission.nodes.get(parentNodeId);
    if (!parent) return false;
    if (parent.depth >= MAX_DEPTH) return false;
    const siblings = Array.from(mission.nodes.values()).filter(n => n.parentId === parentNodeId);
    return siblings.length < MAX_CHILDREN;
  }

  _emit(missionId, action, details = {}) {
    dispatchEvents.emit('agent-event', {
      timestamp: new Date().toISOString(),
      agent: 'SpawnManager',
      role: 'spawn',
      action,
      missionId,
      ...details,
    });
  }
}

module.exports = new SpawnManager(); // singleton
