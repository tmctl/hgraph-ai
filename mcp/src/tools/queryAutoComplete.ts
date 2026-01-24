/**
 * Query Auto-completion for Hedera Database
 *
 * Provides intelligent query suggestions based on schema and context
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

interface DatabaseSchema {
  tables: {
    [tableName: string]: {
      description?: string;
      commonQueries?: string[];
      keyFields?: string[];
      columns: {
        [columnName: string]: {
          data_type: string;
          udt_name?: string;
          enum_values?: string[];
          is_nullable?: boolean;
          column_default?: string;
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
  types?: {
    [typeName: string]: {
      type: 'enum' | 'composite';
      values?: string[];
      fields?: Record<string, string>;
      description?: string;
    };
  };
}

interface AutoCompleteSuggestion {
  text: string;
  type: 'table' | 'column' | 'keyword' | 'function' | 'template' | 'enum';
  description?: string;
  insertText?: string;
  detail?: string;
}

// SQL Keywords for auto-completion
const SQL_KEYWORDS = [
  'SELECT',
  'FROM',
  'WHERE',
  'JOIN',
  'LEFT JOIN',
  'RIGHT JOIN',
  'INNER JOIN',
  'ON',
  'AND',
  'OR',
  'NOT',
  'IN',
  'EXISTS',
  'BETWEEN',
  'LIKE',
  'ILIKE',
  'GROUP BY',
  'HAVING',
  'ORDER BY',
  'LIMIT',
  'OFFSET',
  'DISTINCT',
  'UNION',
  'UNION ALL',
  'INTERSECT',
  'EXCEPT',
  'WITH',
  'AS',
  'INSERT INTO',
  'UPDATE',
  'DELETE FROM',
  'VALUES',
  'SET',
  'CASE',
  'WHEN',
  'THEN',
  'ELSE',
  'END',
  'CAST',
  'AS',
  'COUNT',
  'SUM',
  'AVG',
  'MIN',
  'MAX',
  'ROUND',
  'COALESCE',
  'NOW',
  'INTERVAL',
  'EXTRACT',
  'DATE_TRUNC',
  'TO_TIMESTAMP',
  'ASC',
  'DESC',
  'NULLS FIRST',
  'NULLS LAST',
];

// Common Hedera-specific SQL patterns
const HEDERA_PATTERNS = {
  timestamp_conversion: {
    pattern: 'to_timestamp(consensus_timestamp / 1000000000)',
    description: 'Convert Hedera nanosecond timestamp to PostgreSQL timestamp',
  },
  hbar_conversion: {
    pattern: 'balance / 100000000.0',
    description: 'Convert tinybars to HBAR (1 HBAR = 100,000,000 tinybars)',
  },
  recent_time_filter: {
    pattern: "consensus_timestamp > extract(epoch from NOW() - INTERVAL '24 hours') * 1000000000",
    description: 'Filter for recent transactions (last 24 hours)',
  },
  success_filter: {
    pattern: 'result = 22',
    description: 'Filter for successful transactions (22 = SUCCESS)',
  },
  token_balance_join: {
    pattern: 'JOIN token_balance tb ON account.id = tb.account_id',
    description: 'Join account with token balances',
  },
  transaction_transfer_join: {
    pattern: 'JOIN crypto_transfer ct ON transaction.consensus_timestamp = ct.consensus_timestamp',
    description: 'Join transaction with crypto transfers',
  },
};

/**
 * Load database schema from file
 */
function loadDatabaseSchema(): DatabaseSchema | null {
  const schemaPath = join(process.cwd(), 'src/schema/database-schema.json');
  if (existsSync(schemaPath)) {
    try {
      const schemaData = readFileSync(schemaPath, 'utf-8');
      return JSON.parse(schemaData);
    } catch (error) {
      console.error('Failed to load database schema:', error);
      return null;
    }
  }
  return null;
}

/**
 * Get table suggestions based on partial input
 */
