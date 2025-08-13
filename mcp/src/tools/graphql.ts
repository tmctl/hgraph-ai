/**
 * GraphQL Tools for MCP Server
 *
 * Following MCP best practices:
 * - executeGraphQLQuery returns actual data from the API, not just queries
 * - buildGraphQLQuery provides templates for learning/documentation only
 * - All data access is handled server-side with proper error handling
 * - No raw query execution exposed to clients
 */

import { GraphQLClient } from 'graphql-request';
import { getIntrospectionQuery, buildClientSchema, printSchema, GraphQLSchema } from 'graphql';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

// Cache for introspected schema
let HGRAPH_SCHEMA: string | null = null;
let INTROSPECTED_SCHEMA: GraphQLSchema | null = null;
let SCHEMA_LAST_FETCHED: number = 0;
const SCHEMA_CACHE_DURATION = 3600000; // 1 hour in milliseconds

// Try to load cached schema from file
function loadCachedSchema(): string | null {
  try {
    const schemaPath = join(process.cwd(), 'src/schema/hgraph-schema-introspected.graphql');
    return readFileSync(schemaPath, 'utf-8');
  } catch {
    // Fall back to static schema if available
    try {
      return readFileSync(join(process.cwd(), 'src/schema/hgraph-schema.graphql'), 'utf-8');
    } catch {
      return null;
    }
  }
}

// Save introspected schema to file
function saveCachedSchema(schema: string): void {
  try {
    const schemaPath = join(process.cwd(), 'src/schema/hgraph-schema-introspected.graphql');
    writeFileSync(schemaPath, schema, 'utf-8');
    console.log('Schema cached to file successfully');
  } catch (error) {
    console.warn('Could not cache schema to file:', error);
  }
}

// Initialize with cached schema
HGRAPH_SCHEMA = loadCachedSchema();

const HGRAPH_GRAPHQL_ENDPOINT =
  process.env.HGRAPH_GRAPHQL_URL || 'https://mainnet.hedera.api.hgraph.io/v1/graphql';
const HGRAPH_API_KEY = process.env.HGRAPH_API_KEY;

const client = new GraphQLClient(HGRAPH_GRAPHQL_ENDPOINT, {
  headers: {
    'Content-Type': 'application/json',
    'User-Agent': 'Hgraph-MCP-Server/1.0',
    ...(HGRAPH_API_KEY && { Authorization: `Bearer ${HGRAPH_API_KEY}` }),
  },
});

export async function executeGraphQLQuery(query: string, variables?: Record<string, any>) {
  try {
    if (!query.trim()) {
      throw new Error('GraphQL query cannot be empty');
    }

    const cleanQuery = query.trim();
    if (
      !cleanQuery.startsWith('query') &&
      !cleanQuery.startsWith('mutation') &&
      !cleanQuery.startsWith('{')
    ) {
      throw new Error('Invalid GraphQL query format. Must start with "query", "mutation", or "{"');
    }

    const response = await client.request(query, variables);

    let result = '# GraphQL Query Result\n\n';
    result += '## Query\n```graphql\n';
    result += query;
    result += '\n```\n\n';

    if (variables && Object.keys(variables).length > 0) {
      result += '## Variables\n```json\n';
      result += JSON.stringify(variables, null, 2);
      result += '\n```\n\n';
    }

    result += '## Result\n```json\n';
    result += JSON.stringify(response, null, 2);
    result += '\n```';

    return {
      content: [
        {
          type: 'text',
          text: result,
        },
      ],
    };
  } catch (error: any) {
    let errorMessage = 'GraphQL query failed';

    if (error.response?.errors) {
      errorMessage += ':\n\n';
      error.response.errors.forEach((err: any, index: number) => {
        errorMessage += `**Error ${index + 1}:** ${err.message}\n`;
        if (err.locations) {
          errorMessage += `**Location:** Line ${err.locations[0].line}, Column ${err.locations[0].column}\n`;
        }
        if (err.path) {
          errorMessage += `**Path:** ${err.path.join(' → ')}\n`;
        }
        errorMessage += '\n';
      });
    } else if (error.message) {
      errorMessage += `: ${error.message}`;
    }

    throw new Error(errorMessage);
  }
}

