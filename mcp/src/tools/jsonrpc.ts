import axios from 'axios';
import { z } from 'zod';

// Get API configuration from environment - read at runtime
function getApiConfig() {
  const apiKey = process.env.HGRAPH_API_KEY;
  const network = process.env.HGRAPH_NETWORK || 'mainnet';
  const endpoint =
    network === 'testnet'
      ? 'https://testnet.hedera.api.hgraph.io'
      : 'https://mainnet.hedera.api.hgraph.io';
  return { apiKey, network, endpoint };
}

// JSON-RPC 2.0 Request/Response schemas
const JsonRpcRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  method: z.string(),
  params: z.array(z.any()).optional().default([]),
  id: z.union([z.string(), z.number()]),
});

const JsonRpcResponseSchema = z.object({
  jsonrpc: z.literal('2.0'),
  result: z.any().optional(),
  error: z
    .object({
      code: z.number(),
      message: z.string(),
      data: z.any().optional(),
    })
    .optional(),
  id: z.union([z.string(), z.number(), z.null()]),
});

// Supported method schemas
const SupportedMethods = z.enum([
  'eth_chainId',
  'eth_getBlockByNumber',
  'eth_getTransactionByHash',
  'eth_call',
  'eth_sendRawTransaction',
]);

// Parameter schemas for specific methods
const BlockNumberParamSchema = z.union([
  z.string(), // hex number or "latest", "earliest", "pending"
  z.null(),
]);

const CallParamsSchema = z.object({
  to: z.string(), // contract address
  data: z.string(), // encoded function call
  from: z.string().optional(),
  gas: z.string().optional(),
  gasPrice: z.string().optional(),
  value: z.string().optional(),
});

// Helper to create RPC endpoint URL
function getRpcEndpoint(): string {
  const { apiKey, endpoint } = getApiConfig();
  if (apiKey) {
    return `${endpoint}/v1/${apiKey}/rpc`;
  }
  return `${endpoint}/rpc`;
}

// Generic JSON-RPC call function
async function makeJsonRpcCall(method: string, params: any[] = []): Promise<any> {
  const endpoint = getRpcEndpoint();

  const request = {
    jsonrpc: '2.0' as const,
    method,
    params,
    id: Date.now(),
  };

  try {
    const response = await axios.post(endpoint, request, {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    const rpcResponse = JsonRpcResponseSchema.parse(response.data);

    if (rpcResponse.error) {
      throw new Error(`RPC Error (${rpcResponse.error.code}): ${rpcResponse.error.message}`);
    }

    return rpcResponse.result;
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401) {
        throw new Error('Unauthorized: Invalid or missing API key');
      }
      if (error.response?.status === 429) {
        throw new Error('Rate limit exceeded');
      }
      throw new Error(`HTTP Error ${error.response?.status}: ${error.response?.statusText}`);
    }
    throw error;
  }
}

// Tool functions
export async function executeJsonRpcMethod(method: string, params: any[] = []) {
  try {
    // Validate method is supported (optional validation - allows any method)
    let validMethod = method;
    try {
      validMethod = SupportedMethods.parse(method);
    } catch {
      // Allow unsupported methods to pass through for testing
      validMethod = method;
    }

    const result = await makeJsonRpcCall(validMethod, params);

    let formattedResult = '# JSON-RPC Response\n\n';
    formattedResult += `**Method:** \`${method}\`\n`;
    formattedResult += `**Network:** ${getApiConfig().network}\n`;
    formattedResult += `**Endpoint:** ${getRpcEndpoint()}\n\n`;

    formattedResult += '## Parameters\n';
    formattedResult += '```json\n';
    formattedResult += JSON.stringify(params, null, 2);
    formattedResult += '\n```\n\n';

    formattedResult += '## Result\n';
    formattedResult += '```json\n';
    formattedResult += JSON.stringify(result, null, 2);
    formattedResult += '\n```\n';

    return {
      content: [
        {
          type: 'text',
          text: formattedResult,
        },
      ],
    };
  } catch (error: any) {
    throw new Error(`JSON-RPC execution failed: ${error.message}`);
  }
}

