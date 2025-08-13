#!/usr/bin/env node

import 'dotenv/config';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import {
  executeGraphQLQuery,
  getGraphQLSchema,
  buildGraphQLQuery,
  refreshGraphQLSchema,
} from './tools/graphql.js';
import { askQuestion, getDatabaseInfo, downloadDatabaseSchema } from './tools/database.js';
// SQL tools removed for security - MCP best practice is to return data, not queries
import { getAccountInfo } from './tools/account.js';
import { getTransactionHistory } from './tools/transactions.js';
import { getTokenBalances } from './tools/tokens.js';
import { getNetworkStats } from './tools/network.js';
import {
  executeJsonRpcMethod,
  getChainId,
  getBlockByNumber,
  getTransactionByHash,
  ethCall,
  sendRawTransaction,
  listJsonRpcMethods,
} from './tools/jsonrpc.js';

const server = new Server(
  {
    name: 'hgraph-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

const tools: Tool[] = [
  {
    name: 'execute_graphql_query',
    description: 'Execute a GraphQL query and return the data from Hgraph API',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'GraphQL query string',
        },
        variables: {
          type: 'object',
          description: 'Variables for the GraphQL query',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_graphql_schema',
    description: 'Get the GraphQL schema definition and available types',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'refresh_graphql_schema',
    description: 'Force refresh the GraphQL schema from the server via introspection',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_graphql_query_template',
    description:
      'Get a GraphQL query template/example for learning purposes (not for direct execution)',
    inputSchema: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description: 'Description of what data you want to query',
        },
        returnFields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific fields to return (optional)',
        },
      },
      required: ['description'],
    },
  },
  // Database tools - following MCP best practices
  // Returns processed data from natural language questions
  {
    name: 'ask_question',
    description: 'Ask a question about the database in natural language and get data back',
    inputSchema: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: 'Natural language question about the data',
        },
      },
      required: ['question'],
    },
  },
  {
    name: 'get_database_info',
    description: 'Get information about database tables and schema',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'download_database_schema',
    description: 'Download and cache the current database schema',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_account_info',
    description: 'Get detailed information about a Hedera account (REST API)',
    inputSchema: {
      type: 'object',
      properties: {
        accountId: {
          type: 'string',
          description: 'Hedera account ID (e.g., 0.0.123456)',
        },
      },
      required: ['accountId'],
    },
  },
  {
    name: 'get_transaction_history',
    description: 'Get transaction history for a Hedera account (REST API)',
    inputSchema: {
      type: 'object',
      properties: {
        accountId: {
          type: 'string',
          description: 'Hedera account ID (e.g., 0.0.123456)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of transactions to return (default: 10)',
          default: 10,
        },
        order: {
          type: 'string',
          enum: ['asc', 'desc'],
          description: 'Sort order for transactions (default: desc)',
          default: 'desc',
        },
      },
      required: ['accountId'],
    },
  },
  {
    name: 'get_token_balances',
    description: 'Get token balances for a Hedera account (REST API)',
    inputSchema: {
      type: 'object',
      properties: {
        accountId: {
          type: 'string',
          description: 'Hedera account ID (e.g., 0.0.123456)',
        },
        tokenId: {
          type: 'string',
          description: 'Optional specific token ID to query',
        },
      },
      required: ['accountId'],
    },
  },
  {
    name: 'get_network_stats',
    description: 'Get current Hedera network statistics and metrics (REST API)',
    inputSchema: {
      type: 'object',
      properties: {
        metric: {
          type: 'string',
          enum: ['all', 'tps', 'nodes', 'supply'],
          description: 'Specific metric to retrieve (default: all)',
          default: 'all',
        },
      },
    },
  },
  {
    name: 'execute_json_rpc',
    description: 'Execute a JSON-RPC method against the Hgraph JSON-RPC API',
    inputSchema: {
      type: 'object',
      properties: {
        method: {
          type: 'string',
          description: 'JSON-RPC method name (e.g., eth_chainId, eth_getBlockByNumber)',
        },
        params: {
          type: 'array',
          description: 'Method parameters',
          default: [],
        },
      },
      required: ['method'],
    },
  },
  {
    name: 'get_chain_id',
    description: 'Get the chain ID of the current Hedera network',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_block_by_number',
    description: 'Get block information by block number',
    inputSchema: {
      type: 'object',
      properties: {
        blockNumber: {
          type: 'string',
          description: 'Block number (hex), or "latest", "earliest", "pending"',
          default: 'latest',
        },
        fullTransactions: {
          type: 'boolean',
          description: 'Return full transaction objects instead of just hashes',
          default: false,
        },
      },
    },
  },
  {
    name: 'get_transaction_by_hash',
    description: 'Get transaction details by transaction hash',
    inputSchema: {
      type: 'object',
      properties: {
        transactionHash: {
          type: 'string',
          description: 'Transaction hash (with or without 0x prefix)',
        },
      },
      required: ['transactionHash'],
    },
  },
  {
    name: 'eth_call',
    description: 'Execute a smart contract call without creating a transaction',
    inputSchema: {
      type: 'object',
      properties: {
        to: {
          type: 'string',
          description: 'Contract address to call',
        },
        data: {
          type: 'string',
          description: 'Encoded function call data',
        },
        blockNumber: {
          type: 'string',
          description: 'Block number for the call context',
          default: 'latest',
        },
      },
      required: ['to', 'data'],
    },
  },
  {
    name: 'send_raw_transaction',
    description: 'Send a signed transaction to the network',
    inputSchema: {
      type: 'object',
      properties: {
        signedTransaction: {
          type: 'string',
          description: 'Signed transaction data (hex encoded)',
        },
      },
      required: ['signedTransaction'],
    },
  },
  {
    name: 'list_json_rpc_methods',
    description: 'List all supported JSON-RPC methods and their parameters',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools,
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'execute_graphql_query':
        return await executeGraphQLQuery(
          args?.query as string,
          args?.variables as Record<string, any>,
        );

      case 'get_graphql_schema':
        return await getGraphQLSchema();

      case 'refresh_graphql_schema':
        return await refreshGraphQLSchema();

      case 'get_graphql_query_template':
        return await buildGraphQLQuery(args?.description as string, args?.returnFields as string[]);

      // Database tools
      case 'ask_question':
        return await askQuestion(args?.question as string);

      case 'get_database_info':
        return await getDatabaseInfo();

      case 'download_database_schema':
        const schema = await downloadDatabaseSchema();
        return {
          content: [
            {
              type: 'text',
              text: `Database schema downloaded successfully. Found ${Object.keys(schema.tables).length} tables.`,
            },
          ],
        };

      case 'get_account_info':
        return await getAccountInfo(args?.accountId as string);

      case 'get_transaction_history':
        return await getTransactionHistory(
          args?.accountId as string,
          args?.limit as number,
          args?.order as 'asc' | 'desc',
        );

      case 'get_token_balances':
        return await getTokenBalances(
          args?.accountId as string,
          args?.tokenId as string | undefined,
        );

      case 'get_network_stats':
        return await getNetworkStats(args?.metric as string);

      case 'execute_json_rpc':
        return await executeJsonRpcMethod(args?.method as string, args?.params as any[]);

      case 'get_chain_id':
        return await getChainId();

      case 'get_block_by_number':
        return await getBlockByNumber(
          args?.blockNumber as string,
          args?.fullTransactions as boolean,
        );

      case 'get_transaction_by_hash':
        return await getTransactionByHash(args?.transactionHash as string);

      case 'eth_call':
        return await ethCall(args?.to as string, args?.data as string, args?.blockNumber as string);

      case 'send_raw_transaction':
        return await sendRawTransaction(args?.signedTransaction as string);

      case 'list_json_rpc_methods':
        return await listJsonRpcMethods();

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Hgraph MCP Server (SQL/GraphQL/JSON-RPC) running on stdio');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Server error:', error);
    process.exit(1);
  });
}
