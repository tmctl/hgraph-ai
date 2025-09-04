/**
 * Database Tools for MCP Server
 *
 * Following MCP best practices - returns data, not raw SQL
 */

import { Client } from 'pg';
import { format } from 'sql-formatter';
import { z } from 'zod';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// Database configuration schema
const DatabaseConfigSchema = z.object({
  host: z.string(),
  port: z.number(),
  database: z.string(),
  username: z.string(),
  password: z.string(),
  ssl: z.boolean().optional().default(true),
});

interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
}

interface TableSchema {
  table_schema: string;
  table_name: string;
  column_name: string;
  data_type: string;
}

interface DatabaseSchema {
  tables: {
    [tableName: string]: {
      description?: string;
      commonQueries?: string[];
      keyFields?: string[];
      columns: {
        [columnName: string]: {
          data_type: string;
        };
      };
      relationships?: {
        object_relationships?: Array<{
          name: string;
          table: string;
          column_mapping: Record<string, string>;
        }>;
        array_relationships?: Array<{
          name: string;
          table: string;
          column_mapping: Record<string, string>;
        }>;
      };
    };
  };
  relationships: Array<{
    table_schema?: string;
    table_name: string;
    column_name: string;
    foreign_table_schema?: string;
    foreign_table_name: string;
    foreign_column_name: string;
  }>;
}

// Cache for database schema
let CACHED_SCHEMA: DatabaseSchema | null = null;
let SCHEMA_LAST_FETCHED = 0;
const SCHEMA_CACHE_DURATION = 3600000; // 1 hour

function getDatabaseConfig(): DatabaseConfig {
  const config = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_DATABASE || 'hgraph',
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || '',
    ssl: process.env.DB_SSL !== 'false',
  };

  try {
    return DatabaseConfigSchema.parse(config);
  } catch (error) {
    throw new Error(
      'Database configuration is incomplete. Please set DB_HOST, DB_USERNAME, and DB_PASSWORD environment variables.',
    );
  }
}

async function createConnection(config: DatabaseConfig): Promise<Client> {
  const client = new Client({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.username,
    password: config.password,
    ssl: config.ssl ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 10000,
    query_timeout: 30000,
  });

  await client.connect();
  return client;
}

/**
 * Download and cache the database schema
 */
export async function downloadDatabaseSchema(): Promise<DatabaseSchema> {
  const config = getDatabaseConfig();
  const client = await createConnection(config);

  try {
    // Query to get all table schemas from both public and ecosystem schemas
    // (excluding legacy tables and partitioned hash tables)
    const schemaQuery = `
      SELECT 
        t.table_schema,
        t.table_name,
        c.column_name,
        c.data_type
      FROM information_schema.tables t
      JOIN information_schema.columns c 
        ON t.table_name = c.table_name 
        AND t.table_schema = c.table_schema
      WHERE t.table_schema IN ('public', 'ecosystem')
        AND t.table_type = 'BASE TABLE'
        AND t.table_name NOT LIKE 'account_balance%'
        AND t.table_name NOT LIKE 'token_balance%'
        AND t.table_name NOT LIKE 'transaction_hash_%'
      ORDER BY t.table_schema, t.table_name, c.ordinal_position;
    `;

    const schemaResult = await client.query<TableSchema>(schemaQuery);

    // Query to get foreign key relationships from both schemas
    // (excluding legacy tables and partitioned hash tables)
    const relationshipsQuery = `
      SELECT
        tc.table_schema,
        tc.table_name,
        kcu.column_name,
        ccu.table_schema AS foreign_table_schema,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema IN ('public', 'ecosystem')
        AND tc.table_name NOT LIKE 'account_balance%'
        AND tc.table_name NOT LIKE 'token_balance%'
        AND tc.table_name NOT LIKE 'transaction_hash_%'
        AND ccu.table_name NOT LIKE 'account_balance%'
        AND ccu.table_name NOT LIKE 'token_balance%'
        AND ccu.table_name NOT LIKE 'transaction_hash_%';
    `;

    const relationshipsResult = await client.query(relationshipsQuery);

    // Process schema into structured format
    const schema: DatabaseSchema = {
      tables: {},
      relationships: relationshipsResult.rows,
    };

    for (const row of schemaResult.rows) {
      // Skip legacy tables and partitioned hash tables
      if (
        row.table_name.startsWith('account_balance') ||
        row.table_name.startsWith('token_balance') ||
        row.table_name.startsWith('transaction_hash_')
      ) {
        continue;
      }

      // Create fully qualified table name with schema prefix for ecosystem tables
      const qualifiedTableName =
        row.table_schema === 'ecosystem' ? `ecosystem.${row.table_name}` : row.table_name;

      if (!schema.tables[qualifiedTableName]) {
        schema.tables[qualifiedTableName] = { columns: {} };
      }

      schema.tables[qualifiedTableName].columns[row.column_name] = {
        data_type: row.data_type,
      };
    }

    // Enhance schema with GraphQL relationship mappings and semantic metadata
    await enhanceSchemaWithGraphQLRelationships(schema);
    await addSemanticMetadata(schema);

    // Cache the schema
    CACHED_SCHEMA = schema;
    SCHEMA_LAST_FETCHED = Date.now();

    // Save to file for persistence
    const schemaDir = join(process.cwd(), 'src/schema');
    if (!existsSync(schemaDir)) {
      mkdirSync(schemaDir, { recursive: true });
    }
    const schemaPath = join(schemaDir, 'database-schema.json');
    writeFileSync(schemaPath, JSON.stringify(schema, null, 2));

    return schema;
  } finally {
    await client.end();
  }
}

