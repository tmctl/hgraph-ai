#!/usr/bin/env node

/**
 * HTTP Server for MCP
 *
 * This server provides an HTTP/REST interface to the MCP tools,
 * making them accessible over a network port instead of stdio.
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import {
  executeGraphQLQuery,
  getGraphQLSchema,
  buildGraphQLQuery,
  refreshGraphQLSchema,
} from './tools/graphql.js';
import { askQuestion, getDatabaseInfo, downloadDatabaseSchema } from './tools/database.js';
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

const app = express();
const PORT = process.env.MCP_PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

// MCP info endpoint
app.get('/', (req, res) => {
  res.json({
    mcp: '1.0',
    name: 'hgraph-mcp-server',
    description: 'MCP server for Hedera blockchain data access via Hgraph APIs',
    version: '1.0.0',
  });
});

// MCP Protocol endpoints for Claude.ai
app.post('/', async (req, res) => {
  console.log('MCP Request:', JSON.stringify(req.body, null, 2));
  try {
    const { method, params, id } = req.body;
    
    if (method === 'initialize') {
      res.json({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2025-06-18',
          serverInfo: {
            name: 'hgraph-mcp-server',
            version: '1.0.0',
          },
          capabilities: {
            tools: {},
          },
        },
      });
    } else if (method === 'notifications/initialized') {
      // This is a notification, no response needed
      res.status(204).send();
      return;
    } else if (method === 'tools/list') {
      const tools = [
        {
          name: 'execute_graphql_query',
          description: 'Execute a GraphQL query and return the data from Hgraph API',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'GraphQL query string' },
              variables: { type: 'object', description: 'Variables for the GraphQL query' },
            },
            required: ['query'],
          },
        },
        {
          name: 'ask_question',
          description: 'Ask a question about the database in natural language and get data back',
          inputSchema: {
            type: 'object',
            properties: {
              question: { type: 'string', description: 'Natural language question about the data' },
            },
            required: ['question'],
          },
        },
        {
          name: 'get_account_info',
          description: 'Get detailed information about a Hedera account',
          inputSchema: {
            type: 'object',
            properties: {
              accountId: { type: 'string', description: 'Hedera account ID (e.g., 0.0.123456)' },
            },
            required: ['accountId'],
          },
        },
        {
          name: 'get_network_stats',
          description: 'Get current Hedera network statistics and metrics',
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
      ];
      
      res.json({
        jsonrpc: '2.0',
        id,
        result: { tools },
      });
    } else if (method === 'tools/call') {
      const { name, arguments: args } = params;
      let result;
      
      switch (name) {
        case 'execute_graphql_query':
          result = await executeGraphQLQuery(args?.query as string, args?.variables as Record<string, any>);
          break;
        case 'ask_question':
          result = await askQuestion(args?.question as string);
          break;
        case 'get_account_info':
          result = await getAccountInfo(args?.accountId as string);
          break;
        case 'get_network_stats':
          result = await getNetworkStats(args?.metric as string);
          break;
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
      
      res.json({
        jsonrpc: '2.0',
        id,
        result,
      });
    } else {
      res.json({
        jsonrpc: '2.0',
        id,
        error: {
          code: -32601,
          message: 'Method not found',
        },
      });
    }
  } catch (error: any) {
    res.json({
      jsonrpc: '2.0',
      id: req.body.id,
      error: {
        code: -32603,
        message: error.message || 'Internal error',
      },
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'hgraph-mcp-server',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// List available tools
app.get('/tools', (req, res) => {
  res.json({
    tools: [
      'execute_graphql_query',
      'get_graphql_schema',
      'refresh_graphql_schema',
      'get_graphql_query_template',
      'get_account_info',
      'get_transaction_history',
      'get_token_balances',
      'get_network_stats',
      'execute_json_rpc',
      'get_chain_id',
      'get_block_by_number',
      'get_transaction_by_hash',
      'eth_call',
      'send_raw_transaction',
      'list_json_rpc_methods',
      'ask_question',
      'get_database_info',
      'download_database_schema',
    ],
  });
});

// GraphQL endpoints
app.post('/graphql/execute', async (req, res) => {
  try {
    const { query, variables } = req.body;
    const result = await executeGraphQLQuery(query, variables);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/graphql/schema', async (req, res) => {
  try {
    const result = await getGraphQLSchema();
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/graphql/refresh-schema', async (req, res) => {
  try {
    const result = await refreshGraphQLSchema();
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/graphql/query-template', async (req, res) => {
  try {
    const { description, returnFields } = req.body;
    const result = await buildGraphQLQuery(description, returnFields);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Account endpoints
app.get('/account/:accountId', async (req, res) => {
  try {
    const result = await getAccountInfo(req.params.accountId);
    res.json(result);
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
});

app.get('/account/:accountId/transactions', async (req, res) => {
  try {
    const { limit = 10, order = 'desc' } = req.query;
    const result = await getTransactionHistory(
      req.params.accountId,
      Number(limit),
      order as 'asc' | 'desc',
    );
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/account/:accountId/tokens', async (req, res) => {
  try {
    const { tokenId } = req.query;
    const result = await getTokenBalances(req.params.accountId, tokenId as string | undefined);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Network endpoints
app.get('/network/stats', async (req, res) => {
  try {
    const { metric = 'all' } = req.query;
    const result = await getNetworkStats(metric as string);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// JSON-RPC endpoints
app.post('/jsonrpc', async (req, res) => {
  try {
    const { method, params } = req.body;
    const result = await executeJsonRpcMethod(method, params);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/jsonrpc/chain-id', async (req, res) => {
  try {
    const result = await getChainId();
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/jsonrpc/block/latest', async (req, res) => {
  try {
    const { fullTransactions = false } = req.query;
    const result = await getBlockByNumber('latest', Boolean(fullTransactions));
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/jsonrpc/block/:blockNumber', async (req, res) => {
  try {
    const { fullTransactions = false } = req.query;
    const result = await getBlockByNumber(req.params.blockNumber, Boolean(fullTransactions));
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/jsonrpc/transaction/:hash', async (req, res) => {
  try {
    const result = await getTransactionByHash(req.params.hash);
    res.json(result);
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
});

app.post('/jsonrpc/eth-call', async (req, res) => {
  try {
    const { to, data, blockNumber = 'latest' } = req.body;
    const result = await ethCall(to, data, blockNumber);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/jsonrpc/send-transaction', async (req, res) => {
  try {
    const { signedTransaction } = req.body;
    const result = await sendRawTransaction(signedTransaction);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/jsonrpc/methods', async (req, res) => {
  try {
    const result = await listJsonRpcMethods();
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Database endpoints
app.post('/database/ask', async (req, res) => {
  try {
    const { question } = req.body;
    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }
    const result = await askQuestion(question);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/database/info', async (req, res) => {
  try {
    const result = await getDatabaseInfo();
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/database/schema/download', async (req, res) => {
  try {
    const schema = await downloadDatabaseSchema();
    res.json({
      success: true,
      tables: Object.keys(schema.tables).length,
      relationships: schema.relationships.length,
    });
  } catch (error: any) {
    console.error('Schema download error:', error);
    res.status(500).json({ error: error.message || 'Failed to download schema' });
  }
});

// Generic tool execution endpoint (MCP-compatible)
app.post('/execute', async (req, res) => {
  try {
    const { tool, arguments: args } = req.body;

    let result;
    switch (tool) {
      case 'execute_graphql_query':
        result = await executeGraphQLQuery(args?.query, args?.variables);
        break;
      case 'get_graphql_schema':
        result = await getGraphQLSchema();
        break;
      case 'refresh_graphql_schema':
        result = await refreshGraphQLSchema();
        break;
      case 'get_graphql_query_template':
        result = await buildGraphQLQuery(args?.description, args?.returnFields);
        break;
      case 'get_account_info':
        result = await getAccountInfo(args?.accountId);
        break;
      case 'get_transaction_history':
        result = await getTransactionHistory(args?.accountId, args?.limit, args?.order);
        break;
      case 'get_token_balances':
        result = await getTokenBalances(args?.accountId, args?.tokenId);
        break;
      case 'get_network_stats':
        result = await getNetworkStats(args?.metric);
        break;
      case 'execute_json_rpc':
        result = await executeJsonRpcMethod(args?.method, args?.params);
        break;
      case 'get_chain_id':
        result = await getChainId();
        break;
      case 'get_block_by_number':
        result = await getBlockByNumber(args?.blockNumber, args?.fullTransactions);
        break;
      case 'get_transaction_by_hash':
        result = await getTransactionByHash(args?.transactionHash);
        break;
      case 'eth_call':
        result = await ethCall(args?.to, args?.data, args?.blockNumber);
        break;
      case 'send_raw_transaction':
        result = await sendRawTransaction(args?.signedTransaction);
        break;
      case 'list_json_rpc_methods':
        result = await listJsonRpcMethods();
        break;
      case 'ask_question':
        result = await askQuestion(args?.question);
        break;
      case 'get_database_info':
        result = await getDatabaseInfo();
        break;
      case 'download_database_schema':
        const schema = await downloadDatabaseSchema();
        result = {
          content: [
            {
              type: 'text',
              text: `Database schema downloaded. Found ${Object.keys(schema.tables).length} tables.`,
            },
          ],
        };
        break;
      default:
        return res.status(400).json({ error: `Unknown tool: ${tool}` });
    }

    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Hgraph MCP Server running on http://localhost:${PORT}`);
  console.log(`📚 API documentation available at http://localhost:${PORT}/tools`);
  console.log(`🏥 Health check at http://localhost:${PORT}/health`);
});

export default app;