export function getTableSuggestions(
  partial: string,
  schema: DatabaseSchema | null,
): AutoCompleteSuggestion[] {
  if (!schema) return [];

  const suggestions: AutoCompleteSuggestion[] = [];
  const lowerPartial = partial.toLowerCase();

  for (const [tableName, tableInfo] of Object.entries(schema.tables)) {
    if (tableName.toLowerCase().includes(lowerPartial)) {
      suggestions.push({
        text: tableName,
        type: 'table',
        description: tableInfo.description,
        insertText: tableName,
        detail: `Table with ${Object.keys(tableInfo.columns).length} columns`,
      });
    }
  }

  return suggestions;
}

/**
 * Get column suggestions for a specific table
 */
export function getColumnSuggestions(
  tableName: string,
  partial: string,
  schema: DatabaseSchema | null,
): AutoCompleteSuggestion[] {
  if (!schema || !schema.tables[tableName]) return [];

  const suggestions: AutoCompleteSuggestion[] = [];
  const lowerPartial = partial.toLowerCase();
  const tableInfo = schema.tables[tableName];

  // Add key fields first
  if (tableInfo.keyFields) {
    for (const field of tableInfo.keyFields) {
      if (field.toLowerCase().includes(lowerPartial)) {
        const columnInfo = tableInfo.columns[field];
        suggestions.push({
          text: field,
          type: 'column',
          description: `Key field - ${columnInfo?.data_type || 'unknown'}`,
          insertText: field,
          detail: '🔑 Key field',
        });
      }
    }
  }

  // Add other columns
  for (const [columnName, columnInfo] of Object.entries(tableInfo.columns)) {
    if (
      columnName.toLowerCase().includes(lowerPartial) &&
      !tableInfo.keyFields?.includes(columnName)
    ) {
      let description = columnInfo.data_type;
      if (columnInfo.enum_values && columnInfo.enum_values.length > 0) {
        description += ` (enum: ${columnInfo.enum_values.slice(0, 3).join(', ')}${columnInfo.enum_values.length > 3 ? '...' : ''})`;
      }
      suggestions.push({
        text: columnName,
        type: 'column',
        description,
        insertText: columnName,
      });
    }
  }

  return suggestions;
}

/**
 * Get enum value suggestions for a column
 */
