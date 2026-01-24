/**
 * Query Validator for Hedera Database
 *
 * Pre-validates SQL queries against schema before execution
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { format } from 'sql-formatter';

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

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  suggestions: QuerySuggestion[];
  formattedQuery?: string;
}

export interface ValidationError {
  type: 'syntax' | 'schema' | 'permission' | 'semantic';
  message: string;
  line?: number;
  column?: number;
  suggestion?: string;
}

export interface ValidationWarning {
  type: 'performance' | 'deprecated' | 'best-practice';
  message: string;
  suggestion?: string;
}

export interface QuerySuggestion {
  type: 'optimization' | 'alternative' | 'index';
  message: string;
  example?: string;
}

// Operations that modify data or schema - not allowed in read-only context
const FORBIDDEN_OPERATIONS = [
  'DROP',
  'CREATE',
  'ALTER',
  'TRUNCATE',
  'DELETE',
  'INSERT',
  'UPDATE',
  'GRANT',
  'REVOKE',
];

// Deprecated or problematic patterns
const PROBLEMATIC_PATTERNS = [
  {
    pattern: /SELECT\s+\*/i,
    warning: 'Using SELECT * can be inefficient. Consider specifying only needed columns.',
    type: 'performance' as const,
  },
  {
    pattern: /WHERE\s+1\s*=\s*1/i,
    warning: 'WHERE 1=1 is redundant and should be removed.',
    type: 'best-practice' as const,
  },
  {
    pattern: /LIMIT\s+(\d+)/i,
    check: (match: RegExpMatchArray) => parseInt(match[1]) > 10000,
    warning: 'Large LIMIT values may impact performance. Consider pagination.',
    type: 'performance' as const,
  },
  {
    pattern: /NOT\s+IN\s*\([^)]{100,}\)/i,
    warning: 'Large NOT IN clauses can be inefficient. Consider using NOT EXISTS.',
    type: 'performance' as const,
  },
];

