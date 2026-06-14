Base Sepolia (84532)

curl -X POST "https://relayer.1shotapi.com/relayers" -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"relayer_getCapabilities","params":["84532"]}' | jq 

Public Relayer: First JSON-RPC Call
Submit a baseline call against the public relayer endpoint.

Full TypeScript example
Below are two complete examples showing how to do end-to-end gas abstracted transactions on the testnet relayer. You can copy them to a local project. You will need the @viem and @metamask/smart-accounts-kit packages installed. You can get testnet USDC from the Circle faucet to pay for the transactions.

SingleChain.ts



/**
 * Dev script: build a Sepolia ERC-7710 bundle (delegation + USDC transfers) and POST it to
 * relayer_send7710Transaction, then poll relayer_getStatus.
 *
 * Loads variables from `scripts/.env`.
 *
 * Env: DELEGATOR_PRIVATE_KEY — EOA that owns the delegator address (defaults to inline dev key).
 *      RELAYER_URL — default https://relayer.1shotapi.dev/relayers
 *      RELAYER_7710_AUTHORIZE — if "true", include EIP-7702 authorizationList
 *
 * Flow follows MetaMask's guide:
 * https://docs.metamask.io/smart-accounts-kit/guides/delegation/execute-on-smart-accounts-behalf/
 *
 * Delegation scope: use {@link ScopeType.FunctionCall} (USDC + `transfer` selector) so batched
 * executions match the caveat enforcers. {@link ScopeType.Erc20TransferAmount} with relayer
 * batch mode can revert on-chain with `CaveatEnforcer:invalid-call-type`.
 */
import "./loadScriptsEnv.ts";
import { privateKeyHexFromEnv } from "./privateKeyEnv.ts";
import {
  labeledLine,
  logPollLine,
  printJsonBlock,
  relayStatusLabel,
  section,
  subBanner,
} from "./scriptLog.ts";
import { randomBytes } from "node:crypto";
import {
  createDelegation,
  ScopeType,
  Implementation,
  toMetaMaskSmartAccount,
} from "@metamask/smart-accounts-kit";
import {
  createPublicClient,
  http,
  encodeFunctionData,
  erc20Abi,
  getAddress,
} from "viem";
import { sepolia as chain } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { bytesToHex } from "viem/utils";

const RELAYER_URL =
  process.env.RELAYER_URL ?? "https://relayer.1shotapi.dev/relayers";
const RELAYER_7710_AUTHORIZE =
  process.env.RELAYER_7710_AUTHORIZE?.toLowerCase() === "true";

/** Recursively make delegation / caveat structs JSON-serializable for JSON-RPC. */
function toRelayerJson(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === "bigint") {
    return `0x${value.toString(16)}`;
  }
  if (value instanceof Uint8Array) {
    return bytesToHex(value);
  }
  if (Array.isArray(value)) {
    return value.map(toRelayerJson);
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = toRelayerJson(v);
    }
    return out;
  }
  return value;
}

// Setup some constants for the script.
const targetWalletAddress = "0x02c9979a75fbdbc3a77485024ab8b6474308591e";
const feeCollectorAddress = "0xE936e8FAf4A5655469182A49a505055B71C17604";
const destinationWalletAddress = "0x3e6a2f0CBA03d293B54c9fCF354948903007a798";

// Set the amount of USDC to transfer. We'll do a transfer as the work payload, and another transfer for the fee.
const feeAmount = 10_000n; // 0.01 USDC (6 decimals)
const workAmount = 20_000n; // 0.02 USDC

const statelessDelegatorImplementationAddress =
  "0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B";

const usdcAddress = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as const;

const delegatorPk =
  privateKeyHexFromEnv(process.env.DELEGATOR_PRIVATE_KEY) ??
  ("0x2b47a5044e71eb2fa1a34043e87f51ab6490b98889f54d91d15b1f4cadb1d9b2" as const);

const delegatorAddress = "0x3109f4ebB0d5E915447975e43E9e0e368bf7bD66" as const;

