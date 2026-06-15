const { v4: uuidv4 } = require('uuid');

const MAX_DEPTH = 2;
const MAX_SPAWN_RIGHTS = 3;
const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

function createToken({
  missionId,
  capability,
  parentAgent = null,
  ttl = DEFAULT_TTL_MS,
  maxBudget = 0,
  spawnRights = MAX_SPAWN_RIGHTS,
  confidence = 1.0,
  canDelegate = true,
  depth = 0,
}) {
  return {
    id: uuidv4(),
    missionId,
    memoryId: missionId,
    capability,
    parentAgent,
    expiresAt: Date.now() + ttl,
    maxBudget,
    spawnRights,
    confidence,
    canDelegate,
    depth,
    createdAt: Date.now(),
  };
}

function isExpired(token) {
  return Date.now() > token.expiresAt;
}

function canSpawn(token) {
  return (
    token.spawnRights > 0 &&
    token.depth < MAX_DEPTH &&
    token.canDelegate &&
    !isExpired(token)
  );
}

// Creates a narrowed child token — budget and spawnRights can only decrease
function createChildToken(parentToken, capability, budget) {
  const remainingTtl = Math.max(parentToken.expiresAt - Date.now(), 60_000);
  return createToken({
    missionId: parentToken.missionId,
    capability,
    parentAgent: parentToken.parentAgent || parentToken.capability,
    ttl: remainingTtl,
    maxBudget: Math.min(budget, parentToken.maxBudget),
    spawnRights: Math.max(0, parentToken.spawnRights - 1),
    confidence: parentToken.confidence,
    canDelegate: parentToken.depth < MAX_DEPTH - 1,
    depth: parentToken.depth + 1,
  });
}

module.exports = { createToken, isExpired, canSpawn, createChildToken, MAX_DEPTH, MAX_SPAWN_RIGHTS };
