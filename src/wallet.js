const { ethers } = require('ethers');

const ERC20_ABI = [
  'function balanceOf(address account) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
];

const USDC_DECIMALS = 6;

class AgentWallet {
  constructor(privateKey, _unused, network) {
    this.privateKey = privateKey;
    this.signer = new ethers.Wallet(privateKey);
    this.address = this.signer.address;
    this.network = network;
    this.provider = new ethers.JsonRpcProvider(network.rpcUrl);
    this.connectedSigner = this.signer.connect(this.provider);
    this.usdcContract = new ethers.Contract(network.usdcAddress, ERC20_ABI, this.provider);
  }

  async getBalance() {
    try {
      const raw = await this.usdcContract.balanceOf(this.address);
      return Number(ethers.formatUnits(raw, USDC_DECIMALS));
    } catch {
      return 0;
    }
  }

  /**
   * Transfer USDC directly via signed ethers transaction.
   * Falls back to simulated status if wallet has no ETH for gas.
   */
  async transfer(toAddress, amountUsdc, memo = '') {
    const amount = ethers.parseUnits(String(amountUsdc), USDC_DECIMALS);
    const iface = new ethers.Interface(ERC20_ABI);
    const data = iface.encodeFunctionData('transfer', [toAddress, amount]);

    try {
      const tx = await this.connectedSigner.sendTransaction({
        to: this.network.usdcAddress,
        data,
      });
      const receipt = await tx.wait(1);
      return {
        txId: receipt.hash,
        txHash: receipt.hash,
        status: 'confirmed',
        memo,
      };
    } catch (err) {
      const simulatedId = '0xsim_' + Math.random().toString(16).slice(2, 18);
      console.warn(`[wallet] Transfer simulated (${err.message.split('\n')[0]})`);
      return {
        txId: simulatedId,
        txHash: null,
        status: 'simulated',
        memo,
      };
    }
  }

  async signMessage(message) {
    return this.signer.signMessage(message);
  }

  async signTypedData(domain, types, value) {
    return this.signer.signTypedData(domain, types, value);
  }
}

module.exports = AgentWallet;