// Now we setup the delegator account- IE, the wallet account, which will sign the delegation and on whose behalf the work will be done.
const delegatorAccount = privateKeyToAccount(delegatorPk);

if (delegatorAddress.toLowerCase() !== delegatorAccount.address.toLowerCase()) {
  throw new Error("Delegator address does not match DELEGATOR_PRIVATE_KEY");
}

section("Relay7710 self-sponsored · Sepolia (single-chain)");
subBanner("Configuration");
labeledLine("RELAYER_URL", RELAYER_URL);
labeledLine("Chain", `Sepolia (chain ID ${String(chain.id)})`);
labeledLine("RELAYER_7710_AUTHORIZE", String(RELAYER_7710_AUTHORIZE));
labeledLine(
  "Fee payment (atoms)",
  `${feeAmount.toString()} (USDC 6 decimals)`,
);
labeledLine(
  "Work payment (atoms)",
  `${workAmount.toString()} (USDC 6 decimals)`,
);

subBanner("Delegator");
labeledLine("Smart account address", delegatorAddress);
labeledLine("Signer EOA", delegatorAccount.address);

const publicClient = createPublicClient({
  chain,
  transport: http(),
});

const delegatorSmartAccount = await toMetaMaskSmartAccount({
  client: publicClient,
  implementation: Implementation.Stateless7702,
  address: delegatorAddress,
  signer: { account: delegatorAccount },
});

// If the delegator account has not already been upgraded to the Metamask Smart Account, we need to do so
// We can include the authorization in the relayer request, and even sign delegations before it's done.
// It just needs to be upgraded before the delegation is redeemed.
let authorizationList: unknown[] | undefined;
if (RELAYER_7710_AUTHORIZE) {
  const authNonce = await publicClient.getTransactionCount({
    address: delegatorAddress,
    blockTag: "pending",
  });

  /** EIP-7702: viem hashes as `keccak256(0x05 || rlp([chainId, address, nonce]))` and signs (same as relayer recovery). */
  const signedAuthorization = await delegatorAccount.signAuthorization({
    chainId: chain.id,
    contractAddress: getAddress(statelessDelegatorImplementationAddress),
    nonce: authNonce,
  });

  // viem returns `v` as bigint; relayer payload only needs/yields yParity+r+s.
  const { address, chainId, nonce, r, s, yParity } = signedAuthorization;
  authorizationList = [{ address, chainId, nonce, r, s, yParity }];
  subBanner("EIP-7702 authorization");
  labeledLine("Mode", "Enabled (delegator account)");
  printJsonBlock("authorizationList entry", authorizationList[0]);
} else {
  subBanner("EIP-7702 authorization");
  labeledLine(
    "Mode",
    "Disabled (set RELAYER_7710_AUTHORIZE=true to include delegation upgrade)",
  );
}

const delegationSalt = bytesToHex(
  Uint8Array.from(randomBytes(32)),
) as `0x${string}`;

const delegation = createDelegation({
  to: targetWalletAddress as `0x${string}`,
  from: delegatorSmartAccount.address,
  environment: delegatorSmartAccount.environment,
  salt: delegationSalt,
  scope: {
    type: ScopeType.Erc20TransferAmount,
    tokenAddress: usdcAddress as `0x${string}`,
    maxAmount: feeAmount + workAmount, // We are transferring 30000 USDC, but the caveat enforcer requires 1 more to avoid revert
  },
});

subBanner("Sign delegation");
console.log("  Signing with delegator smart account…");
const delegationSignature = await delegatorSmartAccount.signDelegation({
  delegation,
});

const signedDelegation = {
  ...delegation,
  signature: delegationSignature,
};

// Now we encode the calldata for the fee and work transfers.
const feeCalldata = encodeFunctionData({
  abi: erc20Abi,
  functionName: "transfer",
  args: [feeCollectorAddress as `0x${string}`, feeAmount],
});