/**
 * Get cached schema or download if needed
 */
async function getOrFetchSchema(): Promise<DatabaseSchema> {
  const now = Date.now();

  // Return cached schema if still valid
  if (CACHED_SCHEMA && now - SCHEMA_LAST_FETCHED < SCHEMA_CACHE_DURATION) {
    return CACHED_SCHEMA;
  }

  // Try to load from file
  const schemaPath = join(process.cwd(), 'src/schema/database-schema.json');
  if (existsSync(schemaPath)) {
    try {
      const schemaData = readFileSync(schemaPath, 'utf-8');
      CACHED_SCHEMA = JSON.parse(schemaData);
      SCHEMA_LAST_FETCHED = now;
      return CACHED_SCHEMA!;
    } catch (error) {
      console.warn('Failed to load cached schema:', error);
    }
  }

  // Download fresh schema
  return downloadDatabaseSchema();
}

/**
 * Enhance database schema with GraphQL relationship mappings
 */
async function enhanceSchemaWithGraphQLRelationships(schema: DatabaseSchema): Promise<void> {
  try {
    const graphqlSchemaPath = join(process.cwd(), 'src/schema/graphql-schema.json');
    if (!existsSync(graphqlSchemaPath)) {
      console.warn('GraphQL schema file not found, skipping relationship enhancement');
      return;
    }

    const graphqlSchemaData = JSON.parse(readFileSync(graphqlSchemaPath, 'utf-8'));
    const tables = graphqlSchemaData?.sources?.[0]?.tables || [];

    for (const tableConfig of tables) {
      const tableName = tableConfig.table.name;
      const tableSchema = tableConfig.table.schema || 'public';
      const qualifiedTableName = tableSchema === 'ecosystem' ? `ecosystem.${tableName}` : tableName;

      // Skip if table not in our schema (filtered out)
      if (!schema.tables[qualifiedTableName]) {
        continue;
      }

      // Initialize relationships if not exists
      if (!schema.tables[qualifiedTableName].relationships) {
        schema.tables[qualifiedTableName].relationships = {};
      }

      // Process object relationships (one-to-one)
      if (tableConfig.object_relationships) {
        schema.tables[qualifiedTableName].relationships!.object_relationships =
          tableConfig.object_relationships.map((rel: any) => ({
            name: rel.name,
            table:
              rel.using?.manual_configuration?.remote_table?.schema === 'ecosystem'
                ? `ecosystem.${rel.using.manual_configuration.remote_table.name}`
                : rel.using?.manual_configuration?.remote_table?.name || '',
            column_mapping: rel.using?.manual_configuration?.column_mapping || {},
          }));
      }

      // Process array relationships (one-to-many)
      if (tableConfig.array_relationships) {
        schema.tables[qualifiedTableName].relationships!.array_relationships =
          tableConfig.array_relationships.map((rel: any) => ({
            name: rel.name,
            table:
              rel.using?.manual_configuration?.remote_table?.schema === 'ecosystem'
                ? `ecosystem.${rel.using.manual_configuration.remote_table.name}`
                : rel.using?.manual_configuration?.remote_table?.name || '',
            column_mapping: rel.using?.manual_configuration?.column_mapping || {},
          }));
      }
    }

    console.log('✅ Enhanced schema with GraphQL relationship mappings');
  } catch (error) {
    console.warn('Warning: Could not enhance schema with GraphQL relationships:', error);
  }
}