export function getEnumValueSuggestions(
  tableName: string,
  columnName: string,
  partial: string,
  schema: DatabaseSchema | null,
): AutoCompleteSuggestion[] {
  if (!schema || !schema.tables[tableName]) return [];

  const suggestions: AutoCompleteSuggestion[] = [];
  const column = schema.tables[tableName].columns[columnName];

  if (column?.enum_values) {
    const lowerPartial = partial.toLowerCase().replace(/^['"]/, '');

    for (const value of column.enum_values) {
      if (value.toLowerCase().includes(lowerPartial)) {
        suggestions.push({
          text: value,
          type: 'enum',
          description: `${columnName} value`,
          insertText: `'${value}'`,
          detail: column.udt_name || 'Enum value',
        });
      }
    }
  }

  return suggestions;
}

/**
 * Get SQL keyword suggestions
 */
export function getKeywordSuggestions(partial: string): AutoCompleteSuggestion[] {
  const suggestions: AutoCompleteSuggestion[] = [];
  const upperPartial = partial.toUpperCase();

  for (const keyword of SQL_KEYWORDS) {
    if (keyword.startsWith(upperPartial)) {
      suggestions.push({
        text: keyword,
        type: 'keyword',
        description: 'SQL keyword',
        insertText: keyword + ' ',
      });
    }
  }

  return suggestions;
}

/**
 * Get Hedera-specific pattern suggestions
 */
export function getPatternSuggestions(context: string): AutoCompleteSuggestion[] {
  const suggestions: AutoCompleteSuggestion[] = [];
  const lowerContext = context.toLowerCase();

  for (const [name, pattern] of Object.entries(HEDERA_PATTERNS)) {
    // Suggest patterns based on context
    if (
      (name.includes('timestamp') && lowerContext.includes('time')) ||
      (name.includes('hbar') && lowerContext.includes('balance')) ||
      (name.includes('filter') && lowerContext.includes('where')) ||
      (name.includes('join') && lowerContext.includes('join'))
    ) {
      suggestions.push({
        text: name.replace(/_/g, ' '),
        type: 'template',
        description: pattern.description,
        insertText: pattern.pattern,
        detail: 'Hedera pattern',
      });
    }
  }

  return suggestions;
}

/**
 * Get smart query suggestions based on context
 */
export function getQuerySuggestions(
  query: string,
  cursorPosition: number,
): AutoCompleteSuggestion[] {
  const schema = loadDatabaseSchema();
  const suggestions: AutoCompleteSuggestion[] = [];

  // Get the current word being typed
  const beforeCursor = query.substring(0, cursorPosition);
  const words = beforeCursor.split(/\s+/);
  const currentWord = words[words.length - 1] || '';
  const previousWord = words[words.length - 2] || '';

  // Determine context
  const upperQuery = query.toUpperCase();
  const inFromClause = upperQuery.lastIndexOf('FROM') > upperQuery.lastIndexOf('WHERE');
  const inWhereClause =
    upperQuery.includes('WHERE') &&
    upperQuery.lastIndexOf('WHERE') > upperQuery.lastIndexOf('FROM');
  const inSelectClause =
    upperQuery.lastIndexOf('SELECT') >
    Math.max(upperQuery.lastIndexOf('FROM'), upperQuery.lastIndexOf('WHERE'));

  // Context-aware suggestions
  if (previousWord.toUpperCase() === 'FROM' || previousWord.toUpperCase() === 'JOIN') {
    // Suggest tables
    suggestions.push(...getTableSuggestions(currentWord, schema));
  } else if (previousWord.includes('.')) {
    // Table.column pattern - suggest columns for the table
    const tableName = previousWord.split('.')[0];
    suggestions.push(...getColumnSuggestions(tableName, currentWord, schema));
  } else if (inSelectClause && schema) {
    // In SELECT clause - suggest columns from mentioned tables
    const tablesInQuery = extractTablesFromQuery(query, schema);
    for (const table of tablesInQuery) {
      const columnSuggestions = getColumnSuggestions(table, currentWord, schema);
      suggestions.push(
        ...columnSuggestions.map((s) => ({
          ...s,
          text: `${table}.${s.text}`,
          insertText: `${table}.${s.insertText}`,
        })),
      );
    }
  } else if (inWhereClause) {
    // In WHERE clause - suggest columns and patterns
    suggestions.push(...getPatternSuggestions(beforeCursor));

    if (schema) {
      const tablesInQuery = extractTablesFromQuery(query, schema);
      for (const table of tablesInQuery) {
        suggestions.push(...getColumnSuggestions(table, currentWord, schema));
      }
    }
  } else {
    // General context - suggest keywords
    suggestions.push(...getKeywordSuggestions(currentWord));
  }

  // Always add relevant patterns
  if (currentWord.length > 2) {
    suggestions.push(...getPatternSuggestions(beforeCursor));
  }

  // Sort suggestions by relevance
  return suggestions
    .sort((a, b) => {
      // Prioritize exact prefix matches
      const aStarts = a.text.toLowerCase().startsWith(currentWord.toLowerCase());
      const bStarts = b.text.toLowerCase().startsWith(currentWord.toLowerCase());
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;

      // Then by type (templates > enums > columns > tables > keywords)
      const typeOrder = { template: 0, enum: 1, column: 2, table: 3, keyword: 4, function: 5 };
      return typeOrder[a.type] - typeOrder[b.type];
    })
    .slice(0, 20); // Limit to 20 suggestions
}

/**
 * Extract table names from a SQL query
 */
function extractTablesFromQuery(query: string, schema: DatabaseSchema): string[] {
  const tables: string[] = [];
  const upperQuery = query.toUpperCase();

  // Look for table names after FROM and JOIN keywords
  const patterns = [/FROM\s+(\w+)/gi, /JOIN\s+(\w+)/gi];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(query)) !== null) {
      const tableName = match[1];
      if (schema.tables[tableName] || schema.tables[`ecosystem.${tableName}`]) {
        tables.push(tableName);
      }
    }
  }

  return [...new Set(tables)]; // Remove duplicates
}

