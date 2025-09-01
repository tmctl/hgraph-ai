/**
 * Database Tools for MCP Server
 *
 * Provides safe, read-only database access with natural language queries
 * Following MCP best practices - returns data, not raw SQL
 */

import { Client } from 'pg';
import { format } from 'sql-formatter';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
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
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
  character_maximum_length: number | null;
}

interface DatabaseSchema {
  tables: {
    [tableName: string]: {
      columns: {
        [columnName: string]: {
          data_type: string;
          is_nullable: boolean;
          column_default: string | null;
          max_length: number | null;
        };
      };
    };
  };
  relationships: Array<{
    table_name: string;
    column_name: string;
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
    // Query to get all table schemas
    const schemaQuery = `
      SELECT 
        t.table_name,
        c.column_name,
        c.data_type,
        c.is_nullable,
        c.column_default,
        c.character_maximum_length
      FROM information_schema.tables t
      JOIN information_schema.columns c 
        ON t.table_name = c.table_name 
        AND t.table_schema = c.table_schema
      WHERE t.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
      ORDER BY t.table_name, c.ordinal_position;
    `;

    const schemaResult = await client.query<TableSchema>(schemaQuery);

    // Query to get foreign key relationships
    const relationshipsQuery = `
      SELECT
        tc.table_name,
        kcu.column_name,
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
        AND tc.table_schema = 'public';
    `;

    const relationshipsResult = await client.query(relationshipsQuery);

    // Process schema into structured format
    const schema: DatabaseSchema = {
      tables: {},
      relationships: relationshipsResult.rows,
    };

    for (const row of schemaResult.rows) {
      if (!schema.tables[row.table_name]) {
        schema.tables[row.table_name] = { columns: {} };
      }

      schema.tables[row.table_name].columns[row.column_name] = {
        data_type: row.data_type,
        is_nullable: row.is_nullable === 'YES',
        column_default: row.column_default,
        max_length: row.character_maximum_length,
      };
    }

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
 * Generate natural language summary of query results
 */
async function generateNaturalLanguageSummary(
  question: string,
  sqlQuery: string,
  results: any[],
  executionTime: number,
): Promise<string> {
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY || '',
  });

  // Prepare results summary for the prompt
  const resultsSample = results.slice(0, 10);
  const resultsJson = JSON.stringify(resultsSample, null, 2);