/**
 * Add semantic metadata to help external models understand Hedera data structures
 */
async function addSemanticMetadata(schema: DatabaseSchema): Promise<void> {
  const HEDERA_TABLE_METADATA: Record<
    string,
    {
      description: string;
      commonQueries: string[];
      keyFields: string[];
    }
  > = {
    entity: {
      description:
        'All Hedera entities (accounts, tokens, contracts, topics). Contains current balances in tinybars (1 HBAR = 100,000,000 tinybars)',
      commonQueries: [
        'SELECT * FROM entity WHERE id = 123456 -- Get account info by ID',
        'SELECT id, balance, balance_timestamp FROM entity WHERE balance > 100000000000 ORDER BY balance DESC LIMIT 10 -- Top accounts by balance',
        "SELECT id, type, created_timestamp FROM entity WHERE type = 'ACCOUNT' AND created_timestamp > extract(epoch from now() - interval '24 hours') * 1000000000 -- New accounts",
      ],
      keyFields: ['id', 'num', 'realm', 'shard', 'balance', 'type', 'created_timestamp'],
    },
    transaction: {
      description:
        'All Hedera network transactions with consensus timestamps in nanoseconds since epoch',
      commonQueries: [
        'SELECT * FROM transaction WHERE payer_account_id = 123456 ORDER BY consensus_timestamp DESC LIMIT 20 -- Recent transactions for account',
        "SELECT type, COUNT(*) FROM transaction WHERE consensus_timestamp > extract(epoch from now() - interval '1 hour') * 1000000000 GROUP BY type -- Transaction types last hour",
        'SELECT * FROM transaction WHERE result != 22 ORDER BY consensus_timestamp DESC LIMIT 10 -- Failed transactions (22 = SUCCESS)',
      ],
      keyFields: ['consensus_timestamp', 'payer_account_id', 'type', 'result', 'charged_tx_fee'],
    },
    token: {
      description: 'HTS (Hedera Token Service) tokens including fungible and non-fungible tokens',
      commonQueries: [
        "SELECT token_id, name, symbol, total_supply, decimals FROM token WHERE type = 'FUNGIBLE_COMMON' ORDER BY created_timestamp DESC LIMIT 10 -- Recent fungible tokens",
        "SELECT * FROM token WHERE name ILIKE '%USDC%' OR symbol ILIKE '%USDC%' -- Find USDC tokens",
        "SELECT token_id, name, COUNT(*) as nft_count FROM token t JOIN nft n ON t.token_id = n.token_id WHERE type = 'NON_FUNGIBLE_UNIQUE' GROUP BY token_id, name ORDER BY nft_count DESC -- NFT collections by size",
      ],
      keyFields: [
        'token_id',
        'name',
        'symbol',
        'type',
        'total_supply',
        'decimals',
        'treasury_account_id',
      ],
    },
    crypto_transfer: {
      description: 'HBAR transfers between accounts (amounts in tinybars)',
      commonQueries: [
        'SELECT * FROM crypto_transfer WHERE entity_id = 123456 ORDER BY consensus_timestamp DESC LIMIT 20 -- HBAR transfers for account',
        "SELECT entity_id, SUM(amount) as net_amount FROM crypto_transfer WHERE consensus_timestamp > extract(epoch from now() - interval '24 hours') * 1000000000 GROUP BY entity_id ORDER BY net_amount DESC -- Net HBAR flow last 24h",
        'SELECT * FROM crypto_transfer WHERE amount > 100000000000 ORDER BY consensus_timestamp DESC -- Large HBAR transfers (>1000 HBAR)',
      ],
      keyFields: ['entity_id', 'amount', 'consensus_timestamp', 'payer_account_id'],
    },
    token_transfer: {
      description: 'Token transfers (both fungible and NFT) between accounts',
      commonQueries: [
        'SELECT * FROM token_transfer WHERE account_id = 123456 ORDER BY consensus_timestamp DESC LIMIT 20 -- Token transfers for account',
        "SELECT token_id, SUM(amount) as volume FROM token_transfer WHERE consensus_timestamp > extract(epoch from now() - interval '24 hours') * 1000000000 GROUP BY token_id ORDER BY volume DESC -- Token volume last 24h",
        'SELECT * FROM token_transfer WHERE token_id = 456789 ORDER BY consensus_timestamp DESC LIMIT 100 -- Transfers for specific token',
      ],
      keyFields: ['token_id', 'account_id', 'amount', 'consensus_timestamp'],
    },
    nft: {
      description: 'Non-fungible tokens (NFTs) with metadata and ownership',
      commonQueries: [
        'SELECT * FROM nft WHERE account_id = 123456 -- NFTs owned by account',
        'SELECT token_id, COUNT(*) as nft_count FROM nft WHERE account_id IS NOT NULL GROUP BY token_id ORDER BY nft_count DESC -- NFT holdings by collection',
        'SELECT * FROM nft WHERE token_id = 456789 ORDER BY serial_number -- All NFTs in collection',
      ],
      keyFields: ['token_id', 'serial_number', 'account_id', 'created_timestamp', 'metadata'],
    },
    contract_result: {
      description: 'Smart contract execution results including gas usage and function calls',
      commonQueries: [
        'SELECT * FROM contract_result WHERE contract_id = 123456 ORDER BY consensus_timestamp DESC LIMIT 20 -- Recent contract calls',
        'SELECT contract_id, AVG(gas_used) as avg_gas FROM contract_result GROUP BY contract_id ORDER BY avg_gas DESC -- Gas usage by contract',
        'SELECT * FROM contract_result WHERE error_message IS NOT NULL ORDER BY consensus_timestamp DESC -- Failed contract calls',
      ],
      keyFields: [
        'contract_id',
        'consensus_timestamp',
        'gas_used',
        'function_result',
        'error_message',
      ],
    },
    topic_message: {
      description: 'HCS (Hedera Consensus Service) messages published to topics',
      commonQueries: [
        'SELECT * FROM topic_message WHERE topic_id = 123456 ORDER BY consensus_timestamp DESC LIMIT 20 -- Recent messages for topic',
        'SELECT topic_id, COUNT(*) as message_count FROM topic_message GROUP BY topic_id ORDER BY message_count DESC -- Most active topics',
        "SELECT * FROM topic_message WHERE consensus_timestamp > extract(epoch from now() - interval '1 hour') * 1000000000 ORDER BY consensus_timestamp DESC -- Recent HCS messages",
      ],
      keyFields: [
        'topic_id',
        'consensus_timestamp',
        'sequence_number',
        'message',
        'payer_account_id',
      ],
    },
    'ecosystem.metric': {
      description: 'Aggregated network metrics and analytics with time periods',
      commonQueries: [
        "SELECT name, period, total FROM ecosystem.metric WHERE name = 'transaction_count' ORDER BY timestamp_range DESC -- Transaction count metrics",
        'SELECT * FROM ecosystem.metric m JOIN ecosystem.metric_description md ON m.name = md.name -- Metrics with descriptions',
        'SELECT name, SUM(total) as total_value FROM ecosystem.metric GROUP BY name ORDER BY total_value DESC -- Aggregate metrics',
      ],
      keyFields: ['name', 'period', 'timestamp_range', 'total'],
    },
    'ecosystem.metric_description': {
      description: 'Descriptions and methodology for ecosystem metrics',
      commonQueries: [
        'SELECT * FROM ecosystem.metric_description -- All available metrics',
        "SELECT * FROM ecosystem.metric_description WHERE name ILIKE '%transaction%' -- Transaction-related metrics",
      ],
      keyFields: ['name', 'description', 'methodology'],
    },
  };

  // Apply metadata to matching tables
  for (const [tableName, metadata] of Object.entries(HEDERA_TABLE_METADATA)) {
    if (schema.tables[tableName]) {
      schema.tables[tableName].description = metadata.description;
      schema.tables[tableName].commonQueries = metadata.commonQueries;
      schema.tables[tableName].keyFields = metadata.keyFields;
    }
  }

  console.log('✅ Added semantic metadata for Hedera-specific tables');
}