const workCalldata = encodeFunctionData({
  abi: erc20Abi,
  functionName: "transfer",
  args: [destinationWalletAddress as `0x${string}`, workAmount],
});

// Construct the body of the request to the relayer.
const sendBody = {
  jsonrpc: "2.0" as const,
  id: 1,
  method: "relayer_send7710Transaction",
  params: {
    chainId: String(chain.id),
    ...(authorizationList ? { authorizationList } : {}),
    transactions: [
      {
        permissionContext: [toRelayerJson(signedDelegation)],
        executions: [
          {
            target: usdcAddress,
            value: "0",
            data: feeCalldata,
          },
          {
            target: usdcAddress,
            value: "0",
            data: workCalldata,
          },
        ],
      },
    ],
  },
};

subBanner("Submit · relayer_send7710Transaction");
labeledLine("HTTP", `POST ${RELAYER_URL}`);
labeledLine(
  "Calldata batches",
  "1× permissionContext with fee transfer + work transfer (same delegation scope)",
);

const sendRes = await fetch(RELAYER_URL, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(sendBody),
});

const sendJson: unknown = await sendRes.json();

subBanner("Relayer JSON-RPC response");
labeledLine("HTTP status", String(sendRes.status));
printJsonBlock("Body", sendJson);

if (!sendRes.ok) {
  throw new Error(`HTTP ${sendRes.status}: ${JSON.stringify(sendJson)}`);
}

const sendParsed = sendJson as {
  result?: string;
  error?: { code: number; message: string; data?: unknown };
};
if (sendParsed.error != null) {
  throw new Error(
    `JSON-RPC error: ${sendParsed.error.message} ${JSON.stringify(sendParsed.error.data ?? "")}`,
  );
}

const taskId = sendParsed.result;
if (taskId == null || !taskId.startsWith("0x")) {
  throw new Error(
    `Unexpected result (expected task id): ${JSON.stringify(sendJson)}`,
  );
}

subBanner("Task");
labeledLine("Task ID", taskId);

const pollIntervalMs = 3000;
const deadline = Date.now() + 5 * 60 * 1000;

subBanner("Poll · relayer_getStatus");
labeledLine("Interval", "every 3s (give up after ~5 min)");

while (Date.now() < deadline) {
  const statusBody = {
    jsonrpc: "2.0" as const,
    id: 2,
    method: "relayer_getStatus",
    params: {
      id: taskId,
      logs: true,
    },
  };

  const statusRes = await fetch(RELAYER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(statusBody),
  });

  const statusJson: unknown = await statusRes.json();
  const statusParsed = statusJson as {
    result?: { status: number; message?: string; hash?: string };
    error?: { message: string };
  };

  if (statusParsed.error != null) {
    console.error(JSON.stringify(statusParsed.error, null, 2));
  } else if (statusParsed.result != null) {
    const st = statusParsed.result.status;
    logPollLine(taskId, st, statusParsed.result.hash);
    // 100 Pending, 110 Submitted, 200 Confirmed, 400 Rejected, 500 Reverted
    if (st === 200) {
      subBanner("Result");
      labeledLine("Status", `${relayStatusLabel(st)} (${st}) — confirmed`);
      if (statusParsed.result.hash != null) {
        labeledLine("Transaction hash", statusParsed.result.hash);
      }
      break;
    }
    if (st === 400) {
      throw new Error(
        `Rejected: ${statusParsed.result.message ?? JSON.stringify(statusParsed.result)}`,
      );
    }
    if (st === 500) {
      throw new Error(`Reverted: ${JSON.stringify(statusParsed.result)}`);
    }
  }

  await new Promise((r) => setTimeout(r, pollIntervalMs));
}


multichain.ts