  const prompt = `Given this database query and results, provide a natural language summary:

Original Question: "${question}"

SQL Query Executed:
${sqlQuery}

Query Results (${results.length} total rows, showing first ${resultsSample.length}):
${resultsJson}

Execution Time: ${executionTime}ms

Please provide a clear, concise natural language summary that:
1. Directly answers the user's question
2. Highlights key findings from the data
3. Mentions any important patterns or insights
4. Is written in a conversational tone
5. Includes specific numbers/values from the results when relevant

Keep the response focused and under 150 words.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 300,
      temperature: 0.3,
      system:
        'You are a helpful data analyst. Provide clear, concise summaries of database query results in natural language. Focus on answering the user\'s question directly.',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    return response.content[0].type === 'text' ? response.content[0].text.trim() : 'Unable to generate summary.';
  } catch (error) {
    console.error('Error generating natural language summary:', error);
    return 'Query executed successfully. See the results table above for details.';
  }
}

/**
 * Convert natural language to SQL using Anthropic Claude
 */
async function naturalLanguageToSQL(question: string, schema: DatabaseSchema): Promise<string> {
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY || '',
  });

  // Create a simplified schema description for the prompt
  const schemaDescription = Object.entries(schema.tables)
    .map(([tableName, tableInfo]) => {
      const columns = Object.entries(tableInfo.columns)
        .map(([colName, colInfo]) => `${colName} (${colInfo.data_type})`)
        .join(', ');
      return `${tableName}: ${columns}`;
    })
    .join('\n');

  const prompt = `Given the following PostgreSQL database schema:

${schemaDescription}

Foreign Key Relationships:
${schema.relationships
  .map(
    (r) => `${r.table_name}.${r.column_name} -> ${r.foreign_table_name}.${r.foreign_column_name}`,
  )
  .join('\n')}

Convert this question to a SQL SELECT query:
"${question}"

Rules:
1. Only generate SELECT queries (no INSERT, UPDATE, DELETE)
2. Use proper JOIN syntax when needed
3. Include appropriate WHERE clauses
4. Limit results to 100 rows by default
5. Use table aliases for clarity
6. Return ONLY the SQL query, no explanations

SQL Query:`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 500,
      temperature: 0,
      system:
        'You are a SQL expert. Generate only valid PostgreSQL SELECT queries. Return only the SQL code, no explanations or markdown formatting.',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const sqlQuery = response.content[0].type === 'text' ? response.content[0].text.trim() : '';

    // Clean up the query
    return sqlQuery
      .replace(/```sql/gi, '')
      .replace(/```/g, '')
      .trim();
  } catch (error) {
    // Fallback to a simple pattern-based approach if Claude fails
    console.warn('Claude API failed, using fallback SQL generation:', error);
    return fallbackNaturalLanguageToSQL(question, schema);
  }
}

/**
 * Fallback SQL generation without AI
 */
function fallbackNaturalLanguageToSQL(question: string, schema: DatabaseSchema): string {
  const lowerQuestion = question.toLowerCase();
  const tables = Object.keys(schema.tables);

  // Find mentioned tables
  const mentionedTables = tables.filter(
    (table) =>
      lowerQuestion.includes(table.toLowerCase()) ||
      lowerQuestion.includes(table.replace(/_/g, ' ').toLowerCase()),
  );

  if (mentionedTables.length === 0 && tables.length > 0) {
    // Default to a common table if none mentioned
    if (tables.includes('account')) mentionedTables.push('account');
    else if (tables.includes('transaction')) mentionedTables.push('transaction');
    else mentionedTables.push(tables[0]);
  }

  const table = mentionedTables[0] || 'account';

  // Determine limit
  let limit = 10;
  const limitMatch = question.match(/(\d+)/);
  if (limitMatch) {
    limit = Math.min(parseInt(limitMatch[1]), 100);
  }

  // Build basic query
  if (lowerQuestion.includes('count') || lowerQuestion.includes('how many')) {
    return `SELECT COUNT(*) as count FROM ${table} LIMIT ${limit};`;
  } else if (lowerQuestion.includes('latest') || lowerQuestion.includes('recent')) {
    const timeColumn = Object.keys(schema.tables[table]?.columns || {}).find(
      (col) => col.includes('timestamp') || col.includes('created'),
    );
    if (timeColumn) {
      return `SELECT * FROM ${table} ORDER BY ${timeColumn} DESC LIMIT ${limit};`;
    }
  } else if (lowerQuestion.includes('balance')) {
    return `SELECT * FROM ${table} WHERE balance > 0 ORDER BY balance DESC LIMIT ${limit};`;
  }

  // Default query
  return `SELECT * FROM ${table} LIMIT ${limit};`;
}

/**
 * Validate SQL query against schema
 */
function validateSQLQuery(query: string, schema: DatabaseSchema): boolean {
  const cleanQuery = query.toLowerCase().trim();

  // Security checks
  if (!cleanQuery.startsWith('select')) {
    throw new Error('Only SELECT queries are allowed');
  }

  const dangerousKeywords = [
    'insert',
    'update',
    'delete',
    'drop',
    'create',
    'alter',
    'truncate',
    'exec',
    'execute',
    'grant',
    'revoke',
  ];

  for (const keyword of dangerousKeywords) {
    if (cleanQuery.includes(keyword)) {
      throw new Error(`Query contains forbidden keyword: ${keyword}`);
    }
  }

  // Check if tables exist
  const tableNames = Object.keys(schema.tables);
  const fromMatch = cleanQuery.match(/from\s+(\w+)/);
  if (fromMatch) {
    const tableName = fromMatch[1];
    if (!tableNames.includes(tableName)) {
      throw new Error(`Table '${tableName}' does not exist in the database`);
    }
  }

  return true;
}

/**
 * Main function: Ask a question in natural language and get data
 */
export async function askQuestion(question: string) {
  try {
    // Get database schema
    const schema = await getOrFetchSchema();

    // Convert natural language to SQL
    let sqlQuery = await naturalLanguageToSQL(question, schema);

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
      output += `**Question:** ${question}\n\n`;
      output += '## Generated SQL Query\n```sql\n';
      output += formattedQuery;
      output += '\n```\n\n';
      output += `**Execution Time:** ${executionTime}ms\n`;
      output += `**Rows Returned:** ${result.rows.length}\n\n`;

      if (result.rows.length > 0) {
        // Generate natural language summary
        const naturalLanguageSummary = await generateNaturalLanguageSummary(
          question,
          sqlQuery,
          result.rows,
          executionTime,
        );
        
        output += '## Natural Language Summary\n\n';
        output += naturalLanguageSummary + '\n\n';
        
        output += '## Results Table\n\n';

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
        output += '## Natural Language Summary\n\n';
        output += 'No data was found matching your query. The database returned zero results.\n\n';
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
    let errorMessage = 'Failed to process your question';

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
        output += `- **${colName}**: ${colInfo.data_type}`;
        if (!colInfo.is_nullable) output += ' (required)';
        output += '\n';
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