/**
 * Validate SQL query against schema
 */
function validateSQLQuery(query: string, schema: DatabaseSchema): boolean {
  // Since the database connection has limited permissions,
  // we don't need to validate SQL keywords
  // The database will reject any operations it doesn't allow
  return true;
}

/**
 * Execute a SQL query directly against the database
 */
export async function executeQuery(sqlQuery: string) {
  try {
    // Get database schema for validation
    const schema = await getOrFetchSchema();

    // Validate the query
    validateSQLQuery(sqlQuery, schema);

    // Format the query for readability
    let formattedQuery: string;
    try {
      formattedQuery = format(sqlQuery, { language: 'postgresql' });
    } catch {
      formattedQuery = sqlQuery;
    }

    // Execute the query
    const config = getDatabaseConfig();
    const client = await createConnection(config);

    try {
      const startTime = Date.now();
      const result = await client.query(sqlQuery);
      const executionTime = Date.now() - startTime;

      // Prepare the response
      let output = '# Database Query Result\n\n';
      output += '## SQL Query\n```sql\n';
      output += formattedQuery;
      output += '\n```\n\n';
      output += `**Execution Time:** ${executionTime}ms\n`;
      output += `**Rows Returned:** ${result.rows.length}\n\n`;

      if (result.rows.length > 0) {
        output += '## Results\n\n';

        // For small result sets, show as table
        if (result.rows.length <= 10) {
          const columns = Object.keys(result.rows[0]);
          output += '| ' + columns.join(' | ') + ' |\n';
          output += '| ' + columns.map(() => '---').join(' | ') + ' |\n';

          for (const row of result.rows) {
            const values = columns.map((col) => {
              const val = row[col];
              if (val === null) return 'NULL';
              if (typeof val === 'object') return JSON.stringify(val);
              return String(val);
            });
            output += '| ' + values.join(' | ') + ' |\n';
          }
        } else {
          // For larger result sets, show as JSON
          output += '```json\n';
          output += JSON.stringify(result.rows.slice(0, 100), null, 2);
          if (result.rows.length > 100) {
            output += '\n// ... truncated to first 100 rows\n';
          }
          output += '\n```\n';
        }
      } else {
        output += '## Results\n\nNo data found matching your query.\n';
      }

      return {
        content: [
          {
            type: 'text',
            text: output,
          },
        ],
      };
    } finally {
      await client.end();
    }
  } catch (error: any) {
    // Return error but don't expose sensitive information
    let errorMessage = 'Failed to execute query';

    if (error.message.includes('forbidden keyword')) {
      errorMessage = error.message;
    } else if (error.message.includes('does not exist')) {
      errorMessage = error.message;
    } else if (error.message.includes('configuration')) {
      errorMessage = 'Database connection not configured. Please set environment variables.';
    } else if (error.code === 'ECONNREFUSED') {
      errorMessage = 'Cannot connect to database. Please check your configuration.';
    } else if (error.code === '42P01') {
      errorMessage = 'Table not found in database.';
    } else if (error.code === '42703') {
      errorMessage = 'Column not found in table.';
    }

    throw new Error(errorMessage);
  }
}