/**
 * Dev script: build ERC-7710 bundles on Base Sepolia (fee USDC) + Sepolia (work USDC) and POST to
 * `relayer_send7710TransactionMultichain`, then poll `relayer_getStatus` for each returned task id.
 *
 * Loads variables from `scripts/.env`.
 *
 * Env: DELEGATOR_PRIVATE_KEY — EOA that owns the delegator address (defaults to inline dev key).
 *      RELAYER_URL — default https://relayer.1shotapi.dev/relayers
 *      RELAYER_7710_AUTHORIZE — if "true", include EIP-7702 authorizationList per chain param
 *
 * Flow follows MetaMask's guide:
 * https://docs.metamask.io/smart-accounts-kit/guides/delegation/execute-on-smart-accounts-behalf/
 */
import "./loadScriptsEnv.ts";
import { privateKeyHexFromEnv } from "./privateKeyEnv.ts";
import {
  labeledLine,
  logPollLine,
  printJsonBlock,
  section,
  subBanner,
} from "./scriptLog.ts";
import { randomBytes } from "node:crypto";
import {
  createDelegation,
  ScopeType,
  Implementation,
  toMetaMaskSmartAccount,
} from "@metamask/smart-accounts-kit";
import {
  createPublicClient,
  http,
  encodeFunctionData,
  erc20Abi,
  getAddress,
} from "viem";
import { baseSepolia, sepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { bytesToHex } from "viem/utils";

const RELAYER_URL =
  process.env.RELAYER_URL ?? "https://relayer.1shotapi.dev/relayers";
const RELAYER_7710_AUTHORIZE =
  process.env.RELAYER_7710_AUTHORIZE?.toLowerCase() === "true";

/** Recursively make delegation / caveat structs JSON-serializable for JSON-RPC. */
function toRelayerJson(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === "bigint") {
    return `0x${value.toString(16)}`;
  }
  if (value instanceof Uint8Array) {
    return bytesToHex(value);
  }
  if (Array.isArray(value)) {
    return value.map(toRelayerJson);
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = toRelayerJson(v);
    }
    return out;
  }
  return value;
}

const targetWalletSepoliaAddress = "0x02c9979a75fbdbc3a77485024ab8b6474308591e";
const targetWalletBaseSepoliaAddress =
  "0xf1ef956eff4181Ce913b664713515996858B9Ca9";
const feeCollectorBaseSepoliaAddress =
  "0xE936e8FAf4A5655469182A49a505055B71C17604";
const destinationWalletAddress = "0x3e6a2f0CBA03d293B54c9fCF354948903007a798";

const feeAmount = 10_000n; // 0.01 USDC (6 decimals) — paid on Base Sepolia
const workAmount = 20_000n; // 0.02 USDC — paid on Sepolia

const statelessDelegatorImplementationAddress =
  "0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B";

const usdcSepoliaAddress =
  "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as const;
const usdcBaseSepoliaAddress =
  "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;

const delegatorPk =
  privateKeyHexFromEnv(process.env.DELEGATOR_PRIVATE_KEY) ??
  ("0x2b47a5044e71eb2fa1a34043e87f51ab6490b98889f54d91d15b1f4cadb1d9b2" as const);

const delegatorAddress = "0x3109f4ebB0d5E915447975e43E9e0e368bf7bD66" as const;

const delegatorAccount = privateKeyToAccount(delegatorPk);

if (delegatorAddress.toLowerCase() !== delegatorAccount.address.toLowerCase()) {
  throw new Error("Delegator address does not match DELEGATOR_PRIVATE_KEY");
}

section(
  "Relay7710 self-sponsored · Base Sepolia (fee) + Sepolia (work) multichain",
);
subBanner("Configuration");
labeledLine("RELAYER_URL", RELAYER_URL);
labeledLine(
  "Chains",
  `Base Sepolia (${String(baseSepolia.id)}) fee -> Sepolia (${String(sepolia.id)}) work`,
);
labeledLine("RELAYER_7710_AUTHORIZE", String(RELAYER_7710_AUTHORIZE));
labeledLine(
  "Fee on Base Sepolia (atoms)",
  `${feeAmount.toString()} (USDC 6 decimals)`,
);
labeledLine(
  "Work on Sepolia (atoms)",
  `${workAmount.toString()} (USDC 6 decimals)`,
);