// Get or fetch the GraphQL schema with caching
async function getOrFetchSchema(): Promise<{ schema: GraphQLSchema; schemaString: string }> {
  const now = Date.now();

  // Return cached schema if still valid
  if (INTROSPECTED_SCHEMA && HGRAPH_SCHEMA && now - SCHEMA_LAST_FETCHED < SCHEMA_CACHE_DURATION) {
    return { schema: INTROSPECTED_SCHEMA, schemaString: HGRAPH_SCHEMA };
  }

  try {
    // Fetch fresh schema via introspection
    const introspectionQuery = getIntrospectionQuery();
    const response = await client.request(introspectionQuery);

    // Build schema from introspection
    const introspectionResult = (response as any).__schema
      ? response
      : (response as any).data || response;
    const schema = buildClientSchema(introspectionResult);
    const schemaString = printSchema(schema);

    // Update cache
    INTROSPECTED_SCHEMA = schema;
    HGRAPH_SCHEMA = schemaString;
    SCHEMA_LAST_FETCHED = now;

    // Save to file for persistence
    saveCachedSchema(schemaString);

    console.log('Schema introspection successful, cache updated');
    return { schema, schemaString };
  } catch (error) {
    console.error('Schema introspection failed:', error);

    // Fall back to cached schema if introspection fails
    if (HGRAPH_SCHEMA) {
      console.log('Using cached schema');
      // Create a basic schema object from the string if needed
      return {
        schema: INTROSPECTED_SCHEMA || ({} as GraphQLSchema),
        schemaString: HGRAPH_SCHEMA,
      };
    }

    throw new Error(`Failed to get schema: ${(error as any).message}`);
  }
}

export async function refreshGraphQLSchema() {
  try {
    // Force refresh by resetting cache timestamp
    SCHEMA_LAST_FETCHED = 0;
    const { schemaString } = await getOrFetchSchema();

    return {
      content: [
        {
          type: 'text',
          text: `Schema refreshed successfully! Cached ${schemaString.length} characters of schema definition.`,
        },
      ],
    };
  } catch (error: any) {
    throw new Error(`Failed to refresh GraphQL schema: ${error.message}`);
  }
}

export async function getGraphQLSchema() {
  try {
    const { schema, schemaString } = await getOrFetchSchema();

    let result = '# Hgraph GraphQL Schema\n\n';
    result += '## Schema Definition\n\n';
    result += '```graphql\n';
    result += schemaString;
    result += '\n```\n\n';

    result += '## Available Types\n\n';
    const typeMap = schema.getTypeMap();
    Object.keys(typeMap)
      .filter((name) => !name.startsWith('__'))
      .sort()
      .forEach((typeName) => {
        const type = typeMap[typeName];
        result += `- **${typeName}**: ${type.description || 'No description'}\n`;
      });

    return {
      content: [
        {
          type: 'text',
          text: result,
        },
      ],
    };
  } catch (error: any) {
    throw new Error(`Failed to fetch GraphQL schema: ${error.message}`);
  }
}