export async function getChainId() {
  try {
    const result = await makeJsonRpcCall('eth_chainId', []);

    let formattedResult = '# Hedera Chain ID\n\n';
    formattedResult += `**Network:** ${getApiConfig().network}\n`;
    formattedResult += `**Chain ID (hex):** ${result}\n`;
    formattedResult += `**Chain ID (decimal):** ${parseInt(result, 16)}\n\n`;

    formattedResult += '## Chain ID Reference\n';
    formattedResult += '- Mainnet: 295 (0x127)\n';
    formattedResult += '- Testnet: 296 (0x128)\n';
    formattedResult += '- Previewnet: 297 (0x129)\n';

    return {
      content: [
        {
          type: 'text',
          text: formattedResult,
        },
      ],
    };
  } catch (error: any) {
    throw new Error(`Failed to get chain ID: ${error.message}`);
  }
}

export async function getBlockByNumber(
  blockNumber: string | null = 'latest',
  fullTransactions: boolean = false,
) {
  try {
    const result = await makeJsonRpcCall('eth_getBlockByNumber', [blockNumber, fullTransactions]);

    if (!result) {
      throw new Error('Block not found');
    }

    let formattedResult = '# Block Information\n\n';
    formattedResult += `**Block Number:** ${blockNumber}\n`;
    formattedResult += `**Network:** ${getApiConfig().network}\n\n`;

    formattedResult += '## Block Details\n';
    formattedResult += `- **Hash:** ${result.hash}\n`;
    formattedResult += `- **Parent Hash:** ${result.parentHash}\n`;
    formattedResult += `- **Timestamp:** ${new Date(parseInt(result.timestamp, 16) * 1000).toISOString()}\n`;
    formattedResult += `- **Gas Used:** ${parseInt(result.gasUsed, 16).toLocaleString()}\n`;
    formattedResult += `- **Gas Limit:** ${parseInt(result.gasLimit, 16).toLocaleString()}\n`;
    formattedResult += `- **Transaction Count:** ${result.transactions.length}\n`;

    if (result.miner) {
      formattedResult += `- **Miner:** ${result.miner}\n`;
    }

    formattedResult += '\n## Raw Block Data\n';
    formattedResult += '```json\n';
    formattedResult += JSON.stringify(result, null, 2);
    formattedResult += '\n```\n';

    return {
      content: [
        {
          type: 'text',
          text: formattedResult,
        },
      ],
    };
  } catch (error: any) {
    throw new Error(`Failed to get block: ${error.message}`);
  }
}

export async function getTransactionByHash(transactionHash: string) {
  try {
    if (!transactionHash.startsWith('0x')) {
      transactionHash = '0x' + transactionHash;
    }

    const result = await makeJsonRpcCall('eth_getTransactionByHash', [transactionHash]);

    if (!result) {
      throw new Error('Transaction not found');
    }

    let formattedResult = '# Transaction Details\n\n';
    formattedResult += `**Transaction Hash:** ${transactionHash}\n`;
    formattedResult += `**Network:** ${getApiConfig().network}\n\n`;

    formattedResult += '## Transaction Information\n';
    formattedResult += `- **Block Number:** ${parseInt(result.blockNumber, 16)}\n`;
    formattedResult += `- **From:** ${result.from}\n`;
    formattedResult += `- **To:** ${result.to || 'Contract Creation'}\n`;
    formattedResult += `- **Value:** ${parseInt(result.value, 16) / 1e18} ETH\n`;
    formattedResult += `- **Gas:** ${parseInt(result.gas, 16).toLocaleString()}\n`;
    formattedResult += `- **Gas Price:** ${parseInt(result.gasPrice, 16) / 1e9} Gwei\n`;
    formattedResult += `- **Nonce:** ${parseInt(result.nonce, 16)}\n`;

    if (result.input && result.input !== '0x') {
      formattedResult += `- **Input Data Length:** ${(result.input.length - 2) / 2} bytes\n`;
    }

    formattedResult += '\n## Raw Transaction Data\n';
    formattedResult += '```json\n';
    formattedResult += JSON.stringify(result, null, 2);
    formattedResult += '\n```\n';

    return {
      content: [
        {
          type: 'text',
          text: formattedResult,
        },
      ],
    };
  } catch (error: any) {
    throw new Error(`Failed to get transaction: ${error.message}`);
  }
}