subBanner("Delegator");
labeledLine("Smart account address", delegatorAddress);
labeledLine("Signer EOA", delegatorAccount.address);

const publicClientSepolia = createPublicClient({
  chain: sepolia,
  transport: http(),
});
const publicClientBaseSepolia = createPublicClient({
  chain: baseSepolia,
  transport: http(),
});

const delegatorSmartAccountSepolia = await toMetaMaskSmartAccount({
  client: publicClientSepolia,
  implementation: Implementation.Stateless7702,
  address: delegatorAddress,
  signer: { account: delegatorAccount },
});
// Base Sepolia and Sepolia viem clients are distinct `PublicClient` types; the kit accepts the same shape.
const delegatorSmartAccountBaseSepolia = await toMetaMaskSmartAccount({
  client: publicClientBaseSepolia as unknown as typeof publicClientSepolia,
  implementation: Implementation.Stateless7702,
  address: delegatorAddress,
  signer: { account: delegatorAccount },
});

type AuthEntry = {
  address: `0x${string}`;
  chainId: number;
  nonce: number;
  r: `0x${string}`;
  s: `0x${string}`;
  yParity: number;
};

function signedAuthToEntry(signed: {
  address: `0x${string}`;
  chainId: number;
  nonce: number;
  r: `0x${string}`;
  s: `0x${string}`;
  yParity?: number;
}): AuthEntry {
  const { address, chainId, nonce, r, s, yParity } = signed;
  return {
    address,
    chainId,
    nonce,
    r,
    s,
    yParity: yParity ?? 0,
  };
}

let authorizationListBaseSepolia: AuthEntry[] | undefined;
let authorizationListSepolia: AuthEntry[] | undefined;

if (RELAYER_7710_AUTHORIZE) {
  const nonceBase = await publicClientBaseSepolia.getTransactionCount({
    address: delegatorAddress,
    blockTag: "pending",
  });
  authorizationListBaseSepolia = [
    signedAuthToEntry(
      await delegatorAccount.signAuthorization({
        chainId: baseSepolia.id,
        contractAddress: getAddress(statelessDelegatorImplementationAddress),
        nonce: nonceBase,
      }),
    ),
  ];
  const nonceSepolia = await publicClientSepolia.getTransactionCount({
    address: delegatorAddress,
    blockTag: "pending",
  });
  authorizationListSepolia = [
    signedAuthToEntry(
      await delegatorAccount.signAuthorization({
        chainId: sepolia.id,
        contractAddress: getAddress(statelessDelegatorImplementationAddress),
        nonce: nonceSepolia,
      }),
    ),
  ];
  subBanner("EIP-7702 authorization");
  labeledLine("Mode", "Enabled (one entry per chain)");
  printJsonBlock("Base Sepolia entry", authorizationListBaseSepolia[0]);
  printJsonBlock("Sepolia entry", authorizationListSepolia[0]);
} else {
  subBanner("EIP-7702 authorization");
  labeledLine(
    "Mode",
    "Disabled (set RELAYER_7710_AUTHORIZE=true for per-chain entries)",
  );
}

const saltBaseSepolia = bytesToHex(
  Uint8Array.from(randomBytes(32)),
) as `0x${string}`;
const saltSepolia = bytesToHex(
  Uint8Array.from(randomBytes(32)),
) as `0x${string}`;

const delegationBaseSepolia = createDelegation({
  to: targetWalletBaseSepoliaAddress as `0x${string}`,
  from: delegatorSmartAccountBaseSepolia.address,
  environment: delegatorSmartAccountBaseSepolia.environment,
  salt: saltBaseSepolia,
  scope: {
    type: ScopeType.Erc20TransferAmount,
    tokenAddress: usdcBaseSepoliaAddress,
    maxAmount: feeAmount,
  },
});