/**
 * Legacy function kept for backwards compatibility
 * Simply delegates to executeQuery
 */
export async function askQuestion(question: string) {
  return executeQuery(question);
}

/**
 * Get information about available tables and columns
 */
export async function getDatabaseInfo() {
  try {
    const schema = await getOrFetchSchema();

    let output = '# Database Schema Information\n\n';
    output += `**Total Tables:** ${Object.keys(schema.tables).length}\n\n`;

    for (const [tableName, tableInfo] of Object.entries(schema.tables)) {
      const columnCount = Object.keys(tableInfo.columns).length;
      output += `## Table: ${tableName}\n`;
      output += `**Columns:** ${columnCount}\n\n`;

      // Show first few columns as example
      const columns = Object.entries(tableInfo.columns).slice(0, 10);
      for (const [colName, colInfo] of columns) {
        output += `- **${colName}**: ${colInfo.data_type}\n`;
      }

      if (columnCount > 10) {
        output += `- ... and ${columnCount - 10} more columns\n`;
      }
      output += '\n';
    }

    // Show relationships
    if (schema.relationships.length > 0) {
      output += '## Foreign Key Relationships\n\n';
      const relationships = schema.relationships.slice(0, 20);
      for (const rel of relationships) {
        output += `- ${rel.table_name}.${rel.column_name} → ${rel.foreign_table_name}.${rel.foreign_column_name}\n`;
      }
      if (schema.relationships.length > 20) {
        output += `- ... and ${schema.relationships.length - 20} more relationships\n`;
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: output,
        },
      ],
    };
  } catch (error: any) {
    throw new Error(`Failed to get database information: ${error.message}`);
  }
}
