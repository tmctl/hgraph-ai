/**
 * Resource Management for MCP Server
 *
 * Provides access to contextual data sources
 */

import { Resource, ResourceTemplate } from '@modelcontextprotocol/sdk/types.js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Resource types
export const RESOURCE_TYPES = {
  SCHEMA: 'schema',
  DOCUMENTATION: 'documentation',
  CONFIGURATION: 'configuration',
  DATA: 'data',
} as const;

// Available resources
const resources: Resource[] = [
  {
    uri: 'hgraph://schema/graphql',
    name: 'GraphQL Schema',
    description: 'Complete GraphQL schema for Hgraph API',
    mimeType: 'application/graphql',
  },
  {
    uri: 'hgraph://schema/database',
    name: 'Database Schema',
    description: 'PostgreSQL database schema and relationships',
    mimeType: 'application/json',
  },
  {
    uri: 'hgraph://docs/api',
    name: 'API Documentation',
    description: 'Complete API documentation for Hgraph services',
    mimeType: 'text/markdown',
  },
  {
    uri: 'hgraph://docs/examples',
    name: 'Query Examples',
    description: 'Example queries and use cases',
    mimeType: 'text/markdown',
  },
  {
    uri: 'hgraph://config/endpoints',
    name: 'Service Endpoints',
    description: 'Configuration of available Hgraph service endpoints',
    mimeType: 'application/json',
  },
  {
    uri: 'hgraph://data/accounts/{accountId}',
    name: 'Account Data',
    description: 'Retrieve account information and history',
    mimeType: 'application/json',
  },
  {
    uri: 'hgraph://data/tokens/{tokenId}',
    name: 'Token Data',
    description: 'Retrieve token information and statistics',
    mimeType: 'application/json',
  },
  {
    uri: 'hgraph://data/contracts/{contractId}',
    name: 'Contract Data',
    description: 'Retrieve smart contract information and state',
    mimeType: 'application/json',
  },
];

// Resource templates for dynamic resources
const resourceTemplates: ResourceTemplate[] = [
  {
    uriTemplate: 'hgraph://data/accounts/{accountId}',
    name: 'Account Data',
    description: 'Retrieve specific account information',
    mimeType: 'application/json',
  },
  {
    uriTemplate: 'hgraph://data/tokens/{tokenId}',
    name: 'Token Data',
    description: 'Retrieve specific token information',
    mimeType: 'application/json',
  },
  {
    uriTemplate: 'hgraph://data/contracts/{contractId}',
    name: 'Contract Data',
    description: 'Retrieve specific contract information',
    mimeType: 'application/json',
  },
  {
    uriTemplate: 'hgraph://data/transactions/{transactionId}',
    name: 'Transaction Data',
    description: 'Retrieve specific transaction details',
    mimeType: 'application/json',
  },
];

/**
 * List all available resources
 */
export async function listResources(): Promise<Resource[]> {
  return resources;
}

/**
 * List all resource templates
 */
export async function listResourceTemplates(): Promise<ResourceTemplate[]> {
  return resourceTemplates;
}

/**
 * Read a resource by URI
 */
export async function readResource(uri: string): Promise<{ content: any; mimeType: string }> {
  // Parse URI
  const url = new URL(uri);
  const [, type, ...pathParts] = url.pathname.split('/');

  switch (type) {
    case 'schema':
      return readSchemaResource(pathParts.join('/'));

    case 'docs':
      return readDocumentationResource(pathParts.join('/'));

    case 'config':
      return readConfigurationResource(pathParts.join('/'));

    case 'data':
      return readDataResource(pathParts);

    default:
      throw new Error(`Unknown resource type: ${type}`);
  }
}

/**
 * Read schema resources
 */