const delegationSepolia = createDelegation({
  to: targetWalletSepoliaAddress as `0x${string}`,
  from: delegatorSmartAccountSepolia.address,
  environment: delegatorSmartAccountSepolia.environment,
  salt: saltSepolia,
  scope: {
    type: ScopeType.Erc20TransferAmount,
    tokenAddress: usdcSepoliaAddress,
    maxAmount: workAmount,
  },
});

subBanner("Sign delegations");
labeledLine(
  "Base Sepolia delegation",
  "fee transfer to collector (narrow scope)",
);
labeledLine("Sepolia delegation", "USDC transfer to destination (narrow scope)");
console.log("");
console.log("  Signing Base Sepolia delegation (fee)...");
const sigBase = await delegatorSmartAccountBaseSepolia.signDelegation({
  delegation: delegationBaseSepolia,
});
const signedDelegationBaseSepolia = {
  ...delegationBaseSepolia,
  signature: sigBase,
};

console.log("  Signing Sepolia delegation (work)...");
const sigSepolia = await delegatorSmartAccountSepolia.signDelegation({
  delegation: delegationSepolia,
});
const signedDelegationSepolia = {
  ...delegationSepolia,
  signature: sigSepolia,
};

const feeCalldata = encodeFunctionData({
  abi: erc20Abi,
  functionName: "transfer",
  args: [feeCollectorBaseSepoliaAddress as `0x${string}`, feeAmount],
});

const workCalldata = encodeFunctionData({
  abi: erc20Abi,
  functionName: "transfer",
  args: [destinationWalletAddress as `0x${string}`, workAmount],
});

/** Order: Base Sepolia (fee), then Sepolia (work) — matches relayer multichain compound job. */
const sendBody = {
  jsonrpc: "2.0" as const,
  id: 1,
  method: "relayer_send7710TransactionMultichain" as const,
  params: [
    {
      chainId: String(baseSepolia.id),
      ...(authorizationListBaseSepolia != null
        ? { authorizationList: authorizationListBaseSepolia }
        : {}),
      transactions: [
        {
          permissionContext: [toRelayerJson(signedDelegationBaseSepolia)],
          executions: [
            {
              target: usdcBaseSepoliaAddress,
              value: "0",
              data: feeCalldata,
            },
          ],
        },
      ],
    },
    {
      chainId: String(sepolia.id),
      ...(authorizationListSepolia != null
        ? { authorizationList: authorizationListSepolia }
        : {}),
      transactions: [
        {
          permissionContext: [toRelayerJson(signedDelegationSepolia)],
          executions: [
            {
              target: usdcSepoliaAddress,
              value: "0",
              data: workCalldata,
            },
          ],
        },
      ],
    },
  ],
};

subBanner("Submit · relayer_send7710TransactionMultichain");
labeledLine("HTTP", `POST ${RELAYER_URL}`);
labeledLine(
  "Params order",
  "param[0] Base Sepolia (fee USDC); param[1] Sepolia (work USDC)",
);

const sendRes = await fetch(RELAYER_URL, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(sendBody),
});

const sendJson: unknown = await sendRes.json();

subBanner("Relayer JSON-RPC response");
labeledLine("HTTP status", String(sendRes.status));
printJsonBlock("Body", sendJson);

if (!sendRes.ok) {
  throw new Error(`HTTP ${sendRes.status}: ${JSON.stringify(sendJson)}`);
}

const sendParsed = sendJson as {
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};
if (sendParsed.error != null) {
  throw new Error(
    `JSON-RPC error: ${sendParsed.error.message} ${JSON.stringify(sendParsed.error.data ?? "")}`,
  );
}

const rawResult = sendParsed.result;
if (!Array.isArray(rawResult)) {
  throw new Error(
    `Unexpected result (expected task id array): ${JSON.stringify(sendJson)}`,
  );
}
const taskIds = rawResult.filter(
  (id): id is string => typeof id === "string" && id.startsWith("0x"),
);
if (taskIds.length !== rawResult.length || taskIds.length !== 2) {
  throw new Error(
    `Unexpected task ids (expected two 0x-prefixed hex strings): ${JSON.stringify(rawResult)}`,
  );
}

