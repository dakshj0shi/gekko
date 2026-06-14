/**
 * ERC-7715 Advanced Permissions helpers.
 *
 * Server-side: builds the permission request parameters the frontend
 * passes to walletClient.requestExecutionPermissions().
 *
 * The actual wallet_grantPermissions call is made in the browser via
 * the viem walletClient extended with erc7715ProviderActions().
 */

/**
 * Build the requestExecutionPermissions parameters for the frontend.
 * The frontend passes these directly to walletClient.requestExecutionPermissions().
 *
 * Permission type: erc20-token-allowance (fixed USDC budget per goal).
 */
function buildPermissionRequestParams(orchestratorAddress, usdcAddress, maxUsdcPerGoal, chainId) {
  const currentTime = Math.floor(Date.now() / 1000);
  const maxAmountRaw = String(Math.floor(maxUsdcPerGoal * 1e6)); // USDC has 6 decimals

  return {
    chainId,
    expiry: currentTime + 86400, // 24 hours
    to: orchestratorAddress,     // session account that receives the permission
    permission: {
      type: 'erc20-token-allowance',
      data: {
        tokenAddress: usdcAddress,
        allowanceAmount: maxAmountRaw,
        startTime: currentTime,
        justification: `Budget for Gekko autonomous AI research agents ($${maxUsdcPerGoal} USDC max)`,
      },
      isAdjustmentAllowed: true,
    },
  };
}

/**
 * Parse the context returned by requestExecutionPermissions.
 * grantedPermissions[0] has: { context, delegationManager, from, chainId, expiry, ... }
 */
function parseGrantedPermissions(grantedPermission) {
  if (!grantedPermission) return null;

  return {
    context: grantedPermission.context,
    delegationManager: grantedPermission.delegationManager,
    from: grantedPermission.from,
    chainId: grantedPermission.chainId,
    expiry: grantedPermission.expiry,
    // Legacy support: also accept the old flat permissionContext shape
    ...(grantedPermission.permissions ? {
      context: grantedPermission.context || null,
      delegationManager: grantedPermission.delegationManager || null,
    } : {}),
  };
}

/**
 * Validate that a task cost is within the granted permission caveats.
 */
function validatePermissionsOnTask(parsedPermissions, taskCostUsdc) {
  if (!parsedPermissions) {
    return { allowed: true, reason: 'No permissions configured — using agent wallet balance' };
  }

  const now = Math.floor(Date.now() / 1000);
  if (parsedPermissions.expiry && now > parsedPermissions.expiry) {
    return { allowed: false, reason: 'Granted permissions have expired' };
  }

  return { allowed: true };
}

module.exports = {
  buildPermissionRequestParams,
  parseGrantedPermissions,
  validatePermissionsOnTask,
};