async function readSchemaResource(path: string): Promise<{ content: any; mimeType: string }> {
  switch (path) {
    case 'graphql':
      // Import GraphQL schema
      const { getGraphQLSchema } = await import('../tools/graphql.js');
      const schema = await getGraphQLSchema();
      return {
        content: schema.content[0].text,
        mimeType: 'application/graphql',
      };

    case 'database':
      // Import database schema
      const { getDatabaseInfo } = await import('../tools/database.js');
      const dbInfo = await getDatabaseInfo();
      return {
        content: dbInfo.content[0].text,
        mimeType: 'application/json',
      };

    default:
      throw new Error(`Unknown schema resource: ${path}`);
  }
}

/**
 * Read documentation resources
 */
async function readDocumentationResource(
  path: string,
): Promise<{ content: any; mimeType: string }> {
  const docsPath = join(process.cwd(), 'docs');

  switch (path) {
    case 'api':
      const apiDocsPath = join(docsPath, 'api.md');
      if (existsSync(apiDocsPath)) {
        return {
          content: readFileSync(apiDocsPath, 'utf-8'),
          mimeType: 'text/markdown',
        };
      }
      return {
        content: generateApiDocumentation(),
        mimeType: 'text/markdown',
      };

    case 'examples':
      const examplesPath = join(docsPath, 'examples.md');
      if (existsSync(examplesPath)) {
        return {
          content: readFileSync(examplesPath, 'utf-8'),
          mimeType: 'text/markdown',
        };
      }
      return {
        content: generateExampleDocumentation(),
        mimeType: 'text/markdown',
      };

    default:
      throw new Error(`Unknown documentation resource: ${path}`);
  }
}

/**
 * Read configuration resources
 */
async function readConfigurationResource(
  path: string,
): Promise<{ content: any; mimeType: string }> {
  switch (path) {
    case 'endpoints':
      return {
        content: JSON.stringify(
          {
            graphql:
              process.env.HGRAPH_GRAPHQL_ENDPOINT ||
              'https://mainnet.hedera.api.hgraph.io/v1/graphql',
            rest: process.env.HGRAPH_REST_ENDPOINT || 'https://mainnet.hedera.api.hgraph.io/api/v1',
            jsonrpc:
              process.env.HGRAPH_JSONRPC_ENDPOINT || 'https://mainnet.hedera.api.hgraph.io/rpc',
            database: {
              configured: !!process.env.DB_HOST,
              host: process.env.DB_HOST ? '***' : undefined,
            },
          },
          null,
          2,
        ),
        mimeType: 'application/json',
      };

    default:
      throw new Error(`Unknown configuration resource: ${path}`);
  }
}

/**
 * Read data resources
 */
async function readDataResource(pathParts: string[]): Promise<{ content: any; mimeType: string }> {
  const [resourceType, resourceId] = pathParts;

  switch (resourceType) {
    case 'accounts':
      const { getTransactionHistory } = await import('../tools/transactions.js');
      const { getTokenBalances } = await import('../tools/tokens.js');

      const [transactions, tokens] = await Promise.all([
        getTransactionHistory(resourceId, 10, 'desc'),
        getTokenBalances(resourceId),
      ]);

      return {
        content: JSON.stringify(
          {
            accountId: resourceId,
            transactions: JSON.parse(transactions.content[0].text),
            tokens: JSON.parse(tokens.content[0].text),
          },
          null,
          2,
        ),
        mimeType: 'application/json',
      };

    case 'tokens': {
      // Fetch token information
      const { executeGraphQLQuery } = await import('../tools/graphql.js');
      const tokenResult = await executeGraphQLQuery(
        `
        query GetToken($tokenId: String!) {
          token(where: { token_id: { _eq: $tokenId } }) {
            token_id
            name
            symbol
            decimals
            total_supply
            created_timestamp
            type
          }
        }
      `,
        { tokenId: resourceId },
      );

      return {
        content: tokenResult.content[0].text,
        mimeType: 'application/json',
      };
    }

    case 'contracts': {
      // Fetch contract information
      const { executeGraphQLQuery: executeQuery } = await import('../tools/graphql.js');
      const contractResult = await executeQuery(
        `
        query GetContract($contractId: String!) {
          contract(where: { contract_id: { _eq: $contractId } }) {
            contract_id
            created_timestamp
            evm_address
            bytecode
            runtime_bytecode
          }
        }
      `,
        { contractId: resourceId },
      );

      return {
        content: contractResult.content[0].text,
        mimeType: 'application/json',
      };
    }

    case 'transactions':
      const { getTransactionByHash } = await import('../tools/jsonrpc.js');
      const txResult = await getTransactionByHash(resourceId);

      return {
        content: txResult.content[0].text,
        mimeType: 'application/json',
      };

    default:
      throw new Error(`Unknown data resource type: ${resourceType}`);
  }
}

