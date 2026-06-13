/**
 * ERC-7715 permission descriptor helpers (server-side).
 *
 * The actual wallet_grantPermissions call is made in the frontend
 * via window.ethereum. These helpers build and validate the server-side
 * representation of granted permissions for caveat enforcement.
 */

/**
 * Build an ERC-20 spending cap permission descriptor.
 * Matches the ERC-7715 format expected by wallet_grantPermissions.
 */
function buildERC20SpendingCap(tokenAddress, maxAmountUsdc) {
  const maxAmountRaw = BigInt(Math.floor(maxAmountUsdc * 1e6)).toString();
  return {
    type: 'erc20-transfer',
    data: {
      token: tokenAddress,
      maxAmount: maxAmountRaw,
    },
  };
}

/**
 * Build a native-token stream permission descriptor.
 */
function buildNativeTokenStream(ratePerSecond, maxAmount) {
  return {
    type: 'native-token-stream',
    data: {
      ratePerSecond: String(ratePerSecond),
      maxAmount: String(maxAmount),
    },
  };
}

/**
 * Build the full ERC-7715 permission request object.
 * Returned to the frontend which passes it to wallet_grantPermissions.
 */
function buildPermissionRequest(orchestratorAddress, usdcAddress, maxUsdcPerGoal, chainId) {
  return {
    chainId: `0x${Number(chainId).toString(16)}`,
    address: orchestratorAddress,
    expiry: Math.floor(Date.now() / 1000) + 86400, // 24 hours
    permissions: [
      buildERC20SpendingCap(usdcAddress, maxUsdcPerGoal),
    ],
  };
}

/**
 * Parse a granted permission context returned by wallet_grantPermissions.
 * Extracts the spending cap so the server can enforce it per-task.
 */
function parseGrantedPermissions(permissionContext) {
  if (!permissionContext || !permissionContext.permissions) return null;

  const erc20Perm = permissionContext.permissions.find(p => p.type === 'erc20-transfer');
  if (!erc20Perm) return null;

  return {
    tokenAddress: erc20Perm.data?.token,
    maxAmountRaw: BigInt(erc20Perm.data?.maxAmount || '0'),
    maxAmountUsdc: Number(erc20Perm.data?.maxAmount || '0') / 1e6,
    expiry: permissionContext.expiry,
    grantee: permissionContext.address,
  };
}

/**
 * Validate that a task cost is within the granted permission caveats.
 * Returns { allowed: boolean, reason?: string }
 */
function validatePermissionsOnTask(parsedPermissions, taskCostUsdc) {
  if (!parsedPermissions) {
    return { allowed: true, reason: 'No permissions configured — proceeding with agent wallet balance only' };
  }

  if (Date.now() / 1000 > parsedPermissions.expiry) {
    return { allowed: false, reason: 'Granted permissions have expired' };
  }

  if (taskCostUsdc > parsedPermissions.maxAmountUsdc) {
    return {
      allowed: false,
      reason: `Task cost $${taskCostUsdc} exceeds ERC-7715 permission cap $${parsedPermissions.maxAmountUsdc}`,
    };
  }

  return { allowed: true };
}

module.exports = {
  buildERC20SpendingCap,
  buildNativeTokenStream,
  buildPermissionRequest,
  parseGrantedPermissions,
  validatePermissionsOnTask,
};