const feeTaskId = taskIds[0]!;
const workTaskId = taskIds[1]!;
subBanner("Tasks");
labeledLine("Base Sepolia fee (param 0)", feeTaskId);
labeledLine("Sepolia work (param 1)", workTaskId);

const pollIntervalMs = 3000;
const deadline = Date.now() + 5 * 60 * 1000;
const pending = new Set(taskIds);

subBanner("Poll · relayer_getStatus");
labeledLine("Interval", "every 3s (give up after ~5 min)");

while (pending.size > 0 && Date.now() < deadline) {
  for (const taskId of [...pending]) {
    const statusBody = {
      jsonrpc: "2.0" as const,
      id: 2,
      method: "relayer_getStatus",
      params: {
        id: taskId,
        logs: true,
      },
    };

    const statusRes = await fetch(RELAYER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(statusBody),
    });

    const statusJson: unknown = await statusRes.json();
    const statusParsed = statusJson as {
      result?: { status: number; message?: string; hash?: string };
      error?: { message: string };
    };

    if (statusParsed.error != null) {
      console.error(JSON.stringify(statusParsed.error, null, 2));
    } else if (statusParsed.result != null) {
      const st = statusParsed.result.status;
      const roleTag =
        taskId === feeTaskId
          ? "Base Sepolia fee"
          : taskId === workTaskId
            ? "Sepolia work"
            : "?";
      logPollLine(taskId, st, statusParsed.result.hash, roleTag);
      if (st === 200) {
        pending.delete(taskId);
      }
      if (st === 400) {
        throw new Error(
          `Rejected (${taskId}): ${statusParsed.result.message ?? JSON.stringify(statusParsed.result)}`,
        );
      }
      if (st === 500) {
        throw new Error(
          `Reverted (${taskId}): ${JSON.stringify(statusParsed.result)}`,
        );
      }
    }
  }

  if (pending.size > 0) {
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
}

if (pending.size > 0) {
  throw new Error(
    `Timeout waiting for confirmations. Still pending: ${[...pending].join(", ")}`,
  );
}

section("Multichain run complete");
labeledLine(
  "Base Sepolia fee task",
  feeTaskId,
);
labeledLine("Sepolia work task", workTaskId);

scriptLOg.ts

const WIDTH = 78;

export function section(title: string): void {
  const line = "=".repeat(WIDTH);
  console.log(`\n${line}\n${title}\n${line}`);
}

/** Short titled block with horizontal rules above and below */
export function subBanner(title: string): void {
  const line = "-".repeat(WIDTH);
  console.log(`\n${line}\n${title}\n${line}`);
}

export function labeledLine(
  label: string,
  value: string,
  indent = "  ",
  labelWidth = 28,
): void {
  const prefix =
    label.length <= labelWidth ? label.padEnd(labelWidth) : `${label} `;
  console.log(`${indent}${prefix}${value}`);
}

export function printJsonBlock(title: string, value: unknown): void {
  console.log(`${title}`);
  console.log(JSON.stringify(value, null, 2));
}

export function relayStatusLabel(code: number): string {
  switch (code) {
    case 100:
      return "Pending";
    case 110:
      return "Submitted";
    case 200:
      return "Confirmed";
    case 400:
      return "Rejected";
    case 500:
      return "Reverted";
    default:
      return "Unknown";
  }
}

export function taskIdAbbrev(id: string): string {
  if (id.length <= 22) {
    return id;
  }
  return `${id.slice(0, 12)}…${id.slice(-8)}`;
}

export function logPollLine(
  taskId: string,
  statusCode: number,
  hash?: string,
  roleLabel?: string,
): void {
  const hidBase = taskIdAbbrev(taskId);
  const hid = roleLabel != null ? `${roleLabel} · ${hidBase}` : hidBase;
  const lbl = relayStatusLabel(statusCode);
  let suffix = `${lbl} (${statusCode})`;
  if (hash != null && hash.length > 0) {
    suffix += ` · ${hash.slice(0, 10)}…${hash.slice(-6)}`;
  }
  labeledLine(hid, suffix, "  ");
}