/**
 * Generate API documentation
 */
function generateApiDocumentation(): string {
  return `# Hgraph MCP API Documentation

## Overview
The Hgraph MCP Server provides access to Hedera blockchain data through multiple protocols:
- GraphQL API for flexible queries
- REST API for simple data access
- JSON-RPC for Ethereum-compatible operations
- Natural language queries via AI

## Available Tools

### GraphQL Tools
- \`execute_graphql_query\`: Execute GraphQL queries
- \`get_graphql_schema\`: Retrieve the schema
- \`refresh_graphql_schema\`: Update cached schema
- \`get_graphql_query_template\`: Generate query examples

### Database Tools
- \`ask_question\`: Natural language database queries
- \`get_database_info\`: Schema information
- \`download_database_schema\`: Cache schema locally

### Blockchain Tools
- \`get_transaction_history\`: Account transaction history
- \`get_token_balances\`: Token holdings
- \`execute_json_rpc\`: JSON-RPC method execution
- \`get_chain_id\`: Network chain ID
- \`get_block_by_number\`: Block information
- \`eth_call\`: Smart contract calls

### Visualization Tools
- \`create_d3_visualization\`: Generate D3.js visualizations
- \`generate_d3_from_description\`: AI-powered visualization creation

## Authentication
Include the \`x-api-token\` header with your API token in all requests.

## Rate Limiting
- 100 requests per minute per token
- Retry-After header indicates wait time when limited
`;
}

/**
 * Generate example documentation
 */
function generateExampleDocumentation(): string {
  return `# Hgraph MCP Query Examples

## GraphQL Queries

### Get Account Balance
\`\`\`graphql
query GetAccountBalance($accountId: String!) {
  account(where: { account_id: { _eq: $accountId } }) {
    account_id
    balance
    created_timestamp
  }
}
\`\`\`

### Get Recent Transactions
\`\`\`graphql
query GetRecentTransactions($limit: Int!) {
  transaction(limit: $limit, order_by: { consensus_timestamp: desc }) {
    transaction_id
    consensus_timestamp
    charged_tx_fee
    result
    transfers {
      account_id
      amount
    }
  }
}
\`\`\`

## Natural Language Queries

### Example Questions
- "What is the balance of account 0.0.123456?"
- "Show me the last 10 transactions for account 0.0.98765"
- "Which accounts hold token 0.0.456789?"
- "What contracts were deployed in the last 24 hours?"

## JSON-RPC Methods

### Get Latest Block
\`\`\`json
{
  "method": "eth_getBlockByNumber",
  "params": ["latest", false]
}
\`\`\`

### Get Transaction Receipt
\`\`\`json
{
  "method": "eth_getTransactionReceipt",
  "params": ["0x..."]
}
\`\`\`

## Visualization Examples

### Create Bar Chart
\`\`\`javascript
{
  "data": [...],
  "type": "bar",
  "title": "Token Distribution",
  "xAxis": { "field": "token", "label": "Token" },
  "yAxis": { "field": "balance", "label": "Balance" }
}
\`\`\`
`;
}
