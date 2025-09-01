/**
 * Consolidated Tools Export for MCP Server
 *
 * Central registry of all available tools with proper typing and validation
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  executeGraphQLQuery,
  getGraphQLSchema,
  buildGraphQLQuery,
  refreshGraphQLSchema,
} from './graphql.js';
import { askQuestion, getDatabaseInfo, downloadDatabaseSchema } from './database.js';
import { getTransactionHistory } from './transactions.js';
import { getTokenBalances } from './tokens.js';
import { createD3Visualization, generateD3FromDescription } from './d3-visualization.js';
import {
  executeJsonRpcMethod,
  getChainId,
  getBlockByNumber,
  getTransactionByHash,
  ethCall,
  listJsonRpcMethods,
} from './jsonrpc.js';

// Export all tool definitions
export const tools: Tool[] = [
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
    name: 'create_d3_visualization',
    description: 'Generate D3.js visualization code based on data and specifications',
    inputSchema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          description: 'Array of data objects to visualize',
        },
        type: {
          type: 'string',
          enum: [
            'bar',
            'line',
            'pie',
            'scatter',
            'area',
            'bubble',
            'heatmap',
            'network',
            'tree',
            'auto',
          ],
          description: 'Type of visualization (default: auto)',
        },
        title: {
          type: 'string',
          description: 'Title for the visualization',
        },
        description: {
          type: 'string',
          description: 'Description of what to visualize',
        },
        width: {
          type: 'number',
          description: 'Width in pixels (default: 800)',
        },
        height: {
          type: 'number',
          description: 'Height in pixels (default: 600)',
        },
        xAxis: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            field: { type: 'string' },
          },
          description: 'X-axis configuration',
        },
        yAxis: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            field: { type: 'string' },
          },
          description: 'Y-axis configuration',
        },
        interactive: {
          type: 'boolean',
          description: 'Include interactive features like tooltips (default: true)',
        },
      },
      required: ['data'],
    },
  },
  {
    name: 'generate_d3_from_description',
    description: 'Generate D3.js visualization code from a natural language description',
    inputSchema: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description: 'Natural language description of the desired visualization',
        },
        data: {
          type: 'array',
          description: 'Optional data array to visualize',
        },
      },
      required: ['description'],
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
    description: 'Execute a smart contract call without creating a transaction (read-only)',
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
    name: 'list_json_rpc_methods',
    description: 'List all supported JSON-RPC methods and their parameters',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

/**
 * Handle tool execution with proper error handling and response formatting
 */
export async function handleToolCall(name: string, args: any): Promise<any> {
  try {
    // Input validation
    const tool = tools.find((t) => t.name === name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }

    // Validate required parameters
    const required = tool.inputSchema.required || [];
    for (const param of required) {
      if (!args || args[param] === undefined) {
        throw new Error(`Missing required parameter: ${param}`);
      }
    }

    // Execute tool based on name
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

      case 'create_d3_visualization':
        const vizResult = await createD3Visualization(args as any);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(vizResult, null, 2),
            },
          ],
        };

      case 'generate_d3_from_description':
        const d3Result = await generateD3FromDescription(
          args?.description as string,
          args?.data as any[],
        );
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(d3Result, null, 2),
            },
          ],
        };

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

      case 'list_json_rpc_methods':
        return await listJsonRpcMethods();

      default:
        throw new Error(`Tool not implemented: ${name}`);
    }
  } catch (error) {
    // Return error in MCP format
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