export async function buildGraphQLQuery(description: string, returnFields?: string[]) {
  try {
    // Ensure we have the latest schema
    const { schemaString } = await getOrFetchSchema();
    const currentSchema = schemaString || HGRAPH_SCHEMA || '';
    const examples = {
      account: `query GetAccountInfo($entityId: bigint!) {
  entity(where: {id: {_eq: $entityId}}) {
    id
    balance
    created_timestamp
    expiration_timestamp
    evm_address
    memo
    public_key
    deleted
    staked_account_id
    staked_node_id
    decline_reward
    auto_renew_period
    max_automatic_token_associations
    receiver_sig_required
  }
}`,
      transactions: `query GetTransactions($accountId: AccountId!, $first: Int = 10) {
  transactions(
    where: { payerAccountId: $accountId }
    orderBy: [{ consensusTimestamp: DESC }]
    first: $first
  ) {
    edges {
      node {
        id
        transactionHash
        consensusTimestamp
        type
        result
        chargedTxFee
        maxFee
        hbarTransfers {
          accountId
          amount
          isApproval
        }
        tokenTransfers {
          tokenId
          accountId
          amount
          token {
            name
            symbol
          }
        }
      }
    }
  }
}`,
      tokens: `query GetTokenBalances($accountId: AccountId!, $first: Int = 20) {
  tokenBalances(
    where: { accountId: $accountId }
    orderBy: [{ balance: DESC }]
    first: $first
  ) {
    edges {
      node {
        tokenId
        balance
        createdTimestamp
        freezeStatus
        kycStatus
        token {
          name
          symbol
          decimals
          type
          totalSupply
          treasuryAccountId
          deleted
        }
      }
    }
  }
}`,
      network: `query GetNetworkStats {
  networkNodes(first: 50) {
    edges {
      node {
        nodeId
        nodeAccountId
        description
        stake
        stakeRewarded
        stakeNotRewarded
        minStake
        maxStake
        rewardRateStart
        serviceEndpoints {
          ipAddressV4
          port
        }
      }
    }
  }
  networkSupply {
    totalSupply
    releasedSupply
    timestamp
  }
  networkExchangeRates {
    currentRate {
      centsEquivalent
      hbarEquivalent
      expirationTime
    }
    timestamp
  }
}`,
      topicMessages: `query GetTopicMessages($topicId: TopicId!, $first: Int = 10) {
  topicMessages(
    where: { topicId: $topicId }
    orderBy: [{ consensusTimestamp: DESC }]
    first: $first
  ) {
    edges {
      node {
        topicId
        consensusTimestamp
        message
        runningHash
        sequenceNumber
        payerAccountId
        chunkInfo {
          initialTransactionId
          total
          number
        }
      }
    }
  }
}`,
      contracts: `query GetContracts($first: Int = 10) {
  contracts(
    orderBy: [{ createdTimestamp: DESC }]
    first: $first
  ) {
    edges {
      node {
        id
        createdTimestamp
        expirationTimestamp
        evmAddress
        memo
        deleted
        fileId
        proxyAccountId
      }
    }
  }
}`,
    };

    const lowerDesc = description.toLowerCase();
    let suggestedQuery = '';
    let queryType = 'custom';

    if (lowerDesc.includes('account') && !lowerDesc.includes('transaction')) {
      suggestedQuery = examples.account;
      queryType = 'account';
    } else if (lowerDesc.includes('transaction')) {
      suggestedQuery = examples.transactions;
      queryType = 'transactions';
    } else if (lowerDesc.includes('token') || lowerDesc.includes('balance')) {
      suggestedQuery = examples.tokens;
      queryType = 'tokens';
    } else if (lowerDesc.includes('network') || lowerDesc.includes('stats')) {
      suggestedQuery = examples.network;
      queryType = 'network';
    } else if (lowerDesc.includes('topic') || lowerDesc.includes('message')) {
      suggestedQuery = examples.topicMessages;
      queryType = 'topicMessages';
    } else if (lowerDesc.includes('contract')) {
      suggestedQuery = examples.contracts;
      queryType = 'contracts';
    }

    let result = `# GraphQL Query Builder\n\n`;
    result += `**Description:** ${description}\n`;
    result += `**Query Type:** ${queryType}\n\n`;

    if (suggestedQuery) {
      result += `## Suggested Query\n\n`;
      result += '```graphql\n';
      result += suggestedQuery;
      result += '\n```\n\n';

      result += `## Usage\n`;
      result += `Copy the query above and use it with the \`execute_graphql_query\` tool.\n\n`;

      if (queryType === 'account' || queryType === 'transactions' || queryType === 'tokens') {
        result += `**Required Variables:**\n`;
        result += '```json\n';
        result += JSON.stringify({ accountId: '0.0.123456' }, null, 2);
        result += '\n```\n\n';
      } else if (queryType === 'topicMessages') {
        result += `**Required Variables:**\n`;
        result += '```json\n';
        result += JSON.stringify({ topicId: '0.0.123456' }, null, 2);
        result += '\n```\n\n';
      }
    } else {
      result += `## Custom Query Template\n\n`;
      result += '```graphql\n';
      result += `query CustomQuery {\n  # Add your query fields here\n  # Use the schema introspection tool to explore available types\n}\n`;
      result += '\n```\n\n';
    }

    result += `## Available Examples\n`;
    Object.keys(examples).forEach((key) => {
      result += `- **${key}**: Query ${key} data\n`;
    });

    if (currentSchema) {
      result += `\n## Schema Reference\n`;
      result += `Use the schema below to understand available fields and types:\n\n`;
      result += '```graphql\n';
      result += currentSchema.substring(0, 2000); // Show first 2000 chars
      if (currentSchema.length > 2000) {
        result += '\n# ... (schema truncated for display)\n';
      }
      result += '\n```\n';
    }

    return {
      content: [
        {
          type: 'text',
          text: result,
        },
      ],
    };
  } catch (error: any) {
    throw new Error(`Failed to build GraphQL query: ${error.message}`);
  }
}