// Common Hedera-specific optimizations
const OPTIMIZATION_PATTERNS = [
  {
    detect: /consensus_timestamp\s*[><=]/i,
    missing: /extract\s*\(\s*epoch/i,
    suggestion: 'Use extract(epoch from timestamp) * 1000000000 for timestamp comparisons',
    example: "consensus_timestamp > extract(epoch from NOW() - INTERVAL '1 hour') * 1000000000",
  },
  {
    detect: /balance[^\/]*(?:[^\/]|$)/i,
    context: 'select',
    suggestion: 'Consider converting tinybars to HBAR using: balance / 100000000.0',
    example: 'CAST(balance / 100000000.0 AS DECIMAL(20,8)) as balance_hbar',
  },
  {
    detect: /JOIN\s+token_balance/i,
    missing: /balance\s*>\s*0/i,
    suggestion: 'Filter token_balance for positive balances to improve performance',
    example: 'JOIN token_balance tb ON ... AND tb.balance > 0',
  },
];

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
 * Validate SQL syntax
 */
function validateSyntax(query: string): ValidationError[] {
  const errors: ValidationError[] = [];

  try {
    // Try to format the query - this will catch many syntax errors
    format(query, { language: 'postgresql' });
  } catch (error) {
    errors.push({
      type: 'syntax',
      message: `SQL syntax error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      suggestion: 'Check for missing commas, parentheses, or keywords',
    });
  }

  // Check for forbidden operations (only when used as SQL statements, not column names)
  const upperQuery = query.toUpperCase();
  for (const operation of FORBIDDEN_OPERATIONS) {
    // Check if the operation appears as the start of a statement (after whitespace or semicolon)
    const statementRegex = new RegExp(`(^|;)\\s*${operation}\\b`, 'i');
    if (statementRegex.test(upperQuery)) {
      errors.push({
        type: 'permission',
        message: `Operation ${operation} is not allowed`,
        suggestion: 'Only SELECT queries are permitted in this context',
      });
    }
  }

  // Check for balanced parentheses
  let parenCount = 0;
  for (const char of query) {
    if (char === '(') parenCount++;
    if (char === ')') parenCount--;
    if (parenCount < 0) {
      errors.push({
        type: 'syntax',
        message: 'Unbalanced parentheses - too many closing parentheses',
        suggestion: 'Check that all parentheses are properly paired',
      });
      break;
    }
  }
  if (parenCount > 0) {
    errors.push({
      type: 'syntax',
      message: 'Unbalanced parentheses - missing closing parentheses',
      suggestion: 'Check that all parentheses are properly paired',
    });
  }

  // Check for unclosed quotes
  const singleQuotes = (query.match(/'/g) || []).length;
  const doubleQuotes = (query.match(/"/g) || []).length;
  if (singleQuotes % 2 !== 0) {
    errors.push({
      type: 'syntax',
      message: 'Unclosed single quote',
      suggestion: 'Ensure all string literals are properly quoted',
    });
  }
  if (doubleQuotes % 2 !== 0) {
    errors.push({
      type: 'syntax',
      message: 'Unclosed double quote',
      suggestion: 'Use double quotes for identifiers, single quotes for strings',
    });
  }

  return errors;
}

/**
 * Validate tables and columns against schema
 */
function validateSchema(query: string, schema: DatabaseSchema | null): ValidationError[] {
  if (!schema) return [];

  const errors: ValidationError[] = [];
  const upperQuery = query.toUpperCase();

  // Extract table references
  const tablePattern =
    /(?:FROM|JOIN)\s+([a-zA-Z_][\w.]*?)(?:\s+(?:AS\s+)?([a-zA-Z_]\w*))?\s*(?:ON|WHERE|JOIN|LEFT|RIGHT|INNER|GROUP|ORDER|LIMIT|$)/gi;
  const tableAliases = new Map<string, string>();
  const referencedTables = new Set<string>();

  let match;
  while ((match = tablePattern.exec(query)) !== null) {
    const tableName = match[1];
    const alias = match[2];

    // Skip CTEs and subqueries
    if (tableName.includes('(') || upperQuery.includes(`WITH ${tableName.toUpperCase()}`)) {
      continue;
    }

    if (!schema.tables[tableName] && !schema.tables[`ecosystem.${tableName}`]) {
      errors.push({
        type: 'schema',
        message: `Table '${tableName}' does not exist`,
        suggestion: `Available tables: ${Object.keys(schema.tables).slice(0, 5).join(', ')}...`,
      });
    } else {
      referencedTables.add(tableName);
      if (alias) {
        tableAliases.set(alias, tableName);
      }
    }
  }

  // Validate column references
  const columnPattern = /([a-zA-Z_][\w]*)\s*\.\s*([a-zA-Z_][\w]*)/g;
  while ((match = columnPattern.exec(query)) !== null) {
    const [full, tableRef, columnName] = match;

    // Skip function calls
    if (/\w+\s*\(/.test(query.substring(match.index! + full.length))) {
      continue;
    }

    // Resolve table name from alias if needed
    const actualTable = tableAliases.get(tableRef) || tableRef;

    if (schema.tables[actualTable] || schema.tables[`ecosystem.${actualTable}`]) {
      const table = schema.tables[actualTable] || schema.tables[`ecosystem.${actualTable}`];
      if (!table.columns[columnName]) {
        errors.push({
          type: 'schema',
          message: `Column '${columnName}' does not exist in table '${actualTable}'`,
          suggestion: `Available columns: ${Object.keys(table.columns).slice(0, 5).join(', ')}...`,
        });
      }
    }
  }

  // Validate enum values in WHERE clauses
  const whereValuePattern = /(\w+)\s*=\s*'([^']+)'/g;
  while ((match = whereValuePattern.exec(query)) !== null) {
    const [full, columnName, value] = match;

    // Find which table this column belongs to
    for (const table of referencedTables) {
      const tableSchema = schema.tables[table] || schema.tables[`ecosystem.${table}`];
      if (tableSchema?.columns[columnName]) {
        const column = tableSchema.columns[columnName];

        // Check if this column has enum values
        if (column.enum_values && column.enum_values.length > 0) {
          if (!column.enum_values.includes(value)) {
            errors.push({
              type: 'semantic',
              message: `Invalid enum value '${value}' for column '${columnName}'`,
              suggestion: `Valid values: ${column.enum_values.slice(0, 5).join(', ')}${column.enum_values.length > 5 ? '...' : ''}`,
            });
          }
        }
        break;
      }
    }
  }

  // Check for ambiguous column references in joins
  if (referencedTables.size > 1) {
    const unqualifiedColumnPattern =
      /(?:SELECT|WHERE|ON|GROUP BY|ORDER BY)\s+([a-zA-Z_][\w]*)\s*(?:,|FROM|WHERE|AND|OR|GROUP|ORDER|LIMIT|$)/gi;
    while ((match = unqualifiedColumnPattern.exec(query)) !== null) {
      const columnName = match[1];

      // Skip if it's a keyword or function
      if (SQL_KEYWORDS.includes(columnName.toUpperCase()) || /^\d+$/.test(columnName)) {
        continue;
      }

      // Check if this column exists in multiple tables
      let foundInTables = 0;
      for (const table of referencedTables) {
        const tableSchema = schema.tables[table] || schema.tables[`ecosystem.${table}`];
        if (tableSchema?.columns[columnName]) {
          foundInTables++;
        }
      }

      if (foundInTables > 1) {
        errors.push({
          type: 'semantic',
          message: `Ambiguous column reference '${columnName}'`,
          suggestion: `Qualify with table name or alias (e.g., table.${columnName})`,
        });
      }
    }
  }

  return errors;
}

/**
 * Generate warnings for problematic patterns
 */
function generateWarnings(query: string): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  for (const problem of PROBLEMATIC_PATTERNS) {
    const match = query.match(problem.pattern);
    if (match) {
      if (!problem.check || problem.check(match)) {
        warnings.push({
          type: problem.type,
          message: problem.warning,
          suggestion: problem.warning,
        });
      }
    }
  }

  // Check for missing WHERE clause in large tables
  if (query.match(/FROM\s+(transaction|crypto_transfer|token_transfer|topic_message)/i)) {
    if (!query.match(/WHERE/i)) {
      warnings.push({
        type: 'performance',
        message: 'Query on large table without WHERE clause',
        suggestion: 'Add filters to limit results, e.g., consensus_timestamp or date range',
      });
    }
  }

  // Check for Cartesian products
  const fromMatch = query.match(/FROM\s+([^WHERE]+?)(?:WHERE|$)/is);
  if (fromMatch) {
    const fromClause = fromMatch[1];
    const commaJoins = (fromClause.match(/,/g) || []).length;
    const explicitJoins = (fromClause.match(/JOIN/gi) || []).length;

    if (commaJoins > 0 && !query.match(/WHERE/i)) {
      warnings.push({
        type: 'performance',
        message: 'Potential Cartesian product detected',
        suggestion: 'Use explicit JOIN conditions instead of comma-separated tables',
      });
    }
  }

  return warnings;
}

/**
 * Generate optimization suggestions
 */
function generateSuggestions(query: string, schema: DatabaseSchema | null): QuerySuggestion[] {
  const suggestions: QuerySuggestion[] = [];

  for (const opt of OPTIMIZATION_PATTERNS) {
    if (query.match(opt.detect)) {
      if (!opt.missing || !query.match(opt.missing)) {
        if (!opt.context || query.toLowerCase().includes(opt.context)) {
          suggestions.push({
            type: 'optimization',
            message: opt.suggestion,
            example: opt.example,
          });
        }
      }
    }
  }

  // Suggest indexes for common filter columns
  const whereMatch = query.match(/WHERE\s+(.+?)(?:GROUP|ORDER|LIMIT|$)/is);
  if (whereMatch && schema) {
    const whereClause = whereMatch[1];

    // Check for filters on non-indexed columns
    if (whereClause.match(/consensus_timestamp/i)) {
      suggestions.push({
        type: 'index',
        message: 'Filtering by consensus_timestamp - ensure proper time range',
        example:
          "Use: consensus_timestamp > extract(epoch from NOW() - INTERVAL '1 hour') * 1000000000",
      });
    }

    if (whereClause.match(/account_id|payer_account_id/i)) {
      suggestions.push({
        type: 'index',
        message: 'Account ID filters are optimized for exact matches',
        example: "Use exact account IDs like '0.0.123456' for best performance",
      });
    }
  }

  // Suggest using LIMIT if not present
  if (!query.match(/LIMIT/i)) {
    suggestions.push({
      type: 'optimization',
      message: 'Consider adding LIMIT to restrict result size',
      example: 'LIMIT 100',
    });
  }

  return suggestions;
}

// SQL Keywords for validation
const SQL_KEYWORDS = [
  'SELECT',
  'FROM',
  'WHERE',
  'JOIN',
  'LEFT',
  'RIGHT',
  'INNER',
  'OUTER',
  'ON',
  'AND',
  'OR',
  'NOT',
  'IN',
  'EXISTS',
  'BETWEEN',
  'LIKE',
  'ILIKE',
  'GROUP',
  'BY',
  'HAVING',
  'ORDER',
  'LIMIT',
  'OFFSET',
  'DISTINCT',
  'UNION',
  'ALL',
  'INTERSECT',
  'EXCEPT',
  'WITH',
  'AS',
  'CASE',
  'WHEN',
  'THEN',
  'ELSE',
  'END',
  'CAST',
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
  'ASC',
  'DESC',
  'NULLS',
  'FIRST',
  'LAST',
  'TRUE',
  'FALSE',
  'NULL',
];

/**
 * Main validation function
 */
export function validateQuery(query: string): ValidationResult {
  const schema = loadDatabaseSchema();

  // Perform all validations
  const syntaxErrors = validateSyntax(query);
  const schemaErrors = validateSchema(query, schema);
  const warnings = generateWarnings(query);
  const suggestions = generateSuggestions(query, schema);

  // Try to format the query if valid
  let formattedQuery: string | undefined;
  if (syntaxErrors.length === 0) {
    try {
      formattedQuery = format(query, {
        language: 'postgresql',
        keywordCase: 'upper',
        indentStyle: 'standard',
      });
    } catch {
      // Formatting failed, but syntax might still be valid
    }
  }

  return {
    valid: syntaxErrors.length === 0 && schemaErrors.length === 0,
    errors: [...syntaxErrors, ...schemaErrors],
    warnings,
    suggestions,
    formattedQuery,
  };
}

/**
 * Quick validation for real-time feedback
 */
export function quickValidate(query: string): { valid: boolean; error?: string } {
  // Quick syntax check
  const upperQuery = query.toUpperCase();

  // Check for forbidden operations
  for (const operation of FORBIDDEN_OPERATIONS) {
    if (upperQuery.includes(operation)) {
      return {
        valid: false,
        error: `Operation ${operation} is not permitted`,
      };
    }
  }

  // Basic structure check
  if (!upperQuery.includes('SELECT')) {
    return {
      valid: false,
      error: 'Query must start with SELECT',
    };
  }

  if (!upperQuery.includes('FROM')) {
    return {
      valid: false,
      error: 'Query must include FROM clause',
    };
  }

  return { valid: true };
}

/**
 * Suggest query fixes for common errors
 */
export function suggestFixes(query: string, error: ValidationError): string[] {
  const fixes: string[] = [];

  if (error.type === 'schema' && error.message.includes('does not exist')) {
    // Suggest similar table/column names
    const schema = loadDatabaseSchema();
    if (schema) {
      const errorMatch = error.message.match(/'([^']+)'/);
      if (errorMatch) {
        const wrongName = errorMatch[1];
        const allNames = error.message.includes('Table')
          ? Object.keys(schema.tables)
          : Object.values(schema.tables).flatMap((t) => Object.keys(t.columns));

        // Find similar names (simple string similarity)
        const similar = allNames
          .filter((name) => {
            const similarity = calculateSimilarity(wrongName.toLowerCase(), name.toLowerCase());
            return similarity > 0.6;
          })
          .slice(0, 3);

        if (similar.length > 0) {
          fixes.push(...similar.map((name) => query.replace(wrongName, name)));
        }
      }
    }
  }

  if (error.type === 'syntax' && error.message.includes('parentheses')) {
    // Try to fix unbalanced parentheses
    let fixedQuery = query;
    let openCount = (query.match(/\(/g) || []).length;
    let closeCount = (query.match(/\)/g) || []).length;

    if (openCount > closeCount) {
      fixedQuery += ')'.repeat(openCount - closeCount);
      fixes.push(fixedQuery);
    } else if (closeCount > openCount) {
      fixedQuery = '('.repeat(closeCount - openCount) + fixedQuery;
      fixes.push(fixedQuery);
    }
  }

  return fixes;
}

/**
 * Calculate string similarity (Levenshtein distance based)
 */
function calculateSimilarity(str1: string, str2: string): number {
  const maxLen = Math.max(str1.length, str2.length);
  if (maxLen === 0) return 1;

  const distance = levenshteinDistance(str1, str2);
  return 1 - distance / maxLen;
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1,
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}
