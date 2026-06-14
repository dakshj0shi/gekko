Install and set up the Smart Accounts Kit
This page provides instructions to install and set up the Smart Accounts Kit in your dapp, enabling you to create and interact with MetaMask Smart Accounts
.

Prerequisites
Install Node.js v18 or later.
Install Yarn, npm, or another package manager.
If you plan to use any smart contracts (for example, to create a custom caveat enforcer), install Foundry.
Steps
1. Install the Smart Accounts Kit
Install the Smart Accounts Kit:

npm
Yarn
pnpm
Bun
npm install @metamask/smart-accounts-kit
2. (Optional) Install the contracts
If you plan to extend the Delegation Framework
 smart contracts (for example, to create a custom caveat enforcer), install the contract package using Foundry's command-line tool, Forge:

forge install metamask/delegation-framework@v1.3.0
Add @metamask/delegation-framework/=lib/metamask/delegation-framework/ in your remappings.txt file.

3. Get started
You're now ready to start using the Smart Accounts Kit. See the MetaMask Smart Accounts quickstart to walk through a simple example.

EIP-7702 quickstart
This quickstart demonstrates how to upgrade your EOA
 to support MetaMask smart account
 functionality using an EIP-7702 transaction. This enables your EOA to leverage the benefits of account abstraction
, such as batch transactions, gas sponsorship, and delegation
.

note
This guide is for embedded wallets. To upgrade a MetaMask account, you can use MetaMask Connect to upgrade to a smart account.

Prerequisites
Install Node.js v18 or later.
Install Yarn, npm, or another package manager.
Install Viem.
Steps
1. Install the Smart Accounts Kit
Install the Smart Accounts Kit:

npm
Yarn
pnpm
Bun
npm install @metamask/smart-accounts-kit
2. Set up a Public Client
Set up a Public Client using Viem's createPublicClient function. This client will let the EOA query the account state and interact with the blockchain network.

import { createPublicClient, http } from 'viem'
import { sepolia as chain } from 'viem/chains'

const publicClient = createPublicClient({
  chain,
  transport: http(),
})
3. Set up a Bundler Client
Set up a Bundler Client using Viem's createBundlerClient function. This lets you use the bundler
 service to estimate gas for user operations
 and submit transactions to the network.

import { createBundlerClient } from 'viem/account-abstraction'

const bundlerClient = createBundlerClient({
  client: publicClient,
  transport: http('https://your-bundler-rpc.com'),
})
4. Set up a Wallet Client
Set up a Wallet Client using Viem's createWalletClient function. This lets you sign and submit EIP-7702 authorizations.

import { createWalletClient, http } from 'viem'
import { sepolia as chain } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'

export const account = privateKeyToAccount('0x...')

export const walletClient = createWalletClient({
  account,
  chain,
  transport: http(),
})
5. Authorize a 7702 delegation
Create an authorization to map the contract code to an EOA
, and sign it using Viem's signAuthorization action. The signAuthorization action does not support JSON-RPC accounts.

This example uses EIP7702StatelessDeleGator as the EIP-7702 delegator contract. It follows a stateless design, as it does not store signer data in the contract's state. This approach provides a lightweight and secure way to upgrade an EOA to a MetaMask smart account
.

import {
  Implementation,
  toMetaMaskSmartAccount,
  getSmartAccountsEnvironment,
} from '@metamask/smart-accounts-kit'
import { privateKeyToAccount } from 'viem/accounts'

const environment = getSmartAccountsEnvironment(sepolia.id)
const contractAddress = environment.implementations.EIP7702StatelessDeleGatorImpl

const authorization = await walletClient.signAuthorization({
  account,
  contractAddress,
  executor: 'self',
})
6. Submit the authorization
Once you have signed an authorization, you can send an EIP-7702 transaction to set the EOA code. Since the authorization cannot be sent by itself, you can include it alongside a dummy transaction.

import { zeroAddress } from 'viem'

const hash = await walletClient.sendTransaction({
  authorizationList: [authorization],
  data: '0x',
  to: zeroAddress,
})
7. Create a MetaMask smart account
Create a smart account
 instance for the EOA and start leveraging the benefits of account abstraction
.

import { Implementation, toMetaMaskSmartAccount } from '@metamask/smart-accounts-kit'

const addresses = await walletClient.getAddresses()
const address = addresses[0]

const smartAccount = await toMetaMaskSmartAccount({
  client: publicClient,
  implementation: Implementation.Stateless7702,
  address,
  signer: { walletClient },
})
8. Send a user operation
Send a user operation
 through the upgraded EOA, using Viem's sendUserOperation method.

import { parseEther } from 'viem'

// Appropriate fee per gas must be determined for the specific bundler being used.
const maxFeePerGas = 1n
const maxPriorityFeePerGas = 1n

const userOperationHash = await bundlerClient.sendUserOperation({
  account: smartAccount,
  calls: [
    {
      to: '0x1234567890123456789012345678901234567890',
      value: parseEther('1'),
    },
  ],
  maxFeePerGas,
  maxPriorityFeePerGas,
})
Next steps
To grant specific permissions to other accounts from your smart account, create a delegation.
To quickly bootstrap a MetaMask Smart Accounts project, use the CLI.

Use the Smart Accounts Kit CLI
Use the @metamask/create-gator-app interactive CLI to bootstrap a project with the Smart Accounts Kit in under two minutes. The CLI automatically installs the required dependencies and sets up a project structure using a selected template, allowing you to focus on building your dapp.

Run the CLI
Run the following command to automatically install the @metamask/create-gator-app package:

npx @metamask/create-gator-app@latest
Upon installation, you'll be asked the following prompts:

? What is your project named? (my-gator-app)
? Pick a framework: (Use arrow keys)
❯ nextjs
  vite-react
  node
? Pick a template: (Use arrow keys)
❯ MetaMask Smart Accounts Starter
  MetaMask Smart Accounts & Delegation Starter
  Farcaster Mini App Delegation Starter
  Advanced Permissions (ERC-7715) Starter
? Pick a package manager: (Use arrow keys)
❯ npm
  yarn
  pnpm
Once you've answered the prompts with the required configuration and selected a template, the CLI will create the project using the specified name and settings. See the following section to learn more about available CLI configurations.

Options
The CLI provides the following options to display CLI details, and further customize the template configuration.

Option	Description
-v or --version	Check the current version of the @metamask/create-gator-app CLI.
-h or --help	Display the available options.
--skip-install	Skip the installation of dependencies.
--add-web3auth	Add MetaMask Embedded Wallets (previously Web3Auth) as a signer
 for the delegator account
.

Supported templates:
- MetaMask Smart Accounts Starter
- MetaMask Smart Accounts & Delegation Starter
Examples
MetaMask Embedded Wallets configuration
To create a project that uses MetaMask Embedded Wallets as the signer
 for your delegator account
, use the --add-web3auth option with @metamask/create-gator-app:

npx @metamask/create-gator-app --add-web3auth
You'll be prompted to provide additional Web3Auth configuration details:

? Which Web3Auth network do you want to use? (Use arrow keys)
❯ Sapphire Devnet
  Sapphire Mainnet
Supported templates
Template	Next.js	Vite React	Node.js
MetaMask Smart Accounts Starter	✅	✅	❌
MetaMask Smart Accounts & Delegation Starter	✅	✅	❌
Farcaster Mini App Delegation Starter	✅	❌	❌
Advanced Permissions (ERC-7715) Starter	✅	❌	❌
x402 Server	❌	❌	✅
Use skills
Use skills to give your agent framework context on the MetaMask Smart Accounts Kit. Skills guide your agent through smart account
 creation, delegations
, Advanced Permissions
 (ERC-7715), and x402 payments.

Skills are available through the open-source MetaMask/skills repository.

Smart Accounts Kit
This skill gives your agent context on the Smart Accounts Kit and how to integrate its capabilities into your dapp, including smart account creation, delegations, and Advanced Permissions.

npx skills add MetaMask/skills/domains/web3-tools/skills/smart-accounts-kit
Key capabilities
Capability	Description
Smart accounts	Integrate MetaMask Smart Accounts to support batch transactions, multi-sig signatures
, and gas sponsorship
.
Delegation	Integrate delegations to execute transactions on behalf of a smart account.
Advanced Permissions	Integrate Advanced Permissions to execute transactions on behalf of a MetaMask user.
x402 Payments
This skill helps your agent implement x402 HTTP-based payments using the Smart Accounts Kit, enabling both buyer and seller flows with delegations and Advanced Permissions.

npx skills add MetaMask/skills/domains/web3-tools/skills/x402-payments
Key capabilities
Capability	Description
Seller	Set up x402 payment endpoints that accept HTTP 402-based payments.
Buyer	Pay for x402-protected resources using delegations or Advanced Permissions.
Next steps
Install the Smart Accounts Kit
Create your first smart account
Learn about x402 payments
Configure the Smart Accounts Kit
The Smart Accounts Kit is highly configurable, providing support for custom bundlers
 and paymasters
. You can also configure the toolkit environment to interact with the Delegation Framework
.

Prerequisites
Install and set up the Smart Accounts Kit.

Configure the bundler
The toolkit uses Viem's Account Abstraction API to configure custom bundlers
 and paymasters
. This provides a robust and flexible foundation for creating and managing MetaMask Smart Accounts. See Viem's account abstraction documentation for more information on the API's features, methods, and best practices.

To use the bundler and paymaster clients with the toolkit, create instances of these clients and configure them as follows:

import { createPaymasterClient, createBundlerClient } from 'viem/account-abstraction'
import { http } from 'viem'
import { sepolia as chain } from 'viem/chains'

// Replace these URLs with your actual bundler and paymaster endpoints.
const bundlerUrl = 'https://your-bundler-url.com'
const paymasterUrl = 'https://your-paymaster-url.com'

// The paymaster is optional.
const paymasterClient = createPaymasterClient({
  transport: http(paymasterUrl),
})

const bundlerClient = createBundlerClient({
  transport: http(bundlerUrl),
  paymaster: paymasterClient,
  chain,
})
Replace the bundler and paymaster URLs with your bundler and paymaster endpoints. For example, you can use endpoints from Pimlico, Infura, or ZeroDev.

note
Providing a paymaster is optional when configuring your bundler client. However, if you choose not to use a paymaster, the smart account must have enough funds to pay gas fees.

(Optional) Configure the toolkit environment
The toolkit environment (SmartAccountsEnvironment) defines the contract addresses necessary for interacting with the Delegation Framework on a specific network. It serves several key purposes:

It provides a centralized configuration for all the contract addresses required by the Delegation Framework.
It enables easy switching between different networks (for example, Mainnet and testnet) or custom deployments.
It ensures consistency across different parts of the application that interact with the Delegation Framework.
Resolve the environment
When you create a MetaMask smart account
, the toolkit automatically resolves the environment based on the version it requires and the chain configured. If no environment is found for the specified chain, it throws an error.

example.ts
config.ts
import { SmartAccountsEnvironment } from '@metamask/smart-accounts-kit'
import { delegatorSmartAccount } from './config.ts'

const environment: SmartAccountsEnvironment = delegatorSmartAccount.environment
note
See the changelog of the toolkit version you are using (in the left sidebar) for supported chains.

Alternatively, you can use the getSmartAccountsEnvironment function to resolve the environment. This function is especially useful if your delegator
 is not a smart account when creating a redelegation
.

import { getSmartAccountsEnvironment, SmartAccountsEnvironment } from '@metamask/smart-accounts-kit'
import { sepolia } from 'viem/chains'

// Resolves the SmartAccountsEnvironment for Sepolia
const environment: SmartAccountsEnvironment = getSmartAccountsEnvironment(sepolia.id)
Deploy a custom environment
You can deploy the contracts using any method, but the toolkit provides a convenient deploySmartAccountsEnvironment function. This function simplifies deploying the Delegation Framework
 contracts to your desired EVM chain.

This function requires a Viem Public Client, Wallet Client, and Chain to deploy the contracts and resolve the SmartAccountsEnvironment.

Your wallet must have a sufficient native token balance to deploy the contracts.

example.ts
config.ts
import { walletClient, publicClient } from './config.ts'
import { sepolia as chain } from 'viem/chains'
import { deploySmartAccountsEnvironment } from '@metamask/smart-accounts-kit/utils'

const environment = await deploySmartAccountsEnvironment(walletClient, publicClient, chain)
You can also override specific contracts when calling deploySmartAccountsEnvironment. For example, if you've already deployed the EntryPoint contract on the target chain, you can pass the contract address to the function.

// The config.ts is the same as in the previous example.
import { walletClient, publicClient } from "./config.ts";
import { sepolia as chain } from "viem/chains";
import { deploySmartAccountsEnvironment } from "@metamask/smart-accounts-kit/utils";

const environment = await deploySmartAccountsEnvironment(
  walletClient,
  publicClient,
  chain,
+ {
+   EntryPoint: "0x0000000071727De22E5E9d8BAf0edAc6f37da032"
+ }
);
Once the contracts are deployed, you can use them to override the environment.

Override the environment
To override the environment, the toolkit provides an overrideDeployedEnvironment function to resolve SmartAccountsEnvironment with specified contracts for the given chain and contract version.

// The config.ts is the same as in the previous example.
import { walletClient, publicClient } from './config.ts'
import { sepolia as chain } from 'viem/chains'
import { SmartAccountsEnvironment } from '@metamask/smart-accounts-kit'
import {
  overrideDeployedEnvironment,
  deploySmartAccountsEnvironment,
} from '@metamask/smart-accounts-kit'

const environment: SmartAccountsEnvironment = await deploySmartAccountsEnvironment(
  walletClient,
  publicClient,
  chain
)

overrideDeployedEnvironment(chain.id, '1.3.0', environment)
If you've already deployed the contracts using a different method, you can create a SmartAccountsEnvironment instance with the required contract addresses, and pass it to the function.

- import { walletClient, publicClient } from "./config.ts";
- import { sepolia as chain } from "viem/chains";
import { SmartAccountsEnvironment } from "@metamask/smart-accounts-kit";
import {
  overrideDeployedEnvironment,
- deploySmartAccountsEnvironment
} from "@metamask/smart-accounts-kit";

- const environment: SmartAccountsEnvironment = await deploySmartAccountsEnvironment(
-  walletClient,
-  publicClient,
-  chain
- );

+ const environment: SmartAccountsEnvironment = {
+  SimpleFactory: "0x124..",
+  // ...
+  implementations: {
+    // ...
+  },
+ };

overrideDeployedEnvironment(
  chain.id,
  "1.3.0",
  environment
);
note
Make sure to specify the Delegation Framework
 version required by the toolkit. See the changelog of the toolkit version you are using (in the left sidebar) for its required Framework version.

 Create a smart account
You can enable users to create a MetaMask smart account directly in your dapp. Use toMetaMaskSmartAccount to create different types of smart accounts with different signature schemes.

Prerequisites
Install and set up the Smart Accounts Kit.

Hybrid smart account
A Hybrid smart account supports both an EOA
 owner and any number of passkey
 (WebAuthn) signers
.

This example uses toMetaMaskSmartAccount and Viem's Wallet Client to create a Hybrid smart account. The signer parameter also accepts Viem's Local Account and WebAuthnAccount.

See the toMetaMaskSmartAccount API reference for more information.

example.ts
client.ts
signer.ts
import { publicClient } from './client.ts'
import { walletClient } from './signer.ts'
import { Implementation, toMetaMaskSmartAccount } from '@metamask/smart-accounts-kit'

// Some wallets like MetaMask may require you to request access to
// account addresses using walletClient.requestAddresses() first.
const [address] = await walletClient.getAddresses()

const smartAccount = await toMetaMaskSmartAccount({
  client: publicClient,
  implementation: Implementation.Hybrid,
  deployParams: [address, [], [], []],
  deploySalt: '0x',
  signer: { walletClient },
})
Multisig smart account
A Multisig smart account supports multiple EOA
 signers
 with a configurable threshold for execution.

This example uses toMetaMaskSmartAccount to create a Multisig smart account with a combination of account signers and Wallet Client signers.

example.ts
client.ts
signers.ts
import { publicClient } from './client.ts'
import { account, walletClient } from './signers.ts'
import { Implementation, toMetaMaskSmartAccount } from '@metamask/smart-accounts-kit'

const owners = [account.address, walletClient.address]
const signer = [{ account }, { walletClient }]
const threshold = 2n

const smartAccount = await toMetaMaskSmartAccount({
  client: publicClient,
  implementation: Implementation.MultiSig,
  deployParams: [owners, threshold],
  deploySalt: '0x',
  signer,
})
note
The number of signers must be at least equal to the threshold to generate a valid signature.

EIP-7702 smart account
An EIP-7702 smart account represents an EOA
 that has been upgraded to support MetaMask Smart Accounts
 functionality as defined by EIP-7702.

This example uses toMetaMaskSmartAccount and Viem's privateKeyToAccount to create an EIP-7702 smart account. This example doesn't handle the upgrade process; see the EIP-7702 quickstart to learn how to upgrade.

Important
The EIP-7702 implementation only works with Viem's Local Accounts. It doesn't work with a JSON-RPC Account like MetaMask.

See the Upgrade a MetaMask EOA to a smart account tutorial.

example.ts
client.ts
signer.ts
import { publicClient } from './client.ts'
import { account } from './signer.ts'
import { Implementation, toMetaMaskSmartAccount } from '@metamask/smart-accounts-kit'

const smartAccount = await toMetaMaskSmartAccount({
  client: publicClient,
  implementation: Implementation.Stateless7702,
  address: account.address,
  signer: { account },
})
Next steps
Configure signers to use a signer that fits your needs.
Deploy the smart account and send user operations using Viem Account Abstraction clients.
Create delegations to grant scoped permissions to other accounts.
Deploy a smart account
You can deploy MetaMask Smart Accounts in two different ways. You can either deploy a smart account automatically when sending the first user operation
, or manually deploy the account.

Prerequisites
Install and set up the Smart Accounts Kit.
Create a MetaMask smart account.
Deploy with the first user operation
When you send the first user operation from a smart account, the Smart Accounts Kit checks whether the account is already deployed. If the account is not deployed, the toolkit adds the initCode to the user operation to deploy the account within the same operation. Internally, the initCode is encoded using the factory and factoryData.

example.ts
config.ts
import { bundlerClient, smartAccount } from './config.ts'
import { parseEther } from 'viem'

// Appropriate fee per gas must be determined for the specific bundler being used.
const maxFeePerGas = 1n
const maxPriorityFeePerGas = 1n

const userOperationHash = await bundlerClient.sendUserOperation({
  account: smartAccount,
  calls: [
    {
      to: '0x1234567890123456789012345678901234567890',
      value: parseEther('0.001'),
    },
  ],
  maxFeePerGas,
  maxPriorityFeePerGas,
})
Deploy manually
To deploy a smart account manually, call the getFactoryArgs method from the smart account to retrieve the factory and factoryData. This allows you to use a relay account to sponsor the deployment without needing a paymaster.

The factory represents the contract address responsible for deploying the smart account, while factoryData contains the calldata that will be executed by the factory to deploy the smart account.

The relay account can be either an EOA
 or another smart account. This example uses an EOA.

example.ts
config.ts
import { walletClient, smartAccount } from './config.ts'

const { factory, factoryData } = await smartAccount.getFactoryArgs()

// Deploy smart account using relay account.
const hash = await walletClient.sendTransaction({
  to: factory,
  data: factoryData,
})
Next steps
Learn more about sending user operations.
To sponsor gas for end users, see how to send a gasless transaction.
Send a user operation
User operations are the ERC-4337 counterpart to traditional blockchain transactions. They incorporate significant enhancements that improve user experience and provide greater flexibility in account management and transaction execution.