/**
 * Generate query completion based on partial input
 */
export function generateQueryCompletion(
  partial: string,
  targetType?: 'account' | 'token' | 'transaction' | 'nft' | 'contract',
): string {
  const baseQueries: Record<string, string> = {
    account: `SELECT 
  a.account_id,
  a.balance / 100000000.0 as balance_hbar,
  a.created_timestamp,
  COUNT(DISTINCT tb.token_id) as token_count
FROM account a
LEFT JOIN token_balance tb ON a.id = tb.account_id
WHERE `,

    token: `SELECT 
  t.token_id,
  t.name,
  t.symbol,
  t.total_supply,
  t.decimals,
  COUNT(DISTINCT tb.account_id) as holder_count
FROM token t
LEFT JOIN token_balance tb ON t.token_id = tb.token_id
WHERE `,

    transaction: `SELECT 
  t.transaction_id,
  t.consensus_timestamp,
  t.type,
  t.result,
  t.payer_account_id,
  t.charged_tx_fee
FROM transaction t
WHERE t.consensus_timestamp > extract(epoch from NOW() - INTERVAL '24 hours') * 1000000000
  AND `,

    nft: `SELECT 
  n.token_id,
  n.serial_number,
  n.account_id,
  n.created_timestamp,
  t.name as collection_name
FROM nft n
JOIN token t ON n.token_id = t.token_id
WHERE `,

    contract: `SELECT 
  cr.contract_id,
  cr.consensus_timestamp,
  cr.gas_used,
  cr.function_result,
  c.evm_address
FROM contract_result cr
JOIN contract c ON cr.contract_id = c.contract_id
WHERE `,
  };

  // Try to detect the target type from the partial query
  const lowerPartial = partial.toLowerCase();
  let detectedType = targetType;

  if (!detectedType) {
    if (lowerPartial.includes('account')) detectedType = 'account';
    else if (lowerPartial.includes('token')) detectedType = 'token';
    else if (lowerPartial.includes('transaction')) detectedType = 'transaction';
    else if (lowerPartial.includes('nft')) detectedType = 'nft';
    else if (lowerPartial.includes('contract')) detectedType = 'contract';
  }

  if (detectedType && baseQueries[detectedType]) {
    return baseQueries[detectedType];
  }

  // Default generic query
  return `SELECT * FROM `;
}

/**
 * Validate table and column names against schema
 */
export function validateQueryElements(
  query: string,
  schema: DatabaseSchema | null,
): { valid: boolean; errors: string[] } {
  if (!schema) {
    return { valid: true, errors: [] }; // Can't validate without schema
  }

  const errors: string[] = [];

  // Extract potential table names
  const tablePattern = /(?:FROM|JOIN)\s+([a-zA-Z_][\w.]*)/gi;
  let match;
  const referencedTables: string[] = [];

  while ((match = tablePattern.exec(query)) !== null) {
    const tableName = match[1];
    if (!schema.tables[tableName] && !tableName.includes('(')) {
      errors.push(`Unknown table: ${tableName}`);
    } else {
      referencedTables.push(tableName);
    }
  }

  // Extract and validate column references
  const columnPattern = /([a-zA-Z_][\w]*)\s*\.?\s*([a-zA-Z_][\w]*)/g;
  while ((match = columnPattern.exec(query)) !== null) {
    const [full, first, second] = match;

    // Check if it's a table.column reference
    if (schema.tables[first] && second) {
      if (!schema.tables[first].columns[second]) {
        errors.push(`Unknown column: ${first}.${second}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