lodscriptenvs.ts

/**
 * Loads `scripts/.env` regardless of process cwd, so scripts work when invoked as
 * `bun scripts/SomeScript.ts` from the repository root.
 *
 * Does not depend on `dotenv`. Keys present in `scripts/.env` overwrite `process.env`,
 * so Bun's automatic root `.env` loading cannot leave stale values that block script defaults.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const envPath = join(scriptsDir, ".env");

if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (key.length === 0) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}


privatekeyenv.ts

/** 32-byte secp256k1 private key expressed as hex (optionally prefixed with 0x). */
const BODY_LEN = 64;

function normalizedPrivateKeyHex(raw: string): `0x${string}` | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return undefined;
  }

  let withPrefix = trimmed;
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    withPrefix = `0x${trimmed}`;
  }

  if (!withPrefix.startsWith("0x") || withPrefix.length !== 2 + BODY_LEN) {
    return undefined;
  }

  const body = withPrefix.slice(2);
  if (!/^[0-9a-fA-F]{64}$/.test(body)) {
    return undefined;
  }

  return (`0x${body.toLowerCase()}` as `0x${string}`);
}

/** Treat unset, blank, malformed, or placeholder env keys as missing so `?? defaults` applies. */
export function privateKeyHexFromEnv(
  value: string | undefined,
): `0x${string}` | undefined {
  if (value == null) {
    return undefined;
  }
  return normalizedPrivateKeyHex(value);
}


.env.example

# -----------------------------------------------------------------------------
# Shared relayer config (used by all scripts in ./scripts)
# -----------------------------------------------------------------------------

# JSON-RPC endpoint for the relayer.
# Use https://relayer.1shotapi.com/relayers for mainnet
RELAYER_URL=https://relayer.1shotapi.dev/relayers

# Optional for read-method examples:
# - RelayerGetCapabilitiesExample.ts
# - RelayerGetFeeDataExample.ts
# - RelayerGetStatusExample.ts
RELAYER_CHAIN_IDS=11155111,84532
RELAYER_FEE_CHAIN_ID=8453
RELAYER_FEE_TOKEN=0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238
RELAYER_TASK_ID=0x0000000000000000000000000000000000000000000000000000000000000000

# -----------------------------------------------------------------------------
# 7710 script wallet keys
# Used by:
# - Relay7710SelfSponsoredSingleChain.ts
# - Relay7710SelfSponsoredMultiChain.ts
# - Relay7710SponsoredSingleChain.ts
# -----------------------------------------------------------------------------

# Private key for delegator EOA (must match the delegator address expected in script).
DELEGATOR_PRIVATE_KEY=

# Private key for sponsor EOA (used by Relay7710SponsoredSingleChain.ts).
SPONSOR_PRIVATE_KEY=

# -----------------------------------------------------------------------------
# 7710 authorization toggles
# -----------------------------------------------------------------------------

# Include EIP-7702 authorization for delegator in applicable scripts.
RELAYER_7710_AUTHORIZE=false

# Include EIP-7702 authorization for sponsor (sponsored single-chain script only).
# IMPORTANT: do not set both RELAYER_7710_AUTHORIZE and RELAYER_7710_SPONSOR_AUTHORIZE to true.
RELAYER_7710_SPONSOR_AUTHORIZE=false

# -----------------------------------------------------------------------------
# Notes
# -----------------------------------------------------------------------------
# 1) Copy this file next to it as `scripts/.env`. All TypeScript scripts in this
#    folder import `loadScriptsEnv.ts`, which loads `scripts/.env` even when you
#    run `bun scripts/SomeScript.ts` from the repository root:
#       cp scripts/.env.example scripts/.env
#
# 2) You can keep unused values as-is; each script only reads the vars it needs.