export async function ethCall(to: string, data: string, blockNumber: string = 'latest') {
  try {
    const callParams = {
      to,
      data,
    };

    const result = await makeJsonRpcCall('eth_call', [callParams, blockNumber]);

    let formattedResult = '# Smart Contract Call Result\n\n';
    formattedResult += `**Contract Address:** ${to}\n`;
    formattedResult += `**Block:** ${blockNumber}\n`;
    formattedResult += `**Network:** ${getApiConfig().network}\n\n`;

    formattedResult += '## Call Parameters\n';
    formattedResult += '```json\n';
    formattedResult += JSON.stringify(callParams, null, 2);
    formattedResult += '\n```\n\n';

    formattedResult += '## Result\n';
    formattedResult += `**Raw Response:** ${result}\n\n`;

    if (result && result !== '0x') {
      formattedResult += '**Decoded (as string):** ';
      try {
        const decoded = Buffer.from(result.slice(2), 'hex').toString('utf8');
        formattedResult += decoded.replace(/\0/g, '') + '\n';
      } catch {
        formattedResult += 'Unable to decode as UTF-8\n';
      }

      formattedResult += `**Length:** ${(result.length - 2) / 2} bytes\n`;
    }

    return {
      content: [
        {
          type: 'text',
          text: formattedResult,
        },
      ],
    };
  } catch (error: any) {
    throw new Error(`Smart contract call failed: ${error.message}`);
  }
}

export async function sendRawTransaction(signedTransaction: string) {
  try {
    if (!signedTransaction.startsWith('0x')) {
      signedTransaction = '0x' + signedTransaction;
    }

    const result = await makeJsonRpcCall('eth_sendRawTransaction', [signedTransaction]);

    let formattedResult = '# Transaction Submission Result\n\n';
    formattedResult += `**Network:** ${getApiConfig().network}\n`;
    formattedResult += `**Transaction Hash:** ${result}\n\n`;

    formattedResult += '## Next Steps\n';
    formattedResult += '- Use `get_transaction_by_hash` to check transaction status\n';
    formattedResult += '- Transaction may take a few seconds to be included in a block\n';
    formattedResult += '- Check block explorer for detailed transaction information\n';

    return {
      content: [
        {
          type: 'text',
          text: formattedResult,
        },
      ],
    };
  } catch (error: any) {
    throw new Error(`Failed to send transaction: ${error.message}`);
  }
}

export async function listJsonRpcMethods() {
  const methods = [
    {
      method: 'eth_chainId',
      description: 'Returns the chain ID of the current network',
      params: [],
    },
    {
      method: 'eth_getBlockByNumber',
      description: 'Returns information about a block by block number',
      params: ['blockNumber (hex/latest/earliest)', 'fullTransactions (boolean)'],
    },
    {
      method: 'eth_getTransactionByHash',
      description: 'Returns transaction details by transaction hash',
      params: ['transactionHash (hex)'],
    },
    {
      method: 'eth_call',
      description: 'Executes a new message call without creating a transaction',
      params: ['callObject {to, data, from?, gas?, gasPrice?, value?}', 'blockNumber'],
    },
    {
      method: 'eth_sendRawTransaction',
      description: 'Sends a signed transaction to the network',
      params: ['signedTransactionData (hex)'],
    },
  ];

  let formattedResult = '# Supported JSON-RPC Methods\n\n';
  formattedResult += `**Network:** ${getApiConfig().network}\n`;
  formattedResult += `**Endpoint:** ${getRpcEndpoint()}\n\n`;

  if (!getApiConfig().apiKey) {
    formattedResult +=
      '⚠️ **Warning:** No API key configured. Set HGRAPH_API_KEY environment variable.\n\n';
  }

  formattedResult += '## Available Methods\n\n';

  for (const method of methods) {
    formattedResult += `### \`${method.method}\`\n`;
    formattedResult += `${method.description}\n`;
    if (method.params.length > 0) {
      formattedResult += '**Parameters:**\n';
      method.params.forEach((param) => {
        formattedResult += `- ${param}\n`;
      });
    }
    formattedResult += '\n';
  }

  formattedResult += '## Usage Notes\n';
  formattedResult += '- JSON-RPC API is currently in beta\n';
  formattedResult += '- Requires API key for authentication\n';
  formattedResult += '- Implements subset of Ethereum JSON-RPC APIs\n';
  formattedResult += '- Contact support before extensive write transaction testing\n';

  return {
    content: [
      {
        type: 'text',
        text: formattedResult,
      },
    ],
  };
}