Viem's Account Abstraction API allows a developer to specify an array of Calls that will be executed as a user operation via Viem's sendUserOperation method. The Smart Accounts Kit encodes and executes the provided calls.

User operations are not directly sent to the network. Instead, they are sent to a bundler, which validates, optimizes, and aggregates them before network submission. See Viem's Bundler Client for details on how to interact with the bundler.

note
If a user operation is sent from a MetaMask smart account that has not been deployed, the toolkit configures the user operation to automatically deploy the account.

Prerequisites
Install and set up the Smart Accounts Kit.
Create a MetaMask smart account.
Send a user operation
The following is a simplified example of sending a user operation
 using Viem Core SDK. Viem Core SDK offers more granular control for developers who require it.

In the example, a user operation is created with the necessary gas limits.

This user operation is passed to a bundler
 instance, and the EntryPoint address is retrieved from the client.

example.ts
config.ts
import { bundlerClient, smartAccount } from './config.ts'
import { parseEther } from 'viem'

// Appropriate fee per gas must be determined for the specific bundler being used.
const maxFeePerGas = 1n
const maxPriorityFeePerGas = 1n

const userOperationHash = await bundlerClient.sendUserOperation({
  account: smartAccount,
  calls: [
    {
      to: '0x1234567890123456789012345678901234567890',
      value: parseEther('0.001'),
    },
  ],
  maxFeePerGas,
  maxPriorityFeePerGas,
})
Estimate fee per gas
Different bundlers have different ways to estimate maxFeePerGas and maxPriorityFeePerGas, and can reject requests with insufficient values. The following example updates the previous example to estimate the fees.

This example uses constant values, but the Hello Gator example uses Pimlico's Alto bundler, which fetches user operation gas price using the RPC method pimlico_getUserOperationPrice.

Installation required
To estimate the gas fee for Pimlico's bundler, install the permissionless.js SDK.

example.ts
+ import { createPimlicoClient } from "permissionless/clients/pimlico";
import { parseEther } from "viem";
import { bundlerClient, smartAccount } from "./config.ts" // The config.ts is the same as in the previous example.

- const maxFeePerGas = 1n;
- const maxPriorityFeePerGas = 1n;

+ const pimlicoClient = createPimlicoClient({
+   transport: http("https://api.pimlico.io/v2/11155111/rpc?apikey=<YOUR-API-KEY>"), // You can get the API Key from the Pimlico dashboard.
+ });
+
+ const { fast: fee } = await pimlicoClient.getUserOperationGasPrice();

const userOperationHash = await bundlerClient.sendUserOperation({
  account: smartAccount,
  calls: [
    {
      to: "0x1234567890123456789012345678901234567890",
      value: parseEther("1")
    }
  ],
-  maxFeePerGas,
-  maxPriorityFeePerGas
+  ...fee
});
Wait for the transaction receipt
After submitting the user operation, it's crucial to wait for the receipt to ensure that it has been successfully included in the blockchain. Use the waitForUserOperationReceipt method provided by the bundler client.

example.ts
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { bundlerClient, smartAccount } from "./config.ts" // The config.ts is the same as in the previous example.

const pimlicoClient = createPimlicoClient({
  transport: http("https://api.pimlico.io/v2/11155111/rpc?apikey=<YOUR-API-KEY>"), // You can get the API Key from the Pimlico dashboard.
});

const { fast: fee } = await pimlicoClient.getUserOperationGasPrice();

const userOperationHash = await bundlerClient.sendUserOperation({
  account: smartAccount,
  calls: [
    {
      to: "0x1234567890123456789012345678901234567890",
      value: parseEther("1")
    }
  ],
  ...fee
});

+ const { receipt } = await bundlerClient.waitForUserOperationReceipt({
+   hash: userOperationHash
+ });
+
+ console.log(receipt.transactionHash);
Next steps
To sponsor gas for end users, see how to send a gasless transaction.

Send a gasless transaction
MetaMask Smart Accounts support gas sponsorship, which simplifies onboarding by abstracting gas fees away from end users. You can use any paymaster
 service provider, such as Pimlico or ZeroDev, or plug in your own custom paymaster.

Prerequisites
Install and set up the Smart Accounts Kit.
Create a MetaMask smart account.
Send a gasless transaction
The following example demonstrates how to use Viem's Paymaster Client to send gasless transactions. You can provide the paymaster client using the paymaster property in the sendUserOperation method, or in the Bundler Client.

In this example, the paymaster client is passed to the sendUserOperation method.

example.ts
config.ts
import { bundlerClient, smartAccount, paymasterClient } from './config.ts'
import { parseEther } from 'viem'

// Appropriate fee per gas must be determined for the specific bundler being used.
const maxFeePerGas = 1n
const maxPriorityFeePerGas = 1n

const userOperationHash = await bundlerClient.sendUserOperation({
  account: smartAccount,
  calls: [
    {
      to: '0x1234567890123456789012345678901234567890',
      value: parseEther('0.001'),
    },
  ],
  maxFeePerGas,
  maxPriorityFeePerGas,
  paymaster: paymasterClient,
})

Generate a multisig signature
The Smart Accounts Kit supports Multisig smart accounts, allowing you to add multiple EOA
 signers
 with a configurable execution threshold. When the threshold is greater than 1, you can collect signatures from the required signers and use the aggregateSignature function to combine them into a single aggregated signature.

Prerequisites
Install and set up the Smart Accounts Kit.
Create a Multisig smart account.
Generate a multisig signature
The following example configures a Multisig smart account with two different signers: Alice and Bob. The account has a threshold of 2, meaning that signatures from both parties are required for any execution.

example.ts
config.ts
import {
  bundlerClient,
  aliceSmartAccount,
  bobSmartAccount,
  aliceAccount,
  bobAccount,
} from './config.ts'
import { aggregateSignature } from '@metamask/smart-accounts-kit'

const userOperation = await bundlerClient.prepareUserOperation({
  account: aliceSmartAccount,
  calls: [
    {
      target: zeroAddress,
      value: 0n,
      data: '0x',
    },
  ],
})

const aliceSignature = await aliceSmartAccount.signUserOperation(userOperation)
const bobSignature = await bobSmartAccount.signUserOperation(userOperation)

const aggregatedSignature = aggregateSignature({
  signatures: [
    {
      signer: aliceAccount.address,
      signature: aliceSignature,
      type: 'ECDSA',
    },
    {
      signer: bobAccount.address,
      signature: bobSignature,
      type: 'ECDSA',
    },
  ],
})

Configure a signer
When creating a smart account, you must specify a signer. The signer owns the smart account and is responsible for generating the signatures required to submit user operations
. MetaMask Smart Accounts is signer-agnostic, allowing you to use any signer you prefer, such as Embedded Wallets, passkeys
, EOA
 wallets, or a custom signer.

MetaMask Smart Accounts has a native integration with MetaMask Embedded Wallets, making user onboarding easier. In addition to the native integration, you can use third-party wallet providers as Privy, Dynamic, or Para as the signer for your smart account.

Use MetaMask Embedded Wallets with MetaMask Smart Accounts
MetaMask Embedded Wallets (Web3Auth) provides a pluggable embedded wallet infrastructure to simplify Web3 wallet integration and user onboarding. It supports social sign-ins allowing users to access Web3 applications through familiar authentication methods in under a minute.

MetaMask Smart Accounts is a signer-agnostic implementation that allows you to use Embedded Wallets as a signer for smart accounts
.

info
This guide supports React and React-based frameworks.

Prerequisites
Install Node.js v18 or later.
Install Yarn, npm, or another package manager.
Create an Embedded Wallets Client ID.
Steps
1. Install dependencies
Install the Smart Accounts Kit and other dependencies in your project:

npm
Yarn
pnpm
Bun
npm install @metamask/smart-accounts-kit @web3auth/modal wagmi @tanstack/react-query viem
2. Create the Web3Auth provider
Configure the Web3AuthProvider component to provide the Embedded Wallets context to your application. You'll also use the WagmiProvider to integrate Embedded Wallets with Wagmi. This provider enables you to use Wagmi hooks with Embedded Wallets.

Once you've created the Web3AuthAppProvider, wrap it at the root of your application so the rest of your application has access to the Embedded Wallets context.

For an advanced configuration, see the Embedded Wallets guide.

provider.ts
config.ts
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode } from "react";
import { Web3AuthProvider } from "@web3auth/modal/react";
// Make sure to import `WagmiProvider` from `@web3auth/modal/react/wagmi`, not `wagmi`
import { WagmiProvider } from "@web3auth/modal/react/wagmi";
import { web3authConfig } from "./config.ts";

const queryClient = new QueryClient();

export function Web3AuthAppProvider({ children }: { children: ReactNode }) {
  return (
    <Web3AuthProvider config={web3authConfig}>
      <QueryClientProvider client={queryClient}>
        <WagmiProvider>{children}</WagmiProvider>
      </QueryClientProvider>
    </Web3AuthProvider>
  );
}
3. Create a smart account
Once the user has connected their wallet, use the Wallet Client from Wagmi as the signer to create a MetaMask smart account
.

import { Implementation, toMetaMaskSmartAccount } from '@metamask/smart-accounts-kit'
import { useConnection, usePublicClient, useWalletClient } from 'wagmi'

const { address } = useConnection()
const publicClient = usePublicClient()
const { data: walletClient } = useWalletClient()

// Additional check to make sure the Embedded Wallets is connected
// and values are available.
if (!address || !walletClient || !publicClient) {
  // Handle the error case
}

const smartAccount = await toMetaMaskSmartAccount({
  client: publicClient,
  implementation: Implementation.Hybrid,
  deployParams: [address, [], [], []],
  deploySalt: '0x',
  signer: { walletClient },
})
Perform executions on a smart account's behalf
Delegation is the ability for a MetaMask smart account to grant permission to another account to perform executions on its behalf.

In this guide, you'll create a delegator account (Alice) and a delegate account (Bob), and grant Bob permission to perform executions on Alice's behalf. You'll complete the delegation lifecycle (create, sign, and redeem a delegation).

Prerequisites
Install and set up the Smart Accounts Kit.

Steps
1. Set up a Public Client
Set up a Public Client using Viem's createPublicClient function. You will configure Alice's account (the delegator
) and the Bundler Client with the Public Client, which you can use to query the signer's account state and interact with smart contracts.

import { createPublicClient, http } from 'viem'
import { sepolia as chain } from 'viem/chains'

const publicClient = createPublicClient({
  chain,
  transport: http(),
})
2. Set up a Bundler Client
Set up a Bundler Client using Viem's createBundlerClient function. You can use the bundler
 service to estimate gas for user operations
 and submit transactions to the network.

import { createBundlerClient } from 'viem/account-abstraction'

const bundlerClient = createBundlerClient({
  client: publicClient,
  transport: http('https://your-bundler-rpc.com'),
})
3. Create a delegator account
Create an account to represent Alice, the delegator
 who will create a delegation. The delegator must be a MetaMask smart account
; use the toolkit's toMetaMaskSmartAccount method to create the delegator account.

This example configures a Hybrid smart account, which is a flexible smart account implementation that supports both an EOA
 owner and any number of passkey
 (WebAuthn) signers:

import { Implementation, toMetaMaskSmartAccount } from '@metamask/smart-accounts-kit'
import { privateKeyToAccount } from 'viem/accounts'

const delegatorAccount = privateKeyToAccount('0x...')

const delegatorSmartAccount = await toMetaMaskSmartAccount({
  client: publicClient,
  implementation: Implementation.Hybrid,
  deployParams: [delegatorAccount.address, [], [], []],
  deploySalt: '0x',
  signer: { account: delegatorAccount },
})
note
See how to configure other smart account types.

4. Create a delegate account
Create an account to represent Bob, the delegate
 who will receive the delegation. The delegate can be a smart account
 or an EOA
:

Smart account
EOA
import { Implementation, toMetaMaskSmartAccount } from '@metamask/smart-accounts-kit'
import { privateKeyToAccount } from 'viem/accounts'

const delegateAccount = privateKeyToAccount('0x...')

const delegateSmartAccount = await toMetaMaskSmartAccount({
  client: publicClient,
  implementation: Implementation.Hybrid, // Hybrid smart account
  deployParams: [delegateAccount.address, [], [], []],
  deploySalt: '0x',
  signer: { account: delegateAccount },
})
5. Create a delegation
Create a root delegation from Alice to Bob. With a root delegation, Alice is delegating her own authority away, as opposed to redelegating permissions she received from a previous delegation.

Use the toolkit's createDelegation method to create a root delegation. When creating delegation, you need to configure the scope of the delegation to define the initial authority.

This example uses the erc20TransferAmount scope, allowing Alice to delegate to Bob the ability to spend her USDC, with a specified limit on the total amount.

Important
Before creating a delegation, ensure that the delegator account (in this example, Alice's account) has been deployed. If the account is not deployed, redeeming the delegation will fail.

import { createDelegation, ScopeType } from '@metamask/smart-accounts-kit'
import { parseUnits } from 'viem'

// USDC address on Ethereum Sepolia.
const tokenAddress = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'

const delegation = createDelegation({
  to: delegateSmartAccount.address, // This example uses a delegate smart account
  from: delegatorSmartAccount.address,
  environment: delegatorSmartAccount.environment,
  scope: {
    type: ScopeType.Erc20TransferAmount,
    tokenAddress,
    // 10 USDC
    maxAmount: parseUnits('10', 6),
  },
})
6. Sign the delegation
Sign the delegation with Alice's account, using the signDelegation method from MetaMaskSmartAccount. Alternatively, you can use the toolkit's signDelegation utility method. Bob will later use the signed delegation to perform actions on Alice's behalf.

const signature = await delegatorSmartAccount.signDelegation({
  delegation,
})

const signedDelegation = {
  ...delegation,
  signature,
}
7. Redeem the delegation
Bob can now redeem the delegation. The redeem transaction is sent to the DelegationManager contract, which validates the delegation and executes actions on Alice's behalf.

To prepare the calldata for the redeem transaction, use the redeemDelegations method from DelegationManager. Since Bob is redeeming a single delegation chain, use the SingleDefault execution mode.

Bob can redeem the delegation by submitting a user operation
 if his account is a smart account, or a regular transaction if his account is an EOA. In this example, Bob transfers 1 USDC from Alice's account to his own.

Redeem with a smart account
Redeem with an EOA
config.ts
import { createExecution, ExecutionMode } from '@metamask/smart-accounts-kit'
import { DelegationManager } from '@metamask/smart-accounts-kit/contracts'
import { zeroAddress } from 'viem'
import { callData } from './config.ts'

const delegations = [signedDelegation]

// USDC address on Ethereum Sepolia.
const tokenAddress = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'

const executions = [createExecution({ target: tokenAddress, callData })]

const redeemDelegationCalldata = DelegationManager.encode.redeemDelegations({
  delegations: [delegations],
  modes: [ExecutionMode.SingleDefault],
  executions: [executions],
})

const userOperationHash = await bundlerClient.sendUserOperation({
  account: delegateSmartAccount,
  calls: [
    {
      to: delegateSmartAccount.address,
      data: redeemDelegationCalldata,
    },
  ],
  maxFeePerGas: 1n,
  maxPriorityFeePerGas: 1n,
})

Use delegation scopes
When creating a delegation, you must configure a scope to define the delegation's initial authority and help prevent delegation misuse. You can further constrain this initial authority by adding caveats to a delegation.

The Smart Accounts Kit currently supports three categories of scopes:

Scope type	Description
Spending limit scopes	Restricts the spending of native, ERC-20, and ERC-721 tokens based on defined conditions.
Function call scope	Restricts the delegation to specific contract methods, contract addresses, or calldata.
Ownership transfer scope	Restricts the delegation to only allow ownership transfers, specifically the transferOwnership function for a specified contract.
Use spending limit scopes
Spending limit scopes define how much a delegate
 can spend in native, ERC-20, or ERC-721 tokens. You can set transfer limits with or without time-based (periodic) or streaming conditions, depending on your use case.

Prerequisites
Install and set up the Smart Accounts Kit.
Configure the Smart Accounts Kit.
Create a delegator account.
Create a delegate account.
ERC-20 periodic scope
This scope ensures a per-period limit for ERC-20 token transfers. You set the amount, period, and start data. At the start of each new period, the allowance resets. For example, Alice creates a delegation that lets Bob spend up to 10 USDC on her behalf each day. Bob can transfer a total of 10 USDC per day; the limit resets at the beginning of the next day.

When this scope is applied, the toolkit automatically disallows native token transfers (sets the native token transfer limit to 0).

Internally, this scope uses the erc20PeriodTransfer and valueLte caveat enforcers
. See the ERC-20 periodic scope reference for more details.

import { createDelegation, ScopeType } from '@metamask/smart-accounts-kit'
import { parseUnits } from 'viem'

// startDate should be in seconds.
const startDate = Math.floor(Date.now() / 1000)

const delegation = createDelegation({
  scope: {
    type: ScopeType.Erc20PeriodTransfer,
    tokenAddress: '0xb4aE654Aca577781Ca1c5DE8FbE60c2F423f37da',
    // USDC has 6 decimal places.
    periodAmount: parseUnits('10', 6),
    periodDuration: 86400,
    startDate,
  },
  to: delegateAccount,
  from: delegatorAccount,
  environment: delegatorAccount.environment,
})
ERC-20 streaming scope
This scopes ensures a linear streaming transfer limit for ERC-20 tokens. Token transfers are blocked until the defined start timestamp. At the start, a specified initial amount is released, after which tokens accrue linearly at the configured rate, up to the maximum allowed amount. For example, Alice creates a delegation that allows Bob to spend 0.1 USDC per second, starting with an initial amount of 10 USDC, up to a maximum of 100 USDC.

When this scope is applied, the toolkit automatically disallows native token transfers (sets the native token transfer limit to 0).

Internally, this scope uses the erc20Streaming and valueLte caveat enforcers
. See the ERC-20 streaming scope reference for more details.

import { createDelegation, ScopeType } from '@metamask/smart-accounts-kit'
import { parseUnits } from 'viem'

// startTime should be in seconds.
const startTime = Math.floor(Date.now() / 1000)

const delegation = createDelegation({
  scope: {
    type: ScopeType.Erc20Streaming,
    tokenAddress: '0xc11F3a8E5C7D16b75c9E2F60d26f5321C6Af5E92',
    // USDC has 6 decimal places.
    amountPerSecond: parseUnits('0.1', 6),
    initialAmount: parseUnits('10', 6),
    maxAmount: parseUnits('100', 6),
    startTime,
  },
  to: delegateAccount,
  from: delegatorAccount,
  environment: delegatorAccount.environment,
})
ERC-20 transfer scope
This scope ensures that ERC-20 token transfers are limited to a predefined maximum amount. This scope is useful for setting simple, fixed transfer limits without any time-based or streaming conditions. For example, Alice creates a delegation that allows Bob to spend up to 10 USDC without any conditions. Bob may use the 10 USDC in a single transaction or make multiple transactions, as long as the total does not exceed 10 USDC.

When this scope is applied, the toolkit automatically disallows native token transfers (sets the native token transfer limit to 0).

Internally, this scope uses the erc20TransferAmount and valueLte caveat enforcers
. See the ERC-20 transfer scope reference for more details.

import { createDelegation, ScopeType } from '@metamask/smart-accounts-kit'
import { parseUnits } from 'viem'

const delegation = createDelegation({
  scope: {
    type: ScopeType.Erc20TransferAmount,
    tokenAddress: '0xc11F3a8E5C7D16b75c9E2F60d26f5321C6Af5E92',
    // USDC has 6 decimal places.
    maxAmount: parseUnits('10', 6),
  },
  to: delegateAccount,
  from: delegatorAccount,
  environment: delegatorAccount.environment,
})
ERC-721 scope
This scope limits the delegation to ERC-721 token transfers only. For example, Alice creates a delegation that allows Bob to transfer an NFT she owns on her behalf.

Internally, this scope uses the erc721Transfer caveat enforcer
. See the ERC-721 scope reference for more details.

import { createDelegation, ScopeType } from '@metamask/smart-accounts-kit'

const delegation = createDelegation({
  scope: {
    type: ScopeType.Erc721Transfer,
    tokenAddress: '0x3fF528De37cd95b67845C1c55303e7685c72F319',
    tokenId: 1n,
  },
  to: delegateAccount,
  from: delegatorAccount,
  environment: delegatorAccount.environment,
})
Native token periodic scope
This scope ensures a per-period limit for native token transfers. You set the amount, period, and start date. At the start of each new period, the allowance resets. For example, Alice creates a delegation that lets Bob spend up to 0.01 ETH on her behalf each day. Bob can transfer a total of 0.01 ETH per day; the limit resets at the beginning of the next day.

When this scope is applied, the toolkit disallows ERC-20 and ERC-721 token transfers by default (sets exactCalldata to 0x). You can optionally configure exactCalldata to restrict transactions to a specific operation, or configure allowedCalldata to allow transactions that match certain patterns or ranges.

Internally, this scope uses the nativeTokenPeriodTransfer caveat enforcer
, and optionally uses the allowedCalldata or exactCalldata caveat enforcers when those parameters are specified. See the native token periodic scope reference for more details.

import { createDelegation, ScopeType } from '@metamask/smart-accounts-kit'
import { parseEther } from 'viem'

// startDate should be in seconds.
const startDate = Math.floor(Date.now() / 1000)

const delegation = createDelegation({
  scope: {
    type: ScopeType.NativeTokenPeriodTransfer,
    periodAmount: parseEther('0.01'),
    periodDuration: 86400,
    startDate,
  },
  to: delegateAccount,
  from: delegatorAccount,
  environment: delegatorAccount.environment,
})
Native token streaming scope
This scopes ensures a linear streaming transfer limit for native tokens. Token transfers are blocked until the defined start timestamp. At the start, a specified initial amount is released, after which tokens accrue linearly at the configured rate, up to the maximum allowed amount. For example, Alice creates delegation that allows Bob to spend 0.001 ETH per second, starting with an initial amount of 0.01 ETH, up to a maximum of 0.1 ETH.

When this scope is applied, the toolkit disallows ERC-20 and ERC-721 token transfers by default (sets exactCalldata to 0x). You can optionally configure exactCalldata to restrict transactions to a specific operation, or configure allowedCalldata to allow transactions that match certain patterns or ranges.

Internally, this scope uses the nativeTokenStreaming caveat enforcer
, and optionally uses the allowedCalldata or exactCalldata caveat enforcers when those parameters are specified. See the native token streaming scope reference for more details.

import { createDelegation, ScopeType } from '@metamask/smart-accounts-kit'
import { parseEther } from 'viem'

// startTime should be in seconds.
const startTime = Math.floor(Date.now() / 1000)

const delegation = createDelegation({
  scope: {
    type: ScopeType.NativeTokenStreaming,
    amountPerSecond: parseEther('0.001'),
    initialAmount: parseEther('0.01'),
    maxAmount: parseEther('0.1'),
    startTime,
  },
  to: delegateAccount,
  from: delegatorAccount,
  environment: delegatorAccount.environment,
})
Native token transfer scope
This scope ensures that native token transfers are limited to a predefined maximum amount. This scope is useful for setting simple, fixed transfer limits without any time-based or streaming conditions. For example, Alice creates a delegation that allows Bob to spend up to 0.1 ETH without any conditions. Bob may use the 0.1 ETH in a single transaction or make multiple transactions, as long as the total does not exceed 0.1 ETH.

When this scope is applied, the toolkit disallows ERC-20 and ERC-721 token transfers by default (sets exactCalldata to 0x). You can optionally configure exactCalldata to restrict transactions to a specific operation, or configure allowedCalldata to allow transactions that match certain patterns or ranges.

Internally, this scope uses the nativeTokenTransferAmount caveat enforcer
, and optionally uses the allowedCalldata or exactCalldata caveat enforcers when those parameters are specified. See the native token transfer scope reference for more details.

import { createDelegation, ScopeType } from '@metamask/smart-accounts-kit'
import { parseEther } from 'viem'

const delegation = createDelegation({
  scope: {
    type: ScopeType.NativeTokenTransferAmount,
    maxAmount: parseEther('0.001'),
  },
  to: delegateAccount,
  from: delegatorAccount,
  environment: delegatorAccount.environment,
})
Use the function call scope
The function call scope defines the specific methods, contract addresses, and calldata that are allowed for the delegation
. For example, Alice delegates to Bob the ability to call the approve function on the USDC contract, with the approval amount set to 0.

Prerequisites
Install and set up the Smart Accounts Kit.
Configure the Smart Accounts Kit.
Create a delegator account.
Create a delegate account.
Function call scope
This scope requires targets, which specifies the permitted contract addresses, and selectors, which specifies the allowed methods.

Internally, this scope uses the allowedTargets, allowedMethods, and valueLte caveat enforcers
, and optionally uses the allowedCalldata or exactCalldata caveat enforcers when those parameters are specified. See the function call scope reference for more details.

The following example sets the delegation scope to allow the delegate to call the approve function on the USDC token contract:

import { createDelegation, ScopeType } from '@metamask/smart-accounts-kit'

// USDC address on Sepolia.
const USDC_ADDRESS = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'

const delegation = createDelegation({
  scope: {
    type: ScopeType.FunctionCall,
    targets: [USDC_ADDRESS],
    selectors: ['approve(address, uint256)'],
  },
  to: delegateAccount,
  from: delegatorAccount,
  environment: delegatorAccount.environment,
})
Define allowed calldata
You can further restrict the scope by defining the allowedCalldata. For example, you can set allowedCalldata so the delegate
 is only permitted to call the approve function on the USDC token contract with an allowance value of 0. This effectively limits the delegate to revoking ERC-20 approvals.

Usage
The allowedCalldata doesn't support multiple selectors. Each entry in the list represents a portion of calldata corresponding to the same function signature.

You can include or exclude specific parameters to precisely define what parts of the calldata are valid.

import { createDelegation, ScopeType } from '@metamask/smart-accounts-kit'
import { encodeAbiParameters, erc20Abi } from 'viem'

// USDC address on Sepolia.
const USDC_ADDRESS = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'

const delegation = createDelegation({
  scope: {
    type: ScopeType.FunctionCall,
    targets: [USDC_ADDRESS],
    selectors: ['approve(address, uint256)'],
    allowedCalldata: [
      {
        // Limits the allowance amount to be 0.
        value: encodeAbiParameters([{ name: 'amount', type: 'uint256' }], [0n]),
        // The first 4 bytes are for selector, and next 32 bytes
        // are for spender address.
        startIndex: 36,
      },
    ],
  },
  to: delegateAccount,
  from: delegatorAccount,
  environment: delegatorAccount.environment,
})
Define exact calldata
You can define the exactCalldata instead of the allowedCalldata. For example, you can set exactCalldata so the delegate
 is permitted to call only the approve function on the USDC token contract, with a specific spender address and an allowance value of 0. This effectively limits the delegate to revoking ERC-20 approvals for a specific spender.

import { createDelegation, ScopeType } from '@metamask/smart-accounts-kit'
import { encodeFunctionData, erc20Abi } from 'viem'

// USDC address on Sepolia.
const USDC_ADDRESS = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'

const delegation = createDelegation({
  scope: {
    type: ScopeType.FunctionCall,
    targets: [USDC_ADDRESS],
    selectors: ['approve(address, uint256)'],
    exactCalldata: {
      calldata: encodeFunctionData({
        abi: erc20Abi,
        args: ['0x0227628f3F023bb0B980b67D528571c95c6DaC1c', 0n],
        functionName: 'approve',
      }),
    },
  },
  to: delegateAccount,
  from: delegatorAccount,
  environment: delegatorAccount.environment,
})
Allow native token transfer
You can set valueLte to allow native token transfer up to a specified amount per call. By default, this value is set to 0. For example, Alice can allow Bob to take 0.00001 ETH as a fee each time he revokes a token approval on her behalf.

import { createDelegation, ScopeType } from '@metamask/smart-accounts-kit'
import { parseEther } from 'viem'

// USDC address on Sepolia.
const USDC_ADDRESS = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'

const delegation = createDelegation({
  scope: {
    type: ScopeType.FunctionCall,
    targets: [USDC_ADDRESS],
    selectors: ['approve(address, uint256)'],
    valueLte: { maxValue: parseEther('0.00001') },
  },
  to: delegateAccount,
  from: delegatorAccount,
  environment: delegatorAccount.environment,
})

Use the ownership transfer scope
The ownership transfer scope restricts a delegation to ownership transfer calls only. For example, Alice has deployed a smart contract, and she delegates to Bob the ability to transfer ownership of that contract.

Prerequisites
Install and set up the Smart Accounts Kit.
Configure the Smart Accounts Kit.
Create a delegator account.
Create a delegate account.
Ownership transfer scope
This scope requires a contractAddress, which represents the address of the deployed contract.

Internally, this scope uses the ownershipTransfer caveat enforcer
. See the ownership transfer scope reference for more details.

import { createDelegation, ScopeType } from '@metamask/smart-accounts-kit'

const contractAddress = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'

const delegation = createDelegation({
  scope: {
    type: ScopeType.OwnershipTransfer,
    contractAddress,
  },
  to: delegateAccount,
  from: delegatorAccount,
  environment: delegatorAccount.environment,
})

Constrain a delegation scope
Delegation scopes define the delegation's initial authority and help prevent delegation misuse. You can further constrain these scopes and limit the delegation's authority by applying caveat enforcers.

Prerequisites
Configure a delegation scope.

Apply a caveat enforcer
For example, Alice creates a delegation with an ERC-20 transfer scope that allows Bob to spend up to 10 USDC. If Alice wants to further restrict the scope to limit Bob's delegation to be valid for only seven days, she can apply the timestamp caveat enforcer.

The following example creates a delegation using createDelegation, applies the ERC-20 transfer scope with a spending limit of 10 USDC, and applies the timestamp caveat enforcer to restrict the delegation's validity to a seven-day period:

import { createDelegation, ScopeType, CaveatType } from '@metamask/smart-accounts-kit'

// Convert milliseconds to seconds.
const currentTime = Math.floor(Date.now() / 1000)

// Seven days after current time.
const beforeThreshold = currentTime + 604800

const caveats = [
  {
    type: CaveatType.Timestamp,
    afterThreshold: currentTime,
    beforeThreshold,
  },
]

const delegation = createDelegation({
  scope: {
    type: ScopeType.Erc20TransferAmount,
    tokenAddress: '0xc11F3a8E5C7D16b75c9E2F60d26f5321C6Af5E92',
    maxAmount: 10000n,
  },
  // Apply caveats to the delegation.
  caveats,
  to: delegateAccount,
  from: delegatorAccount,
  environment: delegatorAccount.environment,
})
Next steps
See the caveats reference for the full list of caveat types and their parameters.
For more specific or custom control, you can also create custom caveat enforcers and apply them to delegations.

Create a redelegation
Redelegation is a core feature that sets delegations apart from other permission sharing frameworks. It allows a delegate
 to create a delegation chain, passing on the same or reduced level of authority from the root delegator
.

For example, if Alice grants Bob permission to spend 10 USDC on her behalf, Bob can further grant Carol permission to spend up to 5 USDC on Alice's behalf-that is, Bob can redelegate. This creates a delegation chain where the root permissions are re-shared with additional parties.

Prerequisites
Install and set up the Smart Accounts Kit.
Learn how to create a delegation.
Create a delegation
Create a root delegation from Alice to Bob.

This example uses the erc20TransferAmount scope
, allowing Alice to delegate to Bob the ability to spend 10 USDC on her behalf.

delegation.ts
config.ts
import { aliceSmartAccount, bobSmartAccount } from './config.ts'
import { createDelegation, ScopeType } from '@metamask/smart-accounts-kit'
import { parseUnits } from 'viem'

const delegation = createDelegation({
  scope: {
    type: ScopeType.Erc20TransferAmount,
    tokenAddress: '0xc11F3a8E5C7D16b75c9E2F60d26f5321C6Af5E92',
    // USDC has 6 decimal places.
    maxAmount: parseUnits('10', 6),
  },
  to: bobSmartAccount.address,
  from: aliceSmartAccount.address,
  environment: aliceSmartAccount.environment,
})

const signedDelegation = aliceSmartAccount.signDelegation({ delegation })
Create a redelegation
Create a redelegation from Bob to Carol. When creating a redelegation, you can only narrow the scope of the original authority, not expand it.

To create a redelegation, provide the signed delegation as the parentDelegation argument when calling createDelegation. This example uses the erc20TransferAmount scope
, allowing Bob to delegate to Carol the ability to spend 5 USDC on Alice's behalf.

redelegation.ts
config.ts
import { bobSmartAccount, carolSmartAccount } from './config.ts'
import { createDelegation, ScopeType } from '@metamask/smart-accounts-kit'
import { parseUnits } from 'viem'

const redelegation = createDelegation({
  scope: {
    type: ScopeType.Erc20TransferAmount,
    tokenAddress: '0xc11F3a8E5C7D16b75c9E2F60d26f5321C6Af5E92',
    // USDC has 6 decimal places.
    maxAmount: parseUnits('5', 6),
  },
  to: carolSmartAccount.address,
  from: bobSmartAccount.address,
  // Signed root delegation from previous step.
  parentDelegation: signedDelegation,
  environment: bobSmartAccount.environment,
})

const signedRedelegation = bobSmartAccount.signDelegation({ delegation: redelegation })
Limit redelegation using caveats
When you create a redelegation, apply the toolkit's caveats to narrow the Carol's authority. For example, you can limit the authority so Carol can use the delegation only once.

To apply caveats, create the Delegation object and use createCaveatBuilder. Use hashDelegation to get the delegation hash, then provide it as the authority field.

This example uses the limitedCalls caveat with a limit of 1.

// Use the config from previous step.
import { bobSmartAccount, carolSmartAccount } from './config.ts'
import { CaveatType } from '@metamask/smart-accounts-kit'
import { createCaveatBuilder, hashDelegation } from '@metamask/smart-accounts-kit/utils'

const caveatBuilder = createCaveatBuilder(bobSmartAccount.environment)

const caveats = caveatBuilder.addCaveat(CaveatType.LimitedCalls, { limit: 1 })

const redelegation: Delegation = {
  delegate: carolSmartAccount.address,
  delegator: bobSmartAccount.address,
  authority: hashDelegation(rootDelegation),
  caveats: caveats.build(),
  salt: '0x',
}

const signedRedelegation = await bobSmartAccount.signDelegation({ delegation: redelegation })

Check the delegation state
When using spending limit delegation scopes or relevant caveat enforcers, you might need to check the remaining transferrable amount in a delegation. For example, if a delegation allows a user to spend 10 USDC per week and they have already spent 10 - n USDC in the current period, you can determine how much of the allowance is still available for transfer.

Use the CaveatEnforcerClient to check the available balances for specific scopes or caveats.

Prerequisites
Install and set up the Smart Accounts Kit.
Create a delegator account.
Create a delegate account.
Create a delegation with an ERC-20 periodic scope.
Create a CaveatEnforcerClient
To check the delegation state, create a CaveatEnforcerClient. This client allows you to interact with the caveat enforcers
 of the delegation, and read the required state.

example.ts
config.ts
import { environment, publicClient as client } from './config.ts'
import { createCaveatEnforcerClient } from '@metamask/smart-accounts-kit'

const caveatEnforcerClient = createCaveatEnforcerClient({
  environment,
  client,
})
Read the caveat enforcer state
This example uses the getErc20PeriodTransferEnforcerAvailableAmount method to read the state and retrieve the remaining amount for the current transfer period.

example.ts
config.ts
import { delegation } from './config.ts'

// Returns the available amount for current period.
const { availableAmount } =
  await caveatEnforcerClient.getErc20PeriodTransferEnforcerAvailableAmount({
    delegation,
  })
  Disable a delegation
Delegations are created offchain and can be stored anywhere, but you can disable a delegation onchain using the toolkit. When a delegation is disabled, any attempt to redeem it will revert, effectively revoking the permissions that were previously granted.

For example, if Alice has given permission to Bob to spend 10 USDC on her behalf, and after a week she wants to revoke that permission, Alice can disable the delegation she created for Bob. If Bob tries to redeem the disabled delegation, the transaction will revert, preventing him from spending Alice's USDC.

Prerequisites
Install and set up the Smart Accounts Kit.
Create a delegator account.
Create a delegate account.
Disable a delegation
To disable a delegation, you can use the disableDelegation utility function from the toolkit to generate calldata. Once the calldata is prepared, you can send it to the Delegation Manager
 to disable the delegation.

example.ts
config.ts
import { DelegationManager } from '@metamask/smart-accounts-kit/contracts'
import { environment, delegation, bundlerClient } from './config.ts'

const disableDelegationData = DelegationManager.encode.disableDelegation({
  delegation,
})

// Appropriate fee per gas must be determined for the specific bundler being used.
const maxFeePerGas = 1n
const maxPriorityFeePerGas = 1n

const userOperationHash = await bundlerClient.sendUserOperation({
  account: delegatorAccount,
  calls: [
    {
      to: environment.DelegationManager,
      data: disableDelegationData,
    },
  ],
  maxFeePerGas,
  maxPriorityFeePerGas,
})
Edit this page
Perform executions on a MetaMask user's behalf
Advanced Permissions (ERC-7715) are fine-grained permissions that your dapp can request from a MetaMask user to execute transactions on their behalf. For example, a user can grant your dapp permission to spend 10 USDC per day to buy ETH over the course of a month. Once the permission is granted, your dapp can use the allocated 10 USDC each day to purchase ETH directly from the MetaMask user's account.

In this guide, you'll request an ERC-20 periodic transfer permission from a MetaMask user to transfer 1 USDC every day on their behalf.

Prerequisites
Install and set up the Smart Accounts Kit.
Install MetaMask Flask 13.5.0 or later.
Steps
1. Set up a Wallet Client
Set up a Wallet Client using Viem's createWalletClient function. This client will help you interact with MetaMask Flask.

Then, extend the Wallet Client functionality using erc7715ProviderActions. These actions enable you to request Advanced Permissions
 from the user.

import { createWalletClient, custom } from 'viem'
import { erc7715ProviderActions } from '@metamask/smart-accounts-kit/actions'

const walletClient = createWalletClient({
  transport: custom(window.ethereum),
}).extend(erc7715ProviderActions())
2. Set up a Public Client
Set up a Public Client using Viem's createPublicClient function. This client will help you query the account state and interact with the blockchain network.

import { createPublicClient, http } from 'viem'
import { sepolia as chain } from 'viem/chains'

const publicClient = createPublicClient({
  chain,
  transport: http(),
})
3. Set up a session account
Set up a session account, which can be either a smart account or an EOA
, to request Advanced Permissions
. The requested permissions are granted to the session account, which is responsible for executing transactions on behalf of the user.

Smart account
EOA
import { privateKeyToAccount } from 'viem/accounts'
import { toMetaMaskSmartAccount, Implementation } from '@metamask/smart-accounts-kit'

const privateKey = '0x...'
const account = privateKeyToAccount(privateKey)

const sessionAccount = await toMetaMaskSmartAccount({
  client: publicClient,
  implementation: Implementation.Hybrid,
  deployParams: [account.address, [], [], []],
  deploySalt: '0x',
  signer: { account },
})
4. Check the EOA account code
With MetaMask Flask 13.9.0 or later, Advanced Permissions support automatically upgrading a user's account to a MetaMask smart account. On earlier versions, upgrade the user to a smart account before requesting Advanced Permissions.

If the user has not yet been upgraded, you can handle the upgrade programmatically or ask the user to switch to a smart account manually.

Why is a Smart Account upgrade is required?
MetaMask's Advanced Permissions (ERC-7715) implementation requires the user to be upgraded to a MetaMask Smart Account because, under the hood, you're requesting a signature for an ERC-7710 delegation. ERC-7710 delegation is one of the core features supported only by MetaMask Smart Accounts.

import { getSmartAccountsEnvironment } from '@metamask/smart-accounts-kit'
import { sepolia as chain } from 'viem/chains'

const addresses = await walletClient.requestAddresses()
const address = addresses[0]

// Get the EOA account code
const code = await publicClient.getCode({
  address,
})

if (code) {
  // The address to which EOA has delegated. According to EIP-7702, 0xef0100 || address
  // represents the delegation.
  //
  // You need to remove the first 8 characters (0xef0100) to get the delegator address.
  const delegatorAddress = `0x${code.substring(8)}`

  const statelessDelegatorAddress = getSmartAccountsEnvironment(chain.id).implementations
    .EIP7702StatelessDeleGatorImpl

  // If account is not upgraded to MetaMask smart account, you can
  // either upgrade programmatically or ask the user to switch to a smart account manually.
  const isAccountUpgraded =
    delegatorAddress.toLowerCase() === statelessDelegatorAddress.toLowerCase()
}
5. Request Advanced Permissions
Request Advanced Permissions from the user with the Wallet Client's requestExecutionPermissions action. In this example, you'll request an ERC-20 periodic permission.

See the requestExecutionPermissions API reference for more information.

import { sepolia as chain } from 'viem/chains'
import { parseUnits } from 'viem'

// Since current time is in seconds, we need to convert milliseconds to seconds.
const currentTime = Math.floor(Date.now() / 1000)
// 1 week from now.
const expiry = currentTime + 604800

// USDC address on Ethereum Sepolia.
const tokenAddress = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'

const grantedPermissions = await walletClient.requestExecutionPermissions([
  {
    chainId: chain.id,
    expiry,
    // The requested permissions will granted to the
    // session account.
    to: sessionAccount.address,
    permission: {
      type: 'erc20-token-periodic',
      data: {
        tokenAddress,
        // 10 USDC in WEI format. Since USDC has 6 decimals, 10 * 10^6
        periodAmount: parseUnits('10', 6),
        // 1 day in seconds
        periodDuration: 86400,
        justification: 'Permission to transfer 10 USDC every day',
      },
      isAdjustmentAllowed: true,
    },
  },
])
6. Set up a Viem client
Set up a Viem client depending on your session account type.

For a smart account, set up a Bundler Client using Viem's createBundlerClient function. This lets you use the bundler
 service to estimate gas for user operations and submit transactions to the network.

For an EOA, set up a Wallet Client using Viem's createWalletClient function. This lets you send transactions directly to the network.

The toolkit provides public actions for both of the clients which can be used to redeem Advanced Permissions, and execute transactions on a user's behalf.

Smart account
EOA
import { createBundlerClient } from 'viem/account-abstraction'
import { erc7710BundlerActions } from '@metamask/smart-accounts-kit/actions'

const bundlerClient = createBundlerClient({
  client: publicClient,
  transport: http('https://your-bundler-rpc.com'),
  // Allows you to use the same Bundler Client as paymaster.
  paymaster: true,
}).extend(erc7710BundlerActions())
7. Redeem Advanced Permissions
The session account can now redeem the permissions. The redeem transaction is sent to the DelegationManager contract, which validates the delegation and executes actions on the user's behalf.

To redeem the permissions, use the client action based on your session account type. A smart account uses the Bundler Client's sendUserOperationWithDelegation action, and an EOA uses the Wallet Client's sendTransactionWithDelegation action.

See the sendUserOperationWithDelegation and sendTransactionWithDelegation API reference for more information.

Smart account
EOA
config.ts
import { calldata } from './config.ts'

// These properties must be extracted from the permission response.
const permissionContext = grantedPermissions[0].context
const delegationManager = grantedPermissions[0].delegationManager

// USDC address on Ethereum Sepolia.
const tokenAddress = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'

// Calls without permissionContext and delegationManager will be executed
// as a normal user operation.
const userOperationHash = await bundlerClient.sendUserOperationWithDelegation({
  publicClient,
  account: sessionAccount,
  calls: [
    {
      to: tokenAddress,
      data: calldata,
      permissionContext,
      delegationManager,
    },
  ],
  // Appropriate values must be used for fee-per-gas.
  maxFeePerGas: 1n,
  maxPriorityFeePerGas: 1n,
})

Get supported permissions
ERC-7715 defines an RPC method that returns the execution permissions a wallet supports. Use the method to verify the available Advanced Permissions
 types and rules before sending requests.

Prerequisites
Install and set up the Smart Accounts Kit
Learn about Advanced Permissions
Request supported permissions
Request the supported Advanced Permissions types for a wallet with the Wallet Client's getSupportedExecutionPermissions action.

response.ts
example.ts
config.ts
import { walletClient } from './config.ts'

const supportedPermissions = await walletClient.getSupportedExecutionPermissions

Use ERC-20 token permissions
Advanced Permissions (ERC-7715) supports ERC-20 token permission types that allow you to request fine-grained permissions for ERC-20 token transfers with periodic, fixed allowance, or streaming conditions, depending on your use case.

Prerequisites
Install and set up the Smart Accounts Kit.
Configure the Smart Accounts Kit.
Create a session account.
ERC-20 allowance permission
This permission type ensures a fixed ERC-20 token allowance. It allows transfers up to a maximum total amount and doesn't reset by period.

For example, a user signs an ERC-7715 permission that lets your dapp spend up to 50 USDC in total. After the dapp transfers 50 USDC, no additional transfers are allowed under this permission.

See the ERC-20 allowance permission API reference for more information.

example.ts
client.ts
import { sepolia as chain } from 'viem/chains'
import { parseUnits } from 'viem'
import { walletClient } from './client.ts'

// Since current time is in seconds, convert milliseconds to seconds.
const currentTime = Math.floor(Date.now() / 1000)
// 1 week from now.
const expiry = currentTime + 604800

// USDC address on Ethereum Sepolia.
const tokenAddress = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'

const grantedPermissions = await walletClient.requestExecutionPermissions([
  {
    chainId: chain.id,
    expiry,
    // The requested permissions will be granted to the
    // session account.
    to: sessionAccount.address,
    permission: {
      type: 'erc20-token-allowance',
      data: {
        tokenAddress,
        // 50 USDC in WEI format. Since USDC has 6 decimals, 50 * 10^6.
        allowanceAmount: parseUnits('50', 6),
        startTime: currentTime,
        justification: 'Permission to transfer up to 50 USDC in total',
      },
      isAdjustmentAllowed: true,
    },
  },
])
ERC-20 periodic permission
This permission type ensures a per-period limit for ERC-20 token transfers. At the start of each new period, the allowance resets.

For example, a user signs an ERC-7715 permission that lets a dapp spend up to 10 USDC on their behalf each day. The dapp can transfer a total of 10 USDC per day; the limit resets at the beginning of the next day.

See the ERC-20 periodic permission API reference for more information.

example.ts
client.ts
import { sepolia as chain } from 'viem/chains'
import { parseUnits } from 'viem'
import { walletClient } from './client.ts'

// Since current time is in seconds, convert milliseconds to seconds.
const currentTime = Math.floor(Date.now() / 1000)
// 1 week from now.
const expiry = currentTime + 604800

// USDC address on Ethereum Sepolia.
const tokenAddress = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'

const grantedPermissions = await walletClient.requestExecutionPermissions([
  {
    chainId: chain.id,
    expiry,
    // The requested permissions will be granted to the
    // session account.
    to: sessionAccount.address,
    permission: {
      type: 'erc20-token-periodic',
      data: {
        tokenAddress,
        // 10 USDC in WEI format. Since USDC has 6 decimals, 10 * 10^6.
        periodAmount: parseUnits('10', 6),
        // 1 day in seconds.
        periodDuration: 86400,
        justification: 'Permission to transfer 10 USDC every day',
      },
      isAdjustmentAllowed: true,
    },
  },
])
ERC-20 stream permission
This permission type ensures a linear streaming transfer limit for ERC-20 tokens. Token transfers are blocked until the defined start timestamp. At the start, a specified initial amount is released, after which tokens accrue linearly at the configured rate, up to the maximum allowed amount.

For example, a user signs an ERC-7715 permission that allows a dapp to spend 0.1 USDC per second, starting with an initial amount of 1 USDC, up to a maximum of 2 USDC.

See the ERC-20 stream permission API reference for more information.

example.ts
client.ts
import { sepolia as chain } from 'viem/chains'
import { parseUnits } from 'viem'
import { walletClient } from './client.ts'

// Since current time is in seconds, convert milliseconds to seconds.
const currentTime = Math.floor(Date.now() / 1000)
// 1 week from now.
const expiry = currentTime + 604800

// USDC address on Ethereum Sepolia.
const tokenAddress = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'

const grantedPermissions = await walletClient.requestExecutionPermissions([
  {
    chainId: chain.id,
    expiry,
    // The requested permissions will be granted to the
    // session account.
    to: sessionAccount.address,
    permission: {
      type: 'erc20-token-stream',
      data: {
        tokenAddress,
        // 0.1 USDC in WEI format. Since USDC has 6 decimals, 0.1 * 10^6.
        amountPerSecond: parseUnits('0.1', 6),
        // 1 USDC in WEI format. Since USDC has 6 decimals, 1 * 10^6.
        initialAmount: parseUnits('1', 6),
        // 2 USDC in WEI format. Since USDC has 6 decimals, 2 * 10^6.
        maxAmount: parseUnits('2', 6),
        startTime: currentTime,
        justification: 'Permission to use 0.1 USDC per second',
      },
      isAdjustmentAllowed: true,
    },
  },
])


Use native token permissions
Advanced Permissions (ERC-7715) supports native token permission types that allow you to request fine-grained permissions for native token transfers with periodic, fixed-allowance, or streaming conditions, depending on your use case.

Prerequisites
Install and set up the Smart Accounts Kit.
Configure the Smart Accounts Kit.
Create a session account.
Native token allowance permission
This permission type ensures a fixed native token allowance. It allows transfers up to a maximum total amount and doesn't reset by period.

For example, a user signs an ERC-7715 permission that lets your dapp spend up to 0.05 ETH in total. After the dapp transfers 0.05 ETH, no additional transfers are allowed under this permission.

See the native token allowance permission API reference for more information.

example.ts
client.ts
import { sepolia as chain } from 'viem/chains'
import { parseEther } from 'viem'
import { walletClient } from './client.ts'

// Since current time is in seconds, convert milliseconds to seconds.
const currentTime = Math.floor(Date.now() / 1000)
// 1 week from now.
const expiry = currentTime + 604800

const grantedPermissions = await walletClient.requestExecutionPermissions([
  {
    chainId: chain.id,
    expiry,
    // The requested permissions will be granted to the
    // session account.
    to: sessionAccount.address,
    permission: {
      type: 'native-token-allowance',
      data: {
        // 0.05 ETH in wei format.
        allowanceAmount: parseEther('0.05'),
        startTime: currentTime,
        justification: 'Permission to transfer up to 0.05 ETH in total',
      },
      isAdjustmentAllowed: true,
    },
  },
])
Native token periodic permission
This permission type ensures a per-period limit for native token transfers. At the start of each new period, the allowance resets.

For example, a user signs an ERC-7715 permission that lets a dapp spend up to 0.001 ETH on their behalf each day. The dapp can transfer a total of 0.001 ETH per day; the limit resets at the beginning of the next day.

See the native token periodic permission API reference for more information.

example.ts
client.ts
import { sepolia as chain } from 'viem/chains'
import { parseEther } from 'viem'
import { walletClient } from './client.ts'

// Since current time is in seconds, convert milliseconds to seconds.
const currentTime = Math.floor(Date.now() / 1000)
// 1 week from now.
const expiry = currentTime + 604800

const grantedPermissions = await walletClient.requestExecutionPermissions([
  {
    chainId: chain.id,
    expiry,
    // The requested permissions will be granted to the
    // session account.
    to: sessionAccount.address,
    permission: {
      type: 'native-token-periodic',
      data: {
        // 0.001 ETH in wei format.
        periodAmount: parseEther('0.001'),
        // 1 hour in seconds.
        periodDuration: 86400,
        startTime: currentTime,
        justification: 'Permission to use 0.001 ETH every day',
      },
      isAdjustmentAllowed: true,
    },
  },
])
Native token stream permission
This permission type ensures a linear streaming transfer limit for native tokens. Token transfers are blocked until the defined start timestamp. At the start, a specified initial amount is released, after which tokens accrue linearly at the configured rate, up to the maximum allowed amount.

For example, a user signs an ERC-7715 permission that allows a dapp to spend 0.0001 ETH per second, starting with an initial amount of 0.1 ETH, up to a maximum of 1 ETH.

See the native token stream permission API reference for more information.

example.ts
client.ts
import { sepolia as chain } from 'viem/chains'
import { parseEther } from 'viem'
import { walletClient } from './client.ts'

// Since current time is in seconds, convert milliseconds to seconds.
const currentTime = Math.floor(Date.now() / 1000)
// 1 week from now.
const expiry = currentTime + 604800

const grantedPermissions = await walletClient.requestExecutionPermissions([
  {
    chainId: chain.id,
    expiry,
    // The requested permissions will be granted to the
    // session account.
    to: sessionAccount.address,
    permission: {
      type: 'native-token-stream',
      data: {
        // 0.0001 ETH in wei format.
        amountPerSecond: parseEther('0.0001'),
        // 0.1 ETH in wei format.
        initialAmount: parseEther('0.1'),
        // 1 ETH in wei format.
        maxAmount: parseEther('1'),
        startTime: currentTime,
        justification: 'Permission to use 0.0001 ETH per second',
      },
      isAdjustmentAllowed: true,
    },
  },
])


Use approval revocation permission
Advanced Permissions (ERC-7715) supports the token approval revocation permission type that allows you to request permission to revoke existing token approvals on behalf of the user.

Prerequisites
Install and set up the Smart Accounts Kit.
Configure the Smart Accounts Kit.
Create a session account.
Token approval revocation permission
This permission type enables revoking existing token approvals on behalf of the user.

For example, a user signs an ERC-7715 permission that lets a dapp revoke any ERC-20 token allowances periodically, or during an ongoing exploit.

See the token approval revocation permission API reference for more information.

example.ts
client.ts
import { sepolia as chain } from 'viem/chains'
import { walletClient } from './client.ts'

// Since current time is in seconds, convert milliseconds to seconds.
const currentTime = Math.floor(Date.now() / 1000)

// 30 days from now.
const expiry = currentTime + 60 * 60 * 24 * 30

const grantedPermissions = await walletClient.requestExecutionPermissions([
  {
    chainId: chain.id,
    expiry,
    // The requested permissions will be granted to the
    // session account.
    to: sessionAccount.address,
    permission: {
      type: 'token-approval-revocation',
      data: {
        erc20Approve: true,
        erc721Approve: false,
        erc721SetApprovalForAll: false,
        permit2Approve: true,
        permit2Lockdown: false,
        permit2InvalidateNonces: false,
        justification: 'Permission to revoke ERC-20 token approvals',
      },
      isAdjustmentAllowed: false,
    },
  },
])


x402 Payments
x402 is an open payment protocol that uses the HTTP 402 status code to enable programmatic, machine-to-machine payments over HTTP. It allows servers to charge for API access without requiring buyer accounts, API keys, or traditional payment infrastructure.

For example, an AI agent can pay 0.01 USDC per request to access a weather API, or a dapp can charge users a micro-payment to retrieve premium onchain analytics data.

ERC-7710 payments
The standard x402 protocol supports direct token transfers (using ERC-20 Permit2 or EIP-3009). ERC-7710 extends this by enabling delegation
-based payments from MetaMask smart accounts
.

With ERC-7710, a buyer's smart account creates a delegation that authorizes the facilitator to transfer tokens on their behalf. The buyer doesn't sign a direct token approval. Instead, they sign a delegation that the facilitator redeems during settlement.

This approach enables buyers to pay from MetaMask wallet. Buyers can restrict delegations to specific facilitator addresses, amounts, and time windows using delegation scopes
. They can also create long lived delegations that allow recurring payments without re-signing for each request.

Learn more ERC-7710 delegations.

Guides
Get started with x402 payments in Smart Accounts Kit. These guides walk you through seller endpoint setup and buyer payment flows.

Create an x402 server with ERC-7710
In this guide, you build a Node.js server that charges for HTTP API access using x402 and accepts ERC-7710 delegation payments verified through the MetaMask facilitator.

You use the official @x402/express middleware with the @metamask/x402 package, which provides an ERC-7710 server scheme that routes verification and settlement through the MetaMask facilitator.

Prerequisites
Node.js 18 or later.
A Node.js Express server.
A seller payout address to receive funds (for example, a MetaMask wallet address).
Facilitator URLs
The following table lists the available MetaMask facilitator endpoints:

Name	ID	URL
Base	eip155:8453	https://tx-sentinel-base-mainnet.dev-api.cx.metamask.io/platform/v2/x402
Base Sepolia	eip155:84532	https://tx-sentinel-base-sepolia.dev-api.cx.metamask.io/platform/v2/x402
Monad	eip155:143	https://tx-sentinel-monad-mainnet.dev-api.cx.metamask.io/platform/v2/x402
Steps
1. Install the dependencies
npm
Yarn
pnpm
Bun
npm install @metamask/x402 @x402/core @x402/express cors express
2. Configure middleware
Set up the Express server with the x402 paymentMiddleware and the x402ExactEvmErc7710ServerScheme from @metamask/x402. The scheme automatically adds payment requirements with ERC-7710 fields when assetTransferMethod is set to erc7710 in the route configuration.

The paymentMiddleware intercepts requests to protected routes and handles the full x402 payment flow, including requirements advertisement, verification, and settlement.

In this example, you create a protected GET /api/hello endpoint that charges 0.01 USDC on Base Sepolia. Replace the payout address in src/config.ts with your own seller wallet address.

src/index.ts
src/config.ts
import express, { type Request, type Response } from 'express'
import cors from 'cors'
import { paymentMiddleware, x402ResourceServer } from '@x402/express'
import { x402ExactEvmErc7710ServerScheme } from '@metamask/x402'
import { NETWORK_ID, PORT, payToAddress, facilitatorClient } from './config.js'

const app = express()
app.use(cors({ exposedHeaders: ['PAYMENT-REQUIRED', 'PAYMENT-RESPONSE'] }))

app.use(
  paymentMiddleware(
    {
      'GET /api/hello': {
        accepts: [
          {
            scheme: 'exact',
            price: '$0.01',
            network: NETWORK_ID,
            payTo: payToAddress,
            extra: {
              assetTransferMethod: 'erc7710',
            },
          },
        ],
        description: 'Access to protected resource',
        mimeType: 'application/json',
      },
    },
    new x402ResourceServer(facilitatorClient).register(
      NETWORK_ID,
      new x402ExactEvmErc7710ServerScheme()
    )
  )
)

app.get('/api/hello', (_req: Request, res: Response) => {
  res.json({ message: 'Hello!' })
})

app.listen(PORT, () => {
  console.log(`[seller] Server running on http://localhost:${PORT}`)
})
Next steps
Learn more about ERC-7710 delegation.
See the x402 ERC-7710 specification.
Edit this page

Pay for an x402 API with delegation
In this guide, you use a buyer account to access API data from an x402 server by creating a delegation
 that authorizes token transfers on your behalf.

You use createx402DelegationProvider to set up an x402Erc7710Client with a delegation provider, register it with the x402 client, and use wrapFetchWithPayment to automatically handle payment when calling a protected API route.

Prerequisites
Install and set up the Smart Accounts Kit.
Steps
1. Install the dependencies
npm
Yarn
pnpm
Bun
npm install @x402/core @x402/fetch @metamask/x402
2. Create a buyer account
Create an account to represent the buyer, the delegator
 who creates a delegation.

The delegator must be a MetaMask smart account
. Use the toolkit's toMetaMaskSmartAccount method to create the buyer account.

Important
Fund the smart account with USDC for the requested payment.

example.ts
config.ts
import { Implementation, toMetaMaskSmartAccount } from '@metamask/smart-accounts-kit'
import { publicClient, buyerAccount } from './config'

export const buyerSmartAccount = await toMetaMaskSmartAccount({
  client: publicClient,
  implementation: Implementation.Hybrid,
  deployParams: [buyerAccount.address, [], [], []],
  deploySalt: '0x',
  signer: { account: buyerAccount },
})
3. Create an x402 ERC-7710 client
Create an x402Erc7710Client using createx402DelegationProvider. The provider creates an open
 root delegation
, signs it, and returns an ABI-encoded delegation chain when the x402 client needs to pay for a request.

The provider appends redeemer, allowedTargets, and timestamp caveats
 if not already present.

import { createx402DelegationProvider } from '@metamask/smart-accounts-kit/experimental'
import { x402Erc7710Client } from '@metamask/x402'

const erc7710Client = new x402Erc7710Client({
  delegationProvider: createx402DelegationProvider({
    account: buyerSmartAccount,
  }),
})
4. Register the client
Register the ERC-7710 client with the x402 core client for all EVM networks. Create an HTTP client and a payment-aware fetch function using wrapFetchWithPayment.

import { x402Client, x402HTTPClient } from '@x402/core/client'
import { wrapFetchWithPayment } from '@x402/fetch'

const coreClient = new x402Client().register('eip155:*', erc7710Client)
const httpClient = new x402HTTPClient(coreClient)

const fetchWithPayment = wrapFetchWithPayment(fetch, httpClient)
5. Make the paid request
Call the protected endpoint using fetchWithPayment. It handles the x402 payment flow, calling your delegation provider to create an open delegation
 when the server returns a 402 response.

const paidResponse = await fetchWithPayment('https://api.example.com/paid-endpoint', {
  method: 'GET',
})

Pay for an x402 API with Advanced Permissions
In this guide, you request Advanced Permissions
 with a fixed ERC-20 allowance to pay for a specific x402-protected resource.

Prerequisites
Install and set up the Smart Accounts Kit.
Steps
1. Set up a Wallet Client
Set up a Wallet Client using Viem's createWalletClient function. Use this client to interact with MetaMask.

Extend the Wallet Client with erc7715ProviderActions to enable Advanced Permissions
 requests.

import { createWalletClient, custom } from 'viem'
import { erc7715ProviderActions } from '@metamask/smart-accounts-kit/actions'

const walletClient = createWalletClient({
  transport: custom(window.ethereum),
}).extend(erc7715ProviderActions())
2. Set up a session account
Set up a session account. The requested permissions are granted to the session account, which is responsible for making x402 API calls.

The session account can be either a smart account
 or an EOA
. This example uses an EOA as the session account.

import { privateKeyToAccount } from 'viem/accounts'
import { sepolia as chain } from 'viem/chains'
import { createWalletClient, http } from 'viem'

const sessionAccount = privateKeyToAccount('0x...')
3. Get payment requirements
Call the protected API route once without the PAYMENT-SIGNATURE header.

The server returns 402 with the payment terms (PAYMENT-REQUIRED) in the response, which you use to build the payment payload.

example.ts
types.ts
import { PaymentRequirements } from './types'

// Update the URL
const challengeResponse = await fetch('https://api.example.com/paid-endpoint')
if (challengeResponse.status !== 402) {
  console.error('Expected 402 challenge from protected route')
  // Handle error
}

const paymentRequiredHeader = challengeResponse.headers.get('PAYMENT-REQUIRED')
if (!paymentRequiredHeader) {
  console.error('PAYMENT-REQUIRED header is missing')
  // Handle error
}

const decodedPaymentRequired = Buffer.from(paymentRequiredHeader, 'base64').toString('utf-8')
const paymentRequired = JSON.parse(decodedPaymentRequired) as {
  accepts: PaymentRequirements[]
}

const accepted = paymentRequired.accepts[0]
if (!accepted) {
  console.error('Server did not provide accepted payment requirements')
  // Handle error
}

if (accepted.extra.assetTransferMethod !== 'erc7710') {
  console.error('Server does not support ERC-7710 delegation payments')
  // Handle error
}
4. Request Advanced Permissions
Request Advanced Permissions from the user with the Wallet Client's requestExecutionPermissions action.

In this example, you request an ERC-20 allowance permission with a fixed allowance equal to the resource cost. Use the redeemer rule to restrict redemption to facilitator addresses from the payment requirements.

See the requestExecutionPermissions API reference for more information.

import { base as chain } from 'viem/chains'

const facilitators = accepted.extra.facilitators
if (!facilitators || facilitators.length === 0) {
  console.error('No facilitators found in PAYMENT-REQUIRED')
  // Handle error
}

const currentTime = Math.floor(Date.now() / 1000)
const expiry = currentTime + 3600

const grantedPermissions = await walletClient.requestExecutionPermissions([
  {
    chainId: chain.id,
    expiry,
    to: sessionAccount.address,
    permission: {
      type: 'erc20-token-allowance',
      data: {
        tokenAddress: accepted.asset,
        // Fixed allowance for this resource.
        allowanceAmount: BigInt(accepted.amount),
        justification: 'Permission to pay for a specific x402-protected API resource',
      },
      isAdjustmentAllowed: false,
    },
    rules: [
      {
        type: 'redeemer',
        data: {
          addresses: facilitators!,
        },
      },
    ],
  },
])
5. Create a redelegation
The granted advanced permission is delegated to the session account. To let facilitator addresses redeem this permission context for x402 settlement, create an open redelegation
 from the session account.

Use the Wallet Client's redelegatePermissionContextOpen action to create a redelegated permission context. The granted permission already includes a redeemer enforcer, so you do not add extra caveats here.

example.ts
config.ts
import { environment, sessionAccountWalletClient } from './config.ts'

const permission = grantedPermissions[0]
if (!permission) {
  console.error('No permission response returned by requestExecutionPermissions')
  // Handle error
}

const { permissionContext: redelegatedPermissionContext } =
  await sessionAccountWalletClient.redelegatePermissionContextOpen({
    environment,
    permissionContext: permission!.context,
  })
6. Create the payment payload
Create a payment payload using the redelegated permission context and accepted requirements. For ERC-7710 (Smart Contract Delegation), x402 requires the payload fields delegationManager, permissionContext, and delegator. The facilitator uses permissionContext to simulate during verification and then settle the payment.

Encode the full x402 payment payload as base64, then send it in the PAYMENT-SIGNATURE header.

example.ts
types.ts
import { PaymentPayload } from './types'

const permission = grantedPermissions[0]

const paymentPayload: PaymentPayload = {
  x402Version: 2,
  accepted,
  payload: {
    delegationManager: permission.delegationManager,
    permissionContext: redelegatedPermissionContext,
    delegator: permission.from,
  },
}

const encodedPayment = Buffer.from(JSON.stringify(paymentPayload)).toString('base64')
7. Make the paid request
Send the base64-encoded x402 payment payload in the PAYMENT-SIGNATURE header. If verification succeeds, the server returns the protected data.

const apiResponse = await fetch('https://api.example.com/paid-endpoint', {
  headers: {
    'PAYMENT-SIGNATURE': encodedPayment,
  },
})

if (!apiResponse.ok) {
  const errorBody = await apiResponse.json()
  console.error(errorBody.error ?? 'API request failed')
  // Handle error
}

const data = await apiResponse.json()
console.log('Protected API response:', data)


Recurring x402 payments
In this guide, you set up recurring x402 payments by requesting an ERC-20 periodic Advanced Permissions
 permission from a user.

For example, a user gives your agent permission to spend up to 10 USDC per week. Later, when the agent calls an x402 endpoint, it checks the price, uses the granted permission, and pays.

Prerequisites
Install and set up the Smart Accounts Kit.
Steps
1. Install the dependencies
npm
Yarn
pnpm
Bun
npm install @x402/core @x402/fetch @metamask/x402
2. Set up a Wallet Client
Set up a Wallet Client using Viem's createWalletClient function. Use this client to interact with MetaMask.

Extend the Wallet Client with erc7715ProviderActions to enable Advanced Permissions
 requests.

import { createWalletClient, custom } from 'viem'
import { erc7715ProviderActions } from '@metamask/smart-accounts-kit/actions'

const walletClient = createWalletClient({
  transport: custom(window.ethereum),
}).extend(erc7715ProviderActions())
3. Set up an agent account
The session account can be either a smart account
 or an EOA
. This example uses an EOA as the session account.

import { privateKeyToAccount } from 'viem/accounts'

const sessionAccount = privateKeyToAccount('0x...')
4. Request Advanced Permissions
Request Advanced Permissions from the user with the Wallet Client's requestExecutionPermissions action.

In this example, you request an ERC-20 periodic permission with a weekly allowance of 10 USDC. This creates a recurring payment budget that your agent can store and reuse for x402 API calls.

See the requestExecutionPermissions API reference for more information.

import { base as chain } from 'viem/chains'
import { parseUnits } from 'viem'

// USDC address on Base.
const tokenAddress = '0x...'

const currentTime = Math.floor(Date.now() / 1000)
const expiry = currentTime + 60 * 60 * 24 * 30 // Permission expires in 30 days.

const grantedPermissions = await walletClient.requestExecutionPermissions([
  {
    chainId: chain.id,
    expiry,
    to: sessionAccount.address,
    permission: {
      type: 'erc20-token-periodic',
      data: {
        tokenAddress,
        periodAmount: parseUnits('10', 6),
        periodDuration: 604800,
        startTime: currentTime,
        justification:
          'Permission for agent to spend up to 10 USDC every week for making x402 API calls',
      },
      isAdjustmentAllowed: false,
    },
  },
])
5. Create an x402 ERC-7710 client
Create an x402Erc7710Client using createx402DelegationProvider.

The provider creates an open redelegation
 from the session account using the granted permission. The facilitator can then redeem the redelegated permission context for x402 settlement.

import { createx402DelegationProvider } from '@metamask/smart-accounts-kit/experimental'
import { x402Erc7710Client } from '@metamask/x402'

const permission = grantedPermissions[0]

const erc7710Client = new x402Erc7710Client({
  delegationProvider: createx402DelegationProvider({
    account: sessionAccount,
    parentPermissionContext: permission.context,
    from: permission.from,
  }),
})
6. Register the client
Register the ERC-7710 client with the x402 core client for all EVM networks, then create an HTTP client and a payment-aware fetch function using wrapFetchWithPayment.

import { x402Client, x402HTTPClient } from '@x402/core/client'
import { wrapFetchWithPayment } from '@x402/fetch'

const coreClient = new x402Client().register('eip155:*', erc7710Client)
const httpClient = new x402HTTPClient(coreClient)

const fetchWithPayment = wrapFetchWithPayment(fetch, httpClient)
7. Make the paid request
Call the protected endpoint using fetchWithPayment. The x402 payment flow calls your delegation provider to create an open redelegation when the server returns a 402 response.

const paidResponse = await fetchWithPayment('https://api.example.com/paid-endpoint', {
  method: 'GET',
})
You can reuse the same weekly granted permission for additional protected routes and providers in your agent flow. Your agent continues paying until the weekly cap is reached, then resumes after the next weekly period starts.


MetaMask Smart Accounts
The Smart Accounts Kit enables you to create and manage MetaMask Smart Accounts. MetaMask Smart Accounts are ERC-4337 smart contract accounts that support programmable account behavior and advanced features such as multi-signature approvals, automated transaction batching, and custom security policies. Unlike traditional wallets, which rely on private keys for every transaction, MetaMask Smart Accounts use smart contracts to govern account logic.

MetaMask Smart Accounts are referenced in the toolkit as MetaMaskSmartAccount.

Account abstraction (ERC-4337)
Account abstraction, specified by ERC-4337, is a mechanism that enables users to manage smart contract accounts containing arbitrary verification logic. ERC-4337 enables smart contracts to be used as primary accounts in place of traditional private key-based accounts, or externally owned accounts (EOAs).

ERC-4337 introduces the following concepts:

User operation - A package of instructions signed by a user, specifying executions for the smart account to perform. User operations are collected and submitted to the network by bundlers.

Bundler - A service that collects multiple user operations, packages them into a single transaction, and submits them to the network, optimizing gas costs and transaction efficiency.

Entry point contract - A contract that validates and processes bundled user operations, ensuring they adhere to the required rules and security checks.

Paymasters - Entities that handle the payment of gas fees on behalf of users, often integrated into smart accounts to facilitate gas abstraction.

Smart account implementation types
The toolkit supports three types of MetaMask Smart Accounts, each offering unique features and use cases.

See Create a smart account to learn how to use these different account types.

Hybrid smart account
The Hybrid smart account is a flexible implementation that supports both an externally owned account (EOA) owner and any number of passkey (WebAuthn) signers. You can configure any of these signers, and use them to sign any data, including user operations, on behalf of the smart account.

This type is referenced in the toolkit as Implementation.Hybrid.

Multisig smart account
The Multisig smart account is an implementation that supports multiple signers with a configurable threshold, allowing for enhanced security and flexibility in account management. A valid signature requires signatures from at least the number of signers specified by the threshold.

This type is referenced in the toolkit as Implementation.Multisig.

Stateless 7702 smart account
The Stateless 7702 smart account implementation represents an externally owned account (EOA) upgraded to support smart account functionality as defined by EIP-7702. This implementation enables EOAs to perform smart account operations, including the creation and management of delegations.

This type is referenced in the toolkit as Implementation.Stateless7702.

Smart account flow
The MetaMask Smart Accounts flow is as follows:

Account setup - A user creates a smart account by deploying a smart contract, and initializing it with ownership and security settings. The user can customize the smart account in the following ways:

Account logic - They can configure custom logic for actions such as multi-signature approvals, spending limits, and automated transaction batching.

Security and recovery - They can configure advanced security features such as two-factor authentication and mechanisms for account recovery involving trusted parties.

Gas management - They can configure flexible gas payment options, including alternative tokens or third-party sponsorship.

User operation creation - For actions such as sending transactions, a user operation is created with necessary details and signed by the configured signers.

Bundlers and mempool - The signed user operation is submitted to a special mempool, where bundlers collect and package multiple user operations into a single transaction to save on gas costs.

Validation and execution - The bundled transaction goes to an entry point contract, which validates each user operation and executes them if they meet the smart contract's rules.

Delegator accounts
Delegator accounts are a type of MetaMask smart account that allows users to grant permission to other smart accounts or EOAs to perform specific executions on their behalf, under defined rules and restrictions. Learn more about delegation.

Delegation
Delegation is the ability for a MetaMask smart account to grant permission to another smart contract or externally owned account (EOA) to perform specific executions on its behalf. The account that grants the permission is called the delegator account, while the account that receives the permission is called the delegate account.

The Smart Accounts Kit follows the ERC-7710 standard for smart contract delegation. In addition, users can use delegation scopes and caveat enforcers to apply rules and restrictions to delegations. For example, Alice delegates the ability to spend her USDC to Bob, limiting the amount to 100 USDC.

Delegation types
You can create the following delegation types:

Root delegation
A root delegation is when a delegator delegates their own authority away, as opposed to redelegating permissions they received from a previous delegation. In a chain of delegations, the first delegation is the root delegation. For example, Alice delegates the ability to spend her USDC to Bob, limiting the amount to 100 USDC.

Use createDelegation to create a root delegation.

Open root delegation
An open root delegation is a root delegation that doesn't specify a delegate. This means that any account can redeem the delegation. For example, Alice delegates the ability to spend 100 of her USDC to anyone.

You must create open root delegations carefully, to ensure that they are not misused. Use createOpenDelegation to create an open root delegation.

Redelegation
A delegate can redelegate permissions that have been granted to them, creating a chain of delegations across trusted parties. For example, Alice delegates the ability to spend 100 of her USDC to Bob. Bob redelegates the ability to spend 50 of Alice's 100 USDC to Carol.

See how to create a redelegation guide to learn more.

Open redelegation
An open redelegation is a redelegation that doesn't specify a delegate. This means that any account can redeem the redelegation. For example, Alice delegates the ability to spend 100 of her USDC to Bob. Bob redelegates the ability to spend 50 of Alice's 100 USDC to anyone.

As with open root delegations, you must create open redelegations carefully, to ensure that they are not misused. Use createOpenDelegation to create an open redelegation.

Attenuating authority
When creating chains of delegations via redelegations, it's important to understand how authority flows and can be restricted.

Each delegation in the chain inherits all restrictions from its parent delegation.
New caveats can add further restrictions, but can't remove existing ones.
This means that a delegate can only redelegate with equal or lesser authority than they received.

Delegation flow
The delegation flow consists of the following steps:

Caveat enforcer
Delegation Manager
Delegate
Delegator
Caveat enforcer
Delegation Manager
Delegate
Delegator
Hold delegation until redemption
Expect no error
Expect no error
Expect no error
Expect no error
Expect no error
Create delegation with caveat
enforcers
Sign delegation
Send signed delegation
redeemDelegations() with delegation &
execution details
isValidSignature()
Confirm valid (or not)
beforeAllHook()
beforeHook()
executeFromExecutor() with execution details
Perform execution
afterHook()
afterAllHook()
Step 1. Create a delegation
The delegator creates a delegation, configuring a scope and optional caveats that define the conditions under which the delegation can be redeemed.

Step 2. Sign the delegation
The delegator signs the delegation, producing a verifiable signature that the Delegation Manager can later validate.

Step 3. Send the signed delegation
The delegator sends the signed delegation to the delegate. A dapp can store the delegation in the storage solution of their choice (such as a local database, Filecoin, or other databases), enabling retrieval for future redemption.

Step 4. Redeem the delegation
The delegate submits the signed delegation to the Delegation Manager by calling redeemDelegations() with the delegation and execution details.

Step 5. Validate the delegation
The Delegation Manager validates the input data by ensuring the lengths of delegations, modes, and executions match. It also verifies delegation signatures, ensuring validity using ECDSA (for EOAs) or isValidSignature (for contracts).

Step 6. Execute beforeHook
If the signature validation passes, the Delegation Manager executes the beforeHook for each caveat in the delegation, passing relevant data (terms, arguments, mode, execution calldata, and delegationHash) to the caveat enforcer.

Step 7. Perform execution
If beforeHook validation passes, the Delegation Manager calls executeFromExecutor to perform the delegation's execution, either by the delegator or the caller for self-authorized executions.

Step 8. Execute afterHook
The Delegation Manager runs each caveat enforcer's afterHook and afterAllHook to verify post-execution conditions.

See how to perform executions on a smart account's behalf for a step-by-step guide.

Delegation Framework
The Smart Accounts Kit includes the Delegation Framework, a set of comprehensively audited smart contracts that collectively handle smart account creation, the delegation lifecycle, and caveat enforcement.

It consists of the following components:

Component	Description
Delegation Manager	Validates delegations and triggers executions on behalf of the delegator, ensuring tasks are executed accurately and securely.
Caveat enforcers	Manage rules and restrictions for delegations, providing fine-tuned control over delegated executions.

Delegation Manager
The Delegation Manager is a core component of the Delegation Framework. It validates delegations and triggers executions on behalf of the delegator, ensuring tasks are executed accurately, and securely.

See the delegation flow for a full overview of how delegations are created, validated, and redeemed.

Execution modes
The Delegation Manager processes delegations based on a specified execution mode. When redeeming a delegation using redeemDelegations, you must pass an execution mode for each delegation chain you pass to the method. The Smart Accounts Kit supports the following execution modes, based on ERC-7579:

Execution mode	Number of delegation chains passed to redeemDelegations	Processing method	Does user operation continue execution if redemption reverts?
SingleDefault	One	Sequential	No
SingleTry	One	Sequential	Yes
BatchDefault	Multiple	Interleaved	No
BatchTry	Multiple	Interleaved	Yes
Sequential processing
In Single modes, the Delegation Manager processes delegations sequentially:

For each delegation in the chain, all caveats' before hooks are called.
The single redeemed action is executed.
For each delegation in the chain, all caveats' after hooks are called.
Interleaved processing
In Batch modes, the Delegation Manager processes delegations in an interleaved manner:

For each chain in the batch, and each delegation in the chain, all caveats' before hooks are called.
Each redeemed action is executed.
For each chain in the batch, and each delegation in the chain, all caveats' after hooks are called.
Batch mode allows for powerful use cases, but the Delegation Framework currently does not include any Batch compatible caveat enforcers.


Caveat enforcers
The Smart Accounts Kit provides caveat enforcers, which are smart contracts that implement rules and restrictions on delegations. They serve as the underlying mechanism that enables conditional execution within the Delegation Framework. See the delegation flow for how caveat enforcer hooks are called during delegation redemption.

A caveat enforcer acts as a gate that validates whether a delegation can be used for a particular execution. When a delegate attempts to execute an action on behalf of a delegator, each caveat enforcer specified in the delegation evaluates whether the execution meets its defined criteria.

Important
Without caveat enforcers, a delegation has infinite and unbounded authority to make any execution the original account can make. We strongly recommend using caveat enforcers.
Caveat enforcers safeguard the execution process but do not guarantee a final state post-redemption. Always consider the full impact of combined caveat enforcers.
Hooks
The interface consists of four key hook functions that are called at different stages of the delegation redemption process. Each of these hooks receives comprehensive information about the execution context, including:

The caveat terms specified by the delegator.
Optional arguments provided by the redeemer.
The execution mode and calldata.
The delegation hash.
The delegator and redeemer addresses.
Hook	Description
beforeAllHook	Called before any actions in a batch redemption process begin. Verifies conditions that must be true for the entire batch execution.
beforeHook	Called before the execution tied to a specific delegation. Allows for pre-execution validation of conditions specific to that delegation.
afterHook	Called after the execution tied to a specific delegation completes. Verifies post-execution state changes or effects specific to that delegation.
afterAllHook	Called after all actions in a batch redemption process have completed. Verifies final conditions after the entire batch has executed.
The most important safety feature of these hooks is their ability to block executions:

If any hook determines its conditions aren't met, it will revert (throw an exception).
When a reversion occurs, the entire delegation redemption process is canceled.
This prevents partial or invalid executions from occurring.
No state changes from the attempted execution will be committed to the blockchain.
This "all-or-nothing" approach ensures that delegations only execute exactly as intended by their caveats.

Available caveat enforcers
The Smart Accounts Kit provides out-of-the-box caveat enforcers for common restriction patterns, including:

Limiting target addresses and methods.
Setting time or block number constraints.
Restricting token transfers and approvals.
Limiting execution frequency.
For other restriction patterns, you can also create custom caveat enforcers by implementing the ICaveatEnforcer interface.
Delegation scopes
When creating a delegation, you must configure a scope to define the delegation's initial authority and help prevent delegation misuse.

Scopes are not part of the Delegation Framework itself, but an abstraction introduced in the Smart Accounts Kit that builds on top of caveat enforcers to provide pre-configured restriction patterns for common use cases.

Scopes vs. caveats
Scopes and caveats work together to define and restrict a delegation's authority:

Scopes define the initial authority of a delegation. They determine the broad category of actions the delegate is permitted to perform, such as transferring tokens or calling specific contract functions.
Caveats further constrain the authority granted by the scope. They add additional restrictions on top of the scope, such as time limits or execution frequency.
For example, a spending limit scope might allow a delegate to transfer up to 100 USDC, while an additional caveat could restrict the transfers to only occur within a specific time window.

See how to constrain a delegation's scope by adding caveats.

Categories
The Smart Accounts Kit supports three categories of scopes:

Scope type	Description
Spending limit scopes	Restricts the spending of native, ERC-20, and ERC-721 tokens based on defined conditions.
Function call scope	Restricts the delegation to specific contract methods, contract addresses, or calldata.
Ownership transfer scope	Restricts the delegation to only allow ownership transfers, specifically the transferOwnership function for a specified contract.

Advanced Permissions (ERC-7715)
The Smart Accounts Kit supports Advanced Permissions (ERC-7715), which lets you request fine-grained permissions from a MetaMask user to execute transactions on their behalf. For example, a user can grant your dapp permission to spend 10 USDC per day to buy ETH over the course of a month. Once the permission is granted, your dapp can use the allocated 10 USDC each day to purchase ETH directly from the MetaMask user's account.

Advanced Permissions eliminate the need for users to approve every transaction, which is useful for highly interactive dapps. It also enables dapps to execute transactions for users without an active wallet connection.

note
This feature requires MetaMask Flask 13.5.0 or later.

ERC-7715 technical overview
ERC-7715 defines a JSON-RPC method wallet_grantPermissions. Dapps can use this method to request a wallet to grant the dapp permission to execute transactions on a user's behalf. wallet_grantPermissions requires a signer parameter, which identifies the entity requesting or managing the permission. Common signer implementations include wallet signers, single key and multisig signers, and account signers.

The Smart Accounts Kit supports multiple signer types. The documentation uses an account signer as a common implementation example. When you use an account signer, a session account is created solely to request and redeem Advanced Permissions, and doesn't contain tokens. The session account can be granted with permissions and redeem them as specified in ERC-7710. The session account can be a smart account or an externally owned account (EOA).

The MetaMask user that the session account requests permissions from must be upgraded to a MetaMask smart account.

Advanced Permissions vs. delegations
Advanced Permissions expand on regular delegations by enabling permission sharing via the MetaMask browser extension.

With regular delegations, the dapp constructs a delegation and requests the user to sign it. These delegations are not human-readable, so it is the dapp's responsibility to provide context for the user. Regular delegations cannot be signed through the MetaMask extension, because if a dapp requests a delegation without constraints, the whole wallet can be exposed to the dapp.

In contrast, Advanced Permissions enable dapps (and AI agents) to request permissions from a user directly via the MetaMask extension. Advanced Permissions require a permission configuration which displays a human-readable confirmation for the MetaMask user. The user can modify the permission parameters if the request is configured to allow adjustments.

For example, the following Advanced Permissions request displays a rich UI including the start time, amount, and period duration for an ERC-20 token periodic transfer:

ERC-7715 request

Advanced Permissions lifecycle
The Advanced Permissions lifecycle is as follows:

Set up a session account - Set up a session account to execute transactions on behalf of the MetaMask user. It can be a smart account or an externally owned account (EOA).

Request permissions - Request permissions from the user. The Smart Accounts Kit supports ERC-20 token permissions and native token permissions.

Redeem permissions - Once the permission is granted, the session account can redeem the permission, executing on the user's behalf.

See how to perform executions on a MetaMask user's behalf to get started with the Advanced Permissions lifecycle.

MetaMask Smart Accounts API reference
The following API methods are related to creating, managing, and signing with MetaMask Smart Accounts.

aggregateSignature
Aggregates multiple partial signatures into a single combined multisig signature.

Parameters
Name	Type	Required	Description
signatures	PartialSignature[]	Yes	Collection of partial signatures provided by signers, to be merged into an aggregated signature.
Example
example.ts
config.ts
import {
  bundlerClient,
  aliceSmartAccount,
  bobSmartAccount,
  aliceAccount,
  bobAccount,
} from './config.ts'
import { aggregateSignature } from '@metamask/smart-accounts-kit'

const userOperation = await bundlerClient.prepareUserOperation({
  account: aliceSmartAccount,
  calls: [
    {
      target: zeroAddress,
      value: 0n,
      data: '0x',
    },
  ],
})

const aliceSignature = await aliceSmartAccount.signUserOperation(userOperation)
const bobSignature = await bobSmartAccount.signUserOperation(userOperation)

const aggregatedSignature = aggregateSignature({
  signatures: [
    {
      signer: aliceAccount.address,
      signature: aliceSignature,
      type: 'ECDSA',
    },
    {
      signer: bobAccount.address,
      signature: bobSignature,
      type: 'ECDSA',
    },
  ],
})
encodeCalls
Encodes calls for execution by a MetaMask smart account. If there's a single call directly to the smart account, it returns the call data directly. For multiple calls or calls to other addresses, it creates executions and encodes them for the smart account's execute function.

The execution mode is set to SingleDefault for a single call to other address, or BatchDefault for multiple calls.

Parameters
Name	Type	Required	Description
calls	Call[]	Yes	List of calls to be encoded.
Example
example.ts
config.ts
import { smartAccount } from './config.ts'

const calls = [
  {
    to: zeroAddress,
    data: '0x',
    value: 0n,
  },
]

const executeCallData = await smartAccount.encodeCalls(calls)
getFactoryArgs
Returns the factory address and factory data that can be used to deploy a smart account.

Example
example.ts
config.ts
import { smartAccount } from './config.ts'

const { factory, factoryData } = await smartAccount.getFactoryArgs()
getNonce
Returns the nonce for a smart account.

Parameters
Name	Type	Required	Description
key	bigint	No	The nonce key to retrieve the nonce. Different keys maintain independent nonce sequences, enabling parallel user operation execution.
Example
example.ts
config.ts
import { smartAccount } from './config.ts'

const nonce = await smartAccount.getNonce()
signDelegation
Signs the delegation and returns the delegation signature.

Parameters
Name	Type	Required	Description
delegation	Omit<Delegation, "signature">	Yes	The unsigned delegation object to sign.
chainId	number	No	The chain ID on which the Delegation Manager is deployed.
Example
example.ts
config.ts
import {
  createDelegation,
  getSmartAccountsEnvironment,
  ScopeType,
} from '@metamask/smart-accounts-kit'
import { delegatorSmartAccount } from './config.ts'

// The address to which the delegation is granted. It can be an EOA address, or
// smart account address.
const delegate = '0x2FcB88EC2359fA635566E66415D31dD381CF5585'

const delegation = createDelegation({
  to: delegate,
  from: account.address,
  environment: delegatorSmartAccount.environment,
  scope: {
    type: ScopeType.NativeTokenTransferAmount,
    // 0.001 ETH in wei format.
    maxAmount: 1000000000000000n,
  },
})

const signature = delegatorSmartAccount.signDelegation({ delegation })
signMessage
Generates the EIP-191 signature using the MetaMaskSmartAccount signer. The Smart Accounts Kit uses Viem under the hood to provide this functionality.

Parameters
See the Viem signMessage parameters.

Example
example.ts
config.ts
import { smartAccount } from './config.ts'

const signature = smartAccount.signMessage({
  message: 'hello world',
})
signTypedData
Generates the EIP-712 signature using the MetaMaskSmartAccount signer. The Smart Accounts Kit uses Viem under the hood to provide this functionality.

Parameters
See the Viem signTypedData parameters.

Example
example.ts
config.ts
import { smartAccount } from './config.ts'

const signature = smartAccount.signTypedData({
  domain,
  types,
  primaryType: 'Mail',
  message: {
    from: {
      name: 'Cow',
      wallet: '0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826',
    },
    to: {
      name: 'Bob',
      wallet: '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB',
    },
    contents: 'Hello, Bob!',
  },
})
signUserOperation
Signs a user operation
 with the MetaMaskSmartAccount signer. The Delegation Toolkit uses Viem under the hood to provide this functionality.

Parameters
See the Viem signUserOperation parameters.

Example
example.ts
config.ts
import { smartAccount } from './config.ts'

const userOpSignature = smartAccount.signUserOperation({
  callData: '0xdeadbeef',
  callGasLimit: 141653n,
  maxFeePerGas: 15000000000n,
  maxPriorityFeePerGas: 2000000000n,
  nonce: 0n,
  preVerificationGas: 53438n,
  sender: '0xE911628bF8428C23f179a07b081325cAe376DE1f',
  verificationGasLimit: 259350n,
  signature: '0x',
})
toMetaMaskSmartAccount
Creates a MetaMaskSmartAccount instance.

Parameters
Name	Type	Required	Description
client	Client	Yes	Viem Client to retrieve smart account data.
implementation	TImplementation	Yes	Implementation type for the smart account. Can be Hybrid
, Multisig
, or Stateless7702
.
signer	SignerConfigByImplementation <TImplementation>	No	Signer for the smart account. Can be a Viem Account, Viem Wallet Client, or a WebAuthn Account. WebAuthn accounts are only supported for Hybrid implementations. If omitted, non-signing operations still work, but signing operations such as signUserOperation, signDelegation, signMessage, and signTypedData will throw an error.
environment	SmartAccountsEnvironment	No	Environment to resolve the smart contracts.
deployParams	DeployParams<TImplementation>	Required if address is not provided	The parameters that will be used to deploy the smart account and generate its deterministic address.
deploySalt	Hex	Required if address is not provided	The salt that will be used to deploy the smart account.
address	Address	Required if deployParams and deploySalt are not provided, or if the implementation is Stateless7702.	The address of the smart account. If an address is provided, the smart account will not be deployed. This should be used if you intend to interact with an existing smart account.
nonceKeyManager	NonceManager	No	A custom nonce key manager for managing nonces. If provided, it enables support for multiple nonce keys to avoid collisions during parallel user operation execution.
Hybrid implementation
deployParams
All Hybrid deploy parameters are required:

Name	Type	Description
owner	Hex	The owner's account address. The owner can be the zero address, indicating that there is no owner configured.
p256KeyIds	Hex[]	An array of key identifiers for passkey signers.
p256XValues	bigint[]	An array of public key x-values for passkey signers.
p256YValues	bigint[]	An array of public key y-values for passkey signers.
Example
example.ts
config.ts
import { Implementation, toMetaMaskSmartAccount } from '@metamask/smart-accounts-kit'
import { publicClient, account } from './config.ts'

const smartAccount = await toMetaMaskSmartAccount({
  client: publicClient,
  implementation: Implementation.Hybrid,
  deployParams: [account.address, [], [], []],
  deploySalt: '0x',
  signer: { account: account },
})
Multisig implementation
deployParams
All Multisig deploy parameters are required:

Name	Type	Description
signers	Hex[]	An array of EOA signer addresses.
threshold	bigint	The number of signers required to execute a transaction.
Example
example.ts
config.ts
import { publicClient, aliceAccount, bobAccount } from './config.ts'
import { Implementation, toMetaMaskSmartAccount } from '@metamask/smart-accounts-kit'

const signers = [aliceAccount.address, bobAccount.address]
const threshold = 2n

const aliceSmartAccount = await toMetaMaskSmartAccount({
  client: publicClient,
  implementation: Implementation.MultiSig,
  deployParams: [signers, threshold],
  deploySalt: '0x',
  signer: [{ account: aliceAccount }],
})
Stateless7702 implementation example
example.ts
config.ts
import { Implementation, toMetaMaskSmartAccount } from '@metamask/smart-accounts-kit'
import { publicClient, account } from './config.ts'

const smartAccount = await toMetaMaskSmartAccount({
  client: publicClient,
  implementation: Implementation.Stateless7702,
  address: account.address,
  signer: { account },
})
Delegation API reference
The following API methods are related to creating and managing delegations.

createCaveatBuilder
Builds an array of caveats
.

Parameters
Name	Type	Required	Description
environment	SmartAccountsEnvironment	Yes	Environment to resolve the smart contracts for the current chain.
config	CaveatBuilderConfig	No	Configuration for CoreCaveatBuilder.
Example
import { createCaveatBuilder } from '@metamask/smart-accounts-kit/utils'
import { getSmartAccountsEnvironment } from '@metamask/smart-accounts-kit'
import { sepolia } from 'viem/chains'

const environment = getSmartAccountsEnvironment(sepolia.id)
const caveatBuilder = createCaveatBuilder(environment)
Allow empty caveats
To create an empty caveat collection, set the CaveatBuilderConfig.allowInsecureUnrestrictedDelegation to true.

example.ts
import { createCaveatBuilder } from '@metamask/smart-accounts-kit/utils'
import { getSmartAccountsEnvironment } from '@metamask/smart-accounts-kit'
import { sepolia } from 'viem/chains'

const environment = getSmartAccountsEnvironment(sepolia.id)
const caveatBuilder = createCaveatBuilder(environment, {
  allowInsecureUnrestrictedDelegation: true,
})
createDelegation
Creates a delegation with a specific delegate
.

Parameters
Name	Type	Required	Description
from	Hex	Yes	The address that is granting the delegation.
to	Hex	Yes	The address to which the delegation is being granted.
scope	ScopeConfig	Yes	The scope of the delegation that defines the initial authority. See delegation scopes for the full list of scope types and their parameters.
environment	SmartAccountsEnvironment	Yes	The environment used by the toolkit to define contract addresses for interacting with the Delegation Framework
 contracts.
caveats	Caveats	No	Caveats that further refine the authority granted by the scope. See caveats reference for the full list of caveat types and their parameters.
parentDelegation	Delegation | Hex	No	The parent delegation or its corresponding hex to create a delegation chain. Mutually exclusive with parentPermissionContext.
parentPermissionContext	PermissionContext	No	Parent chain as Hex or as decoded Delegation values (leaf first). Mutually exclusive with parentDelegation.
salt	Hex	No	The salt for generating the delegation hash. This helps prevent hash collisions when creating identical delegations.
Example
import {
  createDelegation,
  getSmartAccountsEnvironment,
  ScopeType,
} from '@metamask/smart-accounts-kit'
import { sepolia } from 'viem/chains'
import { parseEther } from 'viem'

const delegation = createDelegation({
  // Address that is granting the delegation
  from: '0x7E48cA6b7fe6F3d57fdd0448B03b839958416fC1',
  // Address to which the delegation is being granted
  to: '0x2B2dBd1D5fbeB77C4613B66e9F35dBfE12cB0488',
  // Alternatively you can use environment property of MetaMask smart account.
  environment: getSmartAccountsEnvironment(sepolia.id),
  scope: {
    type: ScopeType.NativeTokenTransferAmount,
    // 0.001 ETH in wei format.
    maxAmount: parseEther('0.001'),
  },
})
createOpenDelegation
Creates an open delegation
 that can be redeemed by any delegate.

Parameters
Name	Type	Required	Description
from	Hex	Yes	The address that is granting the delegation.
scope	ScopeConfig	Conditional	Defines the delegation authority. See delegation scopes for supported types and parameters. Required for a root open delegation. Optional when either parentDelegation or parentPermissionContext is set; if omitted, authority is inherited from the parent chain.
environment	SmartAccountsEnvironment	Yes	The environment used by the toolkit to define contract addresses for interacting with the Delegation Framework
 contracts.
caveats	Caveats	No	Caveats that further refine the authority granted by the scope. See caveats reference for the full list of caveat types and their parameters.
parentDelegation	Delegation | Hex	No	The parent delegation or its corresponding hex to create a delegation chain. Mutually exclusive with parentPermissionContext.
parentPermissionContext	PermissionContext	No	Parent chain as Hex or as decoded Delegation values (leaf first). Mutually exclusive with parentDelegation.
salt	Hex	No	The salt for generating the delegation hash. This helps prevent hash collisions when creating identical delegations.
Example
import {
  createOpenDelegation,
  getSmartAccountsEnvironment,
  ScopeType,
} from '@metamask/smart-accounts-kit'
import { sepolia } from 'viem/chains'
import { parseEther } from 'viem'

const delegation = createOpenDelegation({
  // Address that is granting the delegation
  from: '0x7E48cA6b7fe6F3d57fdd0448B03b839958416fC1',
  // Alternatively you can use environment property of MetaMask smart account.
  environment: getSmartAccountsEnvironment(sepolia.id),
  scope: {
    type: ScopeType.NativeTokenTransferAmount,
    // 0.001 ETH in wei format.
    maxAmount: parseEther('0.001'),
  },
})
createExecution
Creates an ExecutionStruct instance.

Parameters
Name	Type	Required	Description
target	Address	No	Address of the contract or recipient that the call is directed to.
value	bigint	No	Value of native tokens to send along with the call in wei.
callData	Hex	No	Encoded function data or payload to be executed on the target address.
Example
import { createExecution } from '@metamask/smart-accounts-kit'
import { parseEther } from 'viem'

// Creates an ExecutionStruct to transfer 0.01 ETH to
// 0xe3C818389583fDD5cAC32f548140fE26BcEaE907 address.
const execution = createExecution({
  target: '0xe3C818389583fDD5cAC32f548140fE26BcEaE907',
  // 0.01 ETH in wei
  value: parseEther('0.01'),
  callData: '0x',
})
decodeDelegations
Decodes an ABI-encoded hex string to an array of delegations.

Use decodeDelegations when working with a permission context that contains a delegation chain, such as the context property returned by requestExecutionPermissions response.

Parameters
Name	Type	Required	Description
encoded	Hex	Yes	The ABI encoded hex string to decode.
Example
import { decodeDelegations } from '@metamask/smart-accounts-kit/utils'

const delegations = decodeDelegations('0x7f0db33d..c06aeeac')
decodeDelegation
Decodes an ABI-encoded hex string to a single delegation.

Use decodeDelegation when you have a single encoded delegation rather than an encoded delegation chain.

Parameters
Name	Type	Required	Description
encoded	Hex	Yes	The ABI-encoded hex string to decode.
Example
import { decodeDelegation } from '@metamask/smart-accounts-kit/utils'

const delegation = decodeDelegation('0x7f0db33d..c06aeeac')
decodeCaveat
Decodes a caveat's encoded terms.

Throws an error if the caveat enforcer is not a known enforcer in SmartAccountsEnvironment.

Parameters
Name	Type	Required	Description
caveat	Caveat	Yes	The caveat
 object containing an enforcer address and ABI-encoded terms.
environment	SmartAccountsEnvironment	Yes	Environment to resolve the caveat enforcer
 addresses.
Example
example.ts
config.ts
import { decodeCaveat } from '@metamask/smart-accounts-kit/utils'
import { delegation } from './config.ts'

const environment = delegation.environment

// Decode the first caveat from the delegation.
const decodedCaveat = decodeCaveat({
  caveat: delegation.caveats[0],
  environment,
})

// Output:
// {
//   type: 'erc20TransferAmount',
//   tokenAddress: '0x1c7D...7238',
//   maxAmount: 10000000n,
// }
decodeRevertData
Decodes raw ABI-encoded revert data into a DecodedRevertReason.

Tries standard Solidity errors, and known Delegation Framework
 ABIs, then falls back to decoding printable ASCII bytes.

Returns undefined if the data could not be decoded.

Parameters
Name	Type	Required	Description
rawData	Hex	Yes	The raw ABI-encoded revert data.
Example
import { decodeRevertData } from '@metamask/smart-accounts-kit/utils'

const decoded = decodeRevertData('0x08c379a0...')
decodeRevertReason
Extracts revert data from an error object and decodes it using decodeRevertData. Use this when you catch an error from any Delegation Framework
 interaction and want to decode the revert reason.

Returns undefined if no revert data is found in the error.

Parameters
Name	Type	Required	Description
error	unknown	Yes	The error object to extract and decode revert data from.
Example
This example assumes you have a delegation signed by the delegator
.

import { ExecutionMode } from '@metamask/smart-accounts-kit'
import { DelegationManager } from '@metamask/smart-accounts-kit/contracts'
import { decodeRevertReason } from '@metamask/smart-accounts-kit/utils'

try {
  await DelegationManager.execute.redeemDelegations({
    delegations: [[signedDelegation]],
    modes: [ExecutionMode.SingleDefault],
    executions: [[execution]],
  })
} catch (error) {
  const decoded = decodeRevertReason(error)
  if (decoded) {
    console.log(decoded.message)
  }
}
deploySmartAccountsEnvironment
Deploys the Delegation Framework
 contracts to an EVM chain.

Parameters
Name	Type	Required	Description
walletClient	WalletClient	Yes	Viem Wallet Client to deploy the contracts.
publicClient	PublicClient	Yes	Viem Public Client to interact with the given chain.
chain	Chain	Yes	Viem Chain where you wish to deploy the Delegation Framework contracts.
deployedContracts	{ [contract: string]: Hex }	No	Allows overriding specific contract addresses when calling the function. For example, if certain contracts have already been deployed on the target chain, their addresses can be provided directly to the function.
Example
example.ts
config.ts
import { deploySmartAccountsEnvironment } from '@metamask/smart-accounts-kit/utils'
import { walletClient, publicClient } from './config.ts'
import { sepolia as chain } from 'viem/chains'

const environment = await deploySmartAccountsEnvironment(walletClient, publicClient, chain)
Inject deployed contracts
Once the contracts are deployed, you can use them to override the delegator environment using overrideDeployedEnvironment.

example.ts
import { walletClient, publicClient } from './config.ts'
import { sepolia as chain } from 'viem/chains'
import { SmartAccountsEnvironment } from '@metamask/smart-accounts-kit'
import {
  overrideDeployedEnvironment,
  deploySmartAccountsEnvironment,
} from '@metamask/smart-accounts-kit/utils'

const environment: SmartAccountsEnvironment = await deploySmartAccountsEnvironment(
  walletClient,
  publicClient,
  chain
)

overrideDeployedEnvironment(chain.id, '1.3.0', environment)
disableDelegation
Encodes the calldata for disabling a delegation.

Parameters
Name	Type	Required	Description
delegation	Delegation	Yes	The delegation to be disabled.
Example
example.ts
delegation.ts
import { DelegationManager } from '@metamask/smart-accounts-kit/contracts'
import { delegation } from './delegation.ts'

const disableDelegationData = DelegationManager.encode.disableDelegation({
  delegation,
})
enableDelegation
Encodes the calldata to enable a disabled delegation.

Parameters
Name	Type	Required	Description
delegation	Delegation	Yes	The delegation to be enabled.
Example
import { DelegationManager } from '@metamask/smart-accounts-kit/contracts'

const enableDelegationData = DelegationManager.encode.enableDelegation({
  delegation, // Already disabled delegation.
})
encodeDelegations
Encodes an array of delegations to an ABI-encoded hex string.

Parameters
Name	Type	Required	Description
delegations	Delegation[]	Yes	The delegation array to be encoded.
Example
example.ts
delegation.ts
import { encodeDelegations } from '@metamask/smart-accounts-kit/utils'
import { delegation } from './delegation.ts'

const encodedDelegations = encodeDelegations([delegation])
encodeDelegation
Encodes a single delegation to an ABI-encoded hex string.

Parameters
Name	Type	Required	Description
delegation	Delegation	Yes	The delegation to be encoded.
Example
example.ts
delegation.ts
import { encodeDelegation } from '@metamask/smart-accounts-kit/utils'
import { delegation } from './delegation.ts'

const encodedDelegation = encodeDelegation(delegation)
hashDelegation
Returns the delegation hash.

Parameters
Name	Type	Required	Description
input	Delegation	Yes	The delegation object to hash.
Example
example.ts
config.ts
import { hashDelegation } from '@metamask/smart-accounts-kit/utils'
import { delegation } from './config.ts'

const delegationHash = hashDelegation(delegation)
getSmartAccountsEnvironment
Resolves the SmartAccountsEnvironment for a chain.

Parameters
Name	Type	Required	Description
chainId	number	Yes	The chain ID of the network for which the SmartAccountsEnvironment should be resolved.
version	SupportedVersion	No	Specifies the version of the Delegation Framework
 contracts to use. If omitted, the latest supported version will be used by default.
Example
import { getSmartAccountsEnvironment } from '@metamask/smart-accounts-kit'
import { sepolia } from 'viem/chains'

const environment = getSmartAccountsEnvironment(sepolia.id)
generateSalt
Generates a random 32-byte hex salt for creating delegations. This helps prevent hash collisions when creating identical delegations.

Example
import { generateSalt } from '@metamask/smart-accounts-kit/utils'

const salt = generateSalt()
overrideDeployedEnvironment
Overrides or adds the SmartAccountsEnvironment for a chain and supported version.

Parameters
Name	Type	Required	Description
chainId	number	Yes	The chain ID of the network for which the SmartAccountsEnvironment should be overridden.
version	SupportedVersion	Yes	The version of the Delegation Framework
 contracts to override for the specified chain.
environment	SmartAccountsEnvironment	Yes	The environment containing contract addresses to override for the given chain and version.
Example
example.ts
environment.ts
import { environment } from './environment.ts'
import { overrideDeployedEnvironment } from '@metamask/smart-accounts-kit/utils'
import { sepolia } from 'viem/chains'

overrideDeployedEnvironment(sepolia.id, '1.3.0', environment)
redeemDelegations
Encodes calldata for redeeming delegations. This method supports batch redemption, allowing multiple delegations to be processed within a single transaction.

Parameters
Name	Type	Required	Description
delegations	Delegation[][]	Yes	A nested collection representing chains of delegations. Each inner collection contains a chain of delegations to be redeemed.
modes	ExecutionMode[]	Yes	A collection specifying the execution mode for each corresponding delegation chain.
executions	ExecutionStruct[][]	Yes	A nested collection where each inner collection contains a list of ExecutionStruct objects associated with a specific delegation chain.
Example
This example assumes you have a delegation signed by the delegator
.

import { createExecution, ExecutionMode } from '@metamask/smart-accounts-kit'
import { DelegationManager } from '@metamask/smart-accounts-kit/contracts'
import { zeroAddress } from 'viem'

const data = DelegationManager.encode.redeemDelegations({
  delegations: [[signedDelegation]],
  modes: [ExecutionMode.SingleDefault],
  executions: [[execution]],
})
signDelegation
Signs the delegation and returns the delegation signature.

Parameters
Name	Type	Required	Description
privateKey	Hex	Yes	The private key to use for signing the delegation.
delegation	Omit<Delegation, "signature">	Yes	The unsigned delegation object to sign.
chainId	number	Yes	The chain ID on which the delegation manager is deployed.
delegationManager	0x${string}	Yes	The address of the Delegation Manager.
name	string	No	The name of the domain of the Delegation Manager. The default is DelegationManager.
version	string	No	The version of the domain of the Delegation Manager. The default is 1.
allowInsecureUnrestrictedDelegation	boolean	No	Whether to allow insecure unrestricted delegation with no caveats
. The default is false.
Example
example.ts
config.ts
import { signDelegation } from '@metamask/smart-accounts-kit'
import { privateKey, delegation, delegationManager } from './config.ts'
import { sepolia } from 'viem/chains'

const signature = signDelegation({
  privateKey,
  delegation,
  chainId: sepolia.id,
  delegationManager,
})

Advanced Permissions reference
When executing on a MetaMask user's behalf, you can request the following permission types. Learn how to use Advanced Permissions types.

ERC-20 token permissions
ERC-20 allowance permission
Ensures a fixed ERC-20 token allowance. Transfers are allowed until the total transferred amount reaches the allowance amount.

Parameters
Name	Type	Required	Description
tokenAddress	Address	Yes	The ERC-20 token contract address.
allowanceAmount	bigint	Yes	The maximum total amount of tokens that can be transferred.
startTime	number	No	The start timestamp in seconds. The default is the current time.
justification	string	No	A human-readable explanation of why the permission is being requested.
Example
import { parseUnits } from 'viem'

const currentTime = Math.floor(Date.now() / 1000)
const expiry = currentTime + 604800

const permission = {
  type: 'erc20-token-allowance',
  data: {
    tokenAddress: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    allowanceAmount: parseUnits('50', 6),
    startTime: currentTime,
    justification: 'Permission to transfer up to 50 USDC in total',
  },
  isAdjustmentAllowed: true,
}
ERC-20 periodic permission
Ensures a per-period limit for ERC-20 token transfers. At the start of each new period, the allowance resets.

Parameters
Name	Type	Required	Description
tokenAddress	Address	Yes	The ERC-20 token contract address as a hex string.
periodAmount	bigint	Yes	The maximum amount of tokens that can be transferred per period.
periodDuration	number	Yes	The duration of each period in seconds.
startTime	number	No	The start timestamp in seconds. The default is the current time.
justification	string	No	A human-readable explanation of why the permission is being requested.
Example
import { parseUnits } from 'viem'

const currentTime = Math.floor(Date.now() / 1000)
const expiry = currentTime + 604800

const permission = {
  type: 'erc20-token-periodic',
  data: {
    tokenAddress: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    periodAmount: parseUnits('10', 6),
    periodDuration: 86400,
    justification: 'Permission to transfer 10 USDC every day',
  },
  isAdjustmentAllowed: true,
}
ERC-20 stream permission
Ensures a linear streaming transfer limit for ERC-20 tokens. Token transfers are blocked until the defined start timestamp. At the start, a specified initial amount is released, after which tokens accrue linearly at the configured rate, up to the maximum allowed amount.

Parameters
Name	Type	Required	Description
tokenAddress	Address	Yes	The ERC-20 token contract address.
initialAmount	bigint	No	The initial amount that can be transferred at start time. The default is 0.
maxAmount	bigint	No	The maximum total amount that can be unlocked. The default is no limit.
amountPerSecond	bigint	Yes	The rate at which tokens accrue per second.
startTime	number	No	The start timestamp in seconds. The default is the current time.
justification	string	No	A human-readable explanation of why the permission is being requested.
Example
import { parseUnits } from 'viem'

const currentTime = Math.floor(Date.now() / 1000)
const expiry = currentTime + 604800

const permission = {
  type: 'erc20-token-stream',
  data: {
    tokenAddress: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    amountPerSecond: parseUnits('0.1', 6),
    initialAmount: parseUnits('1', 6),
    maxAmount: parseUnits('2', 6),
    startTime: currentTime,
    justification: 'Permission to use 0.1 USDC per second',
  },
  isAdjustmentAllowed: true,
}
Native token permissions
Native token allowance permission
Ensures a fixed native token allowance. Transfers are allowed until the total transferred amount reaches the allowance amount.

Parameters
Name	Type	Required	Description
allowanceAmount	bigint	Yes	The maximum total amount of tokens that can be transferred.
startTime	number	No	The start timestamp in seconds. The default is the current time.
justification	string	No	A human-readable explanation of why the permission is being requested.
Example
import { parseEther } from 'viem'

const currentTime = Math.floor(Date.now() / 1000)
const expiry = currentTime + 604800

const permission = {
  type: 'native-token-allowance',
  data: {
    allowanceAmount: parseEther('0.05'),
    startTime: currentTime,
    justification: 'Permission to transfer up to 0.05 ETH in total',
  },
  isAdjustmentAllowed: true,
}
Native token periodic permission
Ensures a per-period limit for native token transfers. At the start of each new period, the allowance resets.

Parameters
Name	Type	Required	Description
periodAmount	bigint	Yes	The maximum amount of tokens that can be transferred per period.
periodDuration	number	Yes	The duration of each period in seconds.
startTime	number	No	The start timestamp in seconds. The default is the current time.
justification	string	No	A human-readable explanation of why the permission is being requested.
Example
import { parseEther } from 'viem'

const currentTime = Math.floor(Date.now() / 1000)
const expiry = currentTime + 604800

const permission = {
  type: 'native-token-periodic',
  data: {
    periodAmount: parseEther('0.001'),
    periodDuration: 86400,
    startTime: currentTime,
    justification: 'Permission to use 0.001 ETH every day',
  },
  isAdjustmentAllowed: true,
}
Native token stream permission
Ensures a linear streaming transfer limit for native tokens. Token transfers are blocked until the defined start timestamp. At the start, a specified initial amount is released, after which tokens accrue linearly at the configured rate, up to the maximum allowed amount.

Parameters
Name	Type	Required	Description
initialAmount	bigint	No	The initial amount that can be transferred at start time. The default is 0.
maxAmount	bigint	No	The maximum total amount that can be unlocked. The default is no limit.
amountPerSecond	bigint	Yes	The rate at which tokens accrue per second.
startTime	number	No	The start timestamp in seconds. The default is the current time.
justification	string	No	A human-readable explanation of why the permission is being requested.
Example
import { parseEther } from 'viem'

const currentTime = Math.floor(Date.now() / 1000)
const expiry = currentTime + 604800

const permission = {
  type: 'native-token-stream',
  data: {
    amountPerSecond: parseEther('0.0001'),
    initialAmount: parseEther('0.1'),
    maxAmount: parseEther('1'),
    startTime: currentTime,
    justification: 'Permission to use 0.0001 ETH per second',
  },
  isAdjustmentAllowed: true,
}
Token approval revocation permission
Enables revoking an existing token approvals on behalf of the user.

Parameters
Name	Type	Required	Description
erc20Approve	boolean	Yes	Whether to allow revoking ERC-20 allowances.
erc721Approve	boolean	Yes	Whether to allow revoking ERC-721 per-token approvals.
erc721SetApprovalForAll	boolean	Yes	Whether to allow revoking ERC-721 and ERC-1155 operator approvals.
permit2Approve	boolean	Yes	Whether to allow revoking Permit2 approvals.
permit2Lockdown	boolean	Yes	Whether to allow locking down Permit2.
permit2InvalidateNonces	boolean	Yes	Whether to allow invalidating Permit2.
justification	string	No	A human-readable explanation of why the permission is being requested.
Example
const permission = {
  type: 'token-approval-revocation',
  data: {
    erc20Approve: true,
    erc721Approve: true,
    erc721SetApprovalForAll: true,
    permit2Approve: false,
    permit2Lockdown: false,
    permit2InvalidateNonces: false,
    justification: 'Permission to revoke ERC-20, ERC-721, and ERC-115 token approvals',
  },
  isAdjustmentAllowed: false,
}

Advanced Permissions rules reference
When executing on a MetaMask user's behalf, you can add the following rule types for the supported permission types.

Use getSupportedExecutionPermissions to check which rule types are available for each permission type on each chain.

Expiry
Sets an expiration timestamp for the permission.

Parameters
Name	Type	Required	Description
timestamp	number	Yes	Expiration timestamp in Unix seconds.
Example
const currentTime = Math.floor(Date.now() / 1000)

const rules = [
  {
    type: 'expiry',
    data: {
      timestamp: currentTime + 604800,
    },
  },
]
Redeemer
Restricts permission redemption to specific addresses.

Parameters
Name	Type	Required	Description
addresses	Address[]	Yes	Addresses that are allowed to redeem the permission.
Example
const rules = [
  {
    type: 'redeemer',
    data: {
      addresses: ['0x...', '0x...'],
    },
  },
]
Payee
Restricts payments to specific receiver addresses.

Parameters
Name	Type	Required	Description
addresses	Address[]	Yes	Addresses that are allowed as payment recipients.
Example
const rules = [
  {
    type: 'payee',
    data: {
      addresses: ['0x...'],
    },
  },
]

Wallet Client actions reference
The following actions are related to the Viem Wallet Client used to execute on a MetaMask user's behalf.

info
To use Advanced Permissions (ERC-7715) actions, the Viem Wallet Client must be extended with erc7715ProviderActions.

requestExecutionPermissions
Requests Advanced Permissions
 from the MetaMask extension account according to the ERC-7715 specification. Returns a RequestExecutionPermissionsReturnType.

Parameters
Name	Type	Required	Description
chainId	number	Yes	The chain ID on which the permission is being requested.
from	Address	No	The wallet address to request the permission from.
expiry	number	Yes	The timestamp (in seconds) by which the permission must expire.
permission	SupportedPermissionParams	Yes	The permission to request. The toolkit supports multiple Advanced Permissions types. Set isAdjustmentAllowed to define whether the user can modify the requested permission.
to	Address	Yes	The account to which the permission will be assigned.
Example
example.ts
client.ts
import { sepolia as chain } from 'viem/chains'
import { parseUnits } from 'viem'
import { walletClient } from './client.ts'

const currentTime = Math.floor(Date.now() / 1000)
const expiry = currentTime + 604800

const grantedPermissions = await walletClient.requestExecutionPermissions([
  {
    chainId: chain.id,
    expiry,
    // The requested permissions will be granted to the
    // session account.
    to: sessionAccount.address,
    permission: {
      type: 'erc20-token-periodic',
      data: {
        tokenAddress: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
        periodAmount: parseUnits('10', 6),
        periodDuration: 86400,
        justification: 'Permission to transfer 10 USDC every day',
      },
      isAdjustmentAllowed: true,
    },
  },
])
getSupportedExecutionPermissions
Returns the Advanced Permissions
 types that the wallet supports, according to the ERC-7715 specification. Use this to verify the available permission types and supported chains before requesting permissions.

This action takes no parameters and returns a GetSupportedExecutionPermissionsResult.

Example
response.ts
example.ts
client.ts
import { walletClient } from './client.ts'

const supportedPermissions = await walletClient.getSupportedExecutionPermissions()
getGrantedExecutionPermissions
Returns all previously granted permissions for the connected wallet, according to the ERC-7715 specification.

This action takes no parameters and returns a GetGrantedExecutionPermissionsResult.

Example
response.ts
example.ts
client.ts
import { walletClient } from './client.ts'

const grantedPermissions = await walletClient.getGrantedExecutionPermissions()

Bundler Client actions reference
These actions extend the Viem Bundler Client to support ERC-7710 utilities.

sendUserOperationWithDelegation
Sends a user operation
 with redeem permissions according to the ERC-7710 specifications.

info
To use sendUserOperationWithDelegation, the Viem Bundler Client must be extended with erc7710BundlerActions.

Parameters
See the Viem sendUserOperation parameters. This function has the same parameters, except it does not accept callData.

Objects in the calls array also require the following parameters:

Name	Type	Required	Description
delegationManager	Address	Yes	The address of the Delegation Manager
.
permissionContext	PermissionContext	Yes	An encoded delegation chain (Hex) or a decoded delegation chain (Delegation[]) for redeeming permissions.
Example
example.ts
client.ts
import { sessionAccount, bundlerClient, publicClient } from './client.ts'

// These properties must be extracted from the permission response.
const permissionContext = permissionsResponse[0].context
const delegationManager = permissionsResponse[0].delegationManager

// Calls without permissionContext and delegationManager will be executed
// as a normal user operation.
const userOperationHash = await bundlerClient.sendUserOperationWithDelegation({
  publicClient,
  account: sessionAccount,
  calls: [
    {
      to: sessionAccount.address,
      data: '0x',
      value: 1n,
      permissionContext,
      delegationManager,
    },
  ],
  // Appropriate values must be used for fee-per-gas.
  maxFeePerGas: 1n,
  maxPriorityFeePerGas: 1n,
})

Wallet Client actions reference
These actions extend the Viem Wallet Client to support ERC-7710 utilities.

sendTransactionWithDelegation
Sends a transaction to redeem delegated permissions according to the ERC-7710 specifications.

info
To use sendTransactionWithDelegation, the Viem Wallet Client must be extended with erc7710WalletActions.

Parameters
See the Viem sendTransaction parameters. This function has the same parameters, and it also requires the following parameters:

Name	Type	Required	Description
delegationManager	Address	Yes	The address of the Delegation Manager
.
permissionContext	PermissionContext	Yes	An encoded delegation chain (Hex) or a decoded delegation chain (Delegation[]) for redeeming delegations.
Example
example.ts
client.ts
import { walletClient, publicClient } from './client.ts'

// These properties must be extracted from the permission response. See
// `grantPermissions` action to learn how to request permissions.
const permissionContext = permissionsResponse[0].context
const delegationManager = permissionsResponse[0].delegationManager

const hash = walletClient.sendTransactionWithDelegation({
  chain,
  to: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
  value: 1n,
  permissionContext,
  delegationManager,
})
redelegatePermissionContext
Creates a redelegation
 to a specific delegate
 from a delegation chain encoded as Hex or decoded as Delegation[].

The action returns RedelegatePermissionContextReturnType.

Parameters
Name	Type	Required	Description
environment	SmartAccountsEnvironment	Yes	Contract addresses for the Delegation Framework
 on the target chain.
permissionContext	PermissionContext	Yes	Encoded delegation chain (Hex) or decoded chain (Delegation[]), leaf first.
chainId	number	No	Chain ID used when signing the delegation.
account	Account | Address	No	Account that signs the redelegation. The default is the Wallet Client's configured account.
scope	ScopeConfig	No	Delegation scope
 to restrict the authority of the redelegation.
caveats	Caveats	No	Additional caveats
 to restrict the authority of the redelegation. See caveats reference.
salt	Hex	No	Salt for redelegation.
to	Address	Yes	Address of the delegate for the redelegation.
Example
example.ts
client.ts
import { walletClient, publicClient, environment } from './client.ts'

// These properties must be extracted from the permission response. See
// `grantPermissions` action to learn how to request permissions.
const permissionContext = permissionsResponse[0].context

const { permissionContext: redelegatedPermissionContext } =
  walletClient.redelegatePermissionContext({
    to: 'DELEGATE_ADDRESS',
    environment,
    permissionContext: permissionContext,
  })
redelegatePermissionContextOpen
Creates an open redelegation
 from a delegation chain encoded as Hex or decoded as Delegation[]. This allows any account to redeem the inherited permissions.

The action returns RedelegatePermissionContextReturnType.

Parameters
Name	Type	Required	Description
environment	SmartAccountsEnvironment	Yes	Contract addresses for the Delegation Framework
 on the target chain.
permissionContext	PermissionContext	Yes	Encoded delegation chain (Hex) or decoded chain (Delegation[]), leaf first.
chainId	number	No	Chain ID used when signing the delegation.
account	Account | Address	No	Account that signs the redelegation. The default is the Wallet Client's configured account.
scope	ScopeConfig	No	Delegation scope
 to restrict the authority of the redelegation.
caveats	Caveats	No	Additional caveats
 to restrict the authority of the redelegation. See caveats reference.
salt	Hex	No	Salt for redelegation.
Example
example.ts
client.ts
import { walletClient, publicClient, environment } from './client.ts'

// These properties must be extracted from the permission response. See
// `grantPermissions` action to learn how to request permissions.
const permissionContext = permissionsResponse[0].context

const { permissionContext: redelegatedPermissionContext } =
  walletClient.redelegatePermissionContextOpen({
    environment,
    permissionContext: permissionContext,
  })

x402 API reference
The following API methods are related to x402 to create payments using delegation
.

createx402DelegationProvider
Creates a delegation provider function too be used with x402Erc7710Client.

The provider resolves creates an open delegation
, signs it, and returns an ABI-encoded delegation chain as a hex string. The provider internally appends redeemer, payee, and expiry caveats
 when the existing caveats, or the root delegation
 doesn't have it.

Parameters
Name	Type	Required	Description
account	MaybeDeferred
<Account>	Yes	The Viem Account that signs the delegation
.
environment	MaybeDeferred
<SmartAccountsEnvironment>	No	Environment to resolve the smart contracts for the current chain. If omitted, resolved automatically from the chain ID in the payment requirements.
from	MaybeDeferred
<Hex>	No	The address that is granting the delegation
. The default is account.
salt	MaybeDeferred
<Hex>	No	The salt for generating the delegation hash. The default is a random 32-byte value.
caveats	MaybeDeferred
<Caveats>	No	Caveats
 that further refine the authority granted by the delegation
. redeemer, allowedTargets, and timestamp caveats are auto-appended if not already present.
parentPermissionContext	MaybeDeferred
<PermissionContext>	No	Parent chain as Hex or as decoded Delegation values (leaf first). Use this when creating a redelegation
.
expirySeconds	MaybeDeferred
<number>	No	Relative expiry in seconds. Adds a timestamp caveat if no tighter constraint exists.
redeemers	MaybeDeferred
<RedeemersConfig>	No	Constrains the addresses that are allowed to redeem the delegation
. Use this to restrict redemption to specific facilitators.
Example
Delegation
Redelegation
import { privateKeyToAccount } from 'viem/accounts'
import { createx402DelegationProvider } from '@metamask/smart-accounts-kit/experimental'
import { x402Erc7710Client } from '@metamask/x402'

const account = privateKeyToAccount(privateKey)

const erc7710Client = new x402Erc7710Client({
  delegationProvider: createx402DelegationProvider({
    account,
  }),
})
parseEip155ChainId
Parses an EIP-155 CAIP network identifier into a numeric chain ID.

Parameters
Name	Type	Required	Description
network	string	Yes	EIP-155 CAIP network identifier. For example, eip155:1.
Example
import { parseEip155ChainId } from '@metamask/smart-accounts-kit/experimental'

// Returns 137
const chainId = parseEip155ChainId('eip155:137')

Types
This page documents the TypeScript enums and types used in Smart Accounts Kit APIs.

Enums
CaveatType
Enum representing the caveat type.

Value	String
CaveatType.ApprovalRevocation	"approvalRevocation"
CaveatType.AllowedCalldata	"allowedCalldata"
CaveatType.AllowedMethods	"allowedMethods"
CaveatType.AllowedTargets	"allowedTargets"
CaveatType.ArgsEqualityCheck	"argsEqualityCheck"
CaveatType.BlockNumber	"blockNumber"
CaveatType.Deployed	"deployed"
CaveatType.Erc1155BalanceChange	"erc1155BalanceChange"
CaveatType.Erc20BalanceChange	"erc20BalanceChange"
CaveatType.Erc20PeriodTransfer	"erc20PeriodTransfer"
CaveatType.Erc20Streaming	"erc20Streaming"
CaveatType.Erc20TransferAmount	"erc20TransferAmount"
CaveatType.Erc721BalanceChange	"erc721BalanceChange"
CaveatType.Erc721Transfer	"erc721Transfer"
CaveatType.ExactCalldata	"exactCalldata"
CaveatType.ExactCalldataBatch	"exactCalldataBatch"
CaveatType.ExactExecution	"exactExecution"
CaveatType.ExactExecutionBatch	"exactExecutionBatch"
CaveatType.Id	"id"
CaveatType.LimitedCalls	"limitedCalls"
CaveatType.MultiTokenPeriod	"multiTokenPeriod"
CaveatType.NativeBalanceChange	"nativeBalanceChange"
CaveatType.NativeTokenPayment	"nativeTokenPayment"
CaveatType.NativeTokenPeriodTransfer	"nativeTokenPeriodTransfer"
CaveatType.NativeTokenStreaming	"nativeTokenStreaming"
CaveatType.NativeTokenTransferAmount	"nativeTokenTransferAmount"
CaveatType.Nonce	"nonce"
CaveatType.OwnershipTransfer	"ownershipTransfer"
CaveatType.Redeemer	"redeemer"
CaveatType.SpecificActionERC20TransferBatch	"specificActionERC20TransferBatch"
CaveatType.Timestamp	"timestamp"
CaveatType.ValueLte	"valueLte"
ExecutionMode
Enum specifying how delegated executions are processed when redeeming delegations.

Value	Description
ExecutionMode.SingleDefault	Executes a single call and reverts on failure.
ExecutionMode.SingleTry	Executes a single call and silently continues on failure.
ExecutionMode.BatchDefault	Executes a batch of calls and reverts if any call fails.
ExecutionMode.BatchTry	Executes a batch of calls and silently continues past failures.
Implementation
Enum representing the MetaMask smart account implementation type.

Value	Description
Implementation.Hybrid	Supports both ECDSA and WebAuthn (passkey) signers.
Implementation.MultiSig	Supports multiple ECDSA signers with threshold-based signing.
Implementation.Stateless7702	Uses EIP-7702 to upgrade an EOA to a smart account without deployment.
ScopeType
Enum representing delegation scope types.

Value	String
ScopeType.Erc20TransferAmount	"erc20TransferAmount"
ScopeType.Erc20Streaming	"erc20Streaming"
ScopeType.Erc20PeriodTransfer	"erc20PeriodTransfer"
ScopeType.NativeTokenTransferAmount	"nativeTokenTransferAmount"
ScopeType.NativeTokenStreaming	"nativeTokenStreaming"
ScopeType.NativeTokenPeriodTransfer	"nativeTokenPeriodTransfer"
ScopeType.Erc721Transfer	"erc721Transfer"
ScopeType.OwnershipTransfer	"ownershipTransfer"
ScopeType.FunctionCall	"functionCall"
TransferWindow
Enum representing predefined time intervals in seconds for transfer period durations.

Value	Seconds
TransferWindow.Hourly	3600
TransferWindow.Daily	86400
TransferWindow.Weekly	604800
TransferWindow.BiWeekly	1209600
TransferWindow.Monthly	2592000
TransferWindow.Quarterly	7776000
TransferWindow.Yearly	31536000
Types
AllowedCalldataBuilderConfig
Defines an expected calldata segment for a single function signature.

Name	Type	Required	Description
startIndex	number	Yes	The byte offset in the calldata (including the 4-byte selector) where the expected value starts.
value	Hex	Yes	The expected hex-encoded calldata at that offset.
Caveat
Represents a restriction or condition applied to a delegation.

Name	Type	Required	Description
enforcer	Hex	Yes	The contract address of the caveat enforcer
.
terms	Hex	Yes	The terms of the caveat
 encoded as hex data.
args	Hex	Yes	Additional arguments required by the caveat enforcer, encoded as hex data.
CaveatBuilderConfig
Optional configuration for createCaveatBuilder.

Name	Type	Required	Description
allowInsecureUnrestrictedDelegation	boolean	No	Whether to allow unrestricted delegations with no caveats
. The default is false.
Delegation
Represents a delegation that grants permissions from a delegator
 to a delegate
.

Name	Type	Required	Description
delegate	Hex	Yes	The address to which the delegation is being granted.
delegator	Hex	Yes	The address that is granting the delegation.
authority	Hex	Yes	The parent delegation hash, or ROOT_AUTHORITY for creating root delegations
.
caveats	Caveat[]	Yes	An array of caveats that constrain the delegation.
salt	Hex	Yes	The salt for generating the delegation hash. This helps prevent hash collisions when creating identical delegations.
signature	Hex	Yes	The signature to validate the delegation.
DecodedRevertReason
Represents a decoded revert reason from a Delegation Framework
 error. Returned by decodeRevertData and decodeRevertReason.

Name	Type	Required	Description
errorName	string	Yes	The name of the decoded error.
message	string	Yes	The decoded revert reason message.
rawData	Hex	Yes	The raw ABI-encoded revert data.
ExactCalldataBuilderConfig
Defines the exact calldata the delegate
 is allowed to call.

Name	Type	Required	Description
calldata	Hex	Yes	The exact calldata the delegate is allowed to call.
ExecutionStruct
Represents a single execution to perform on behalf of a delegator
.

Name	Type	Required	Description
target	Address	Yes	Address of the contract or recipient that the call is directed to.
value	bigint	Yes	Value of native tokens to send along with the call in wei format.
callData	Hex	Yes	Encoded function data to be executed on the target address.
GetGrantedExecutionPermissionsResult
The return type of getGrantedExecutionPermissions. An array of PermissionResponse objects.

GetSupportedExecutionPermissionsResult
The return type of getSupportedExecutionPermissions. A Record<string, SupportedPermissionInfo> keyed by permission type.

PartialSignature
Represents a single signer
's contribution to a multisig aggregated signature.

Name	Type	Required	Description
signer	Address	Yes	The address of the signer.
signature	Hex	Yes	The signer's signature over the user operation.
type	SignatureType	Yes	The signature type to represent signature algorithm. Only supported value is ECDSA.
RedelegatePermissionContextReturnType
Return type of redelegatePermissionContext and redelegatePermissionContextOpen.

Name	Type	Description
delegation	Delegation	The signed redelegation object.
permissionContext	Hex	ABI-encoded delegation chain with the new delegation prepended.
PermissionResponse
Represents a granted Advanced Permission
.

Name	Type	Required	Description
chainId	number	Yes	The chain ID for which the permission was granted.
from	Address	Yes	The account address that granted the permission.
to	Hex	Yes	The account address that received the permission.
permission	PermissionTypes	Yes	The granted permission details.
rules	Record<string, unknown>[]	No	The rules applied to the permission. For example, permission expiry.
context	Hex	Yes	The permission context (encoded delegation list) used when redeeming the permission.
dependencies	{ factory: Address, factoryData: Hex }[]	Yes	Factory dependencies for account deployment.
delegationManager	Address	Yes	The address of the Delegation Manager
 contract for the permission.
RequestExecutionPermissionsReturnType
The return type of requestExecutionPermissions. An array of PermissionResponse objects.

SmartAccountsEnvironment
An object containing the contract addresses required to interact with the Delegation Framework
 on a specific chain.

Name	Type	Required	Description
DelegationManager	Hex	Yes	The address of the Delegation Manager
 contract.
EntryPoint	Hex	Yes	The address of the ERC-4337 EntryPoint contract.
SimpleFactory	Hex	Yes	The address of the factory contract for deploying MetaMask Smart Accounts
.
implementations	Record<string, Hex>	Yes	A map of MetaMask smart account implementation types to their deployed addresses.
caveatEnforcers	Record<string, Hex>	Yes	A map of caveat enforcer types to their deployed addresses.
SupportedPermissionInfo
Describes a supported Advanced Permission
 type. Used in GetSupportedExecutionPermissionsResult.

Name	Type	Required	Description
chainIds	number[]	Yes	The chain IDs on which the permission type is supported.
ruleTypes	string[]	Yes	The rule types supported for the permission type (for example, "expiry").
MaybeDeferred
Represents a value that can be provided directly or derived at runtime from PaymentRequirements.

type MaybeDeferred<TResult> =
  | TResult
  | ((requirements: PaymentRequirements) => Promise<TResult> | TResult)
PaymentRequirements
Represents the payment requirements returned by an x402 server. createx402DelegationProvider uses these values to scope and construct the delegation
.

Name	Type	Required	Description
scheme	string	Yes	The payment scheme identifier.
network	string	Yes	The CAIP network identifier. For example, eip155:8453.
asset	string	Yes	The token contract address for the payment asset.
amount	string	Yes	The payment amount in the token's smallest unit.
payTo	string	Yes	The recipient address for the payment.
maxTimeoutSeconds	number	Yes	The maximum time in seconds before the payment expires.
extra	Record<string, unknown>	No	Additional context for x402, such as the asset transfer method.
RedeemersConfig
Configuration for the redeemer constraint used in createx402DelegationProvider.

Name	Type	Required	Description
requireRedeemers	boolean	Yes	Whether at least one redeemer constraint must exist.
addresses	MaybeDeferred<Address[]>	No	The addresses that are allowed to redeem the delegation
.
ValueLteBuilderConfig
Name	Type	Required	Description
maxValue	bigint	Yes	The maximum native token amount the delegate
 can transfer per call.

 