# MCP Server Optimization Guide for External Model Access

## Overview

This guide provides recommendations for improving the MCP server to maximize success rates when external models query Hedera blockchain data.

## Current Architecture Analysis

### Strengths

1. **Simplified Interface**: Single tool (`execute_query`) with natural language input
2. **AI-Powered Translation**: Uses Claude to convert questions to SQL
3. **Schema Awareness**: Maintains cached database schema for query generation
4. **Safety**: Read-only queries with validation to prevent destructive operations
5. **Rich Response Format**: Includes SQL, execution time, natural language summary, and tabular results

### Areas for Improvement

## Recommended Improvements

### 1. Enhanced Schema Documentation

**Problem**: External models lack context about Hedera-specific data structures and relationships.

**Solution**: Add semantic metadata to the schema resource.

```typescript
// Add to resources/index.ts
interface SchemaMetadata {
  tables: {
    [tableName: string]: {
      description: string;
      commonQueries: string[];
      keyFields: string[];
      relationships: string[];
    };
  };
}

const SCHEMA_METADATA: SchemaMetadata = {
  tables: {
    account: {
      description: 'Hedera account information including balances and keys',
      commonQueries: [
        'Find accounts with balance > X HBAR',
        'Get account creation date',
        'List accounts created in last 24 hours',
      ],
      keyFields: ['account_id', 'balance', 'created_timestamp'],
      relationships: ['transactions', 'token_balances', 'contract_deployments'],
    },
    transaction: {
      description: 'All Hedera network transactions',
      commonQueries: [
        'Recent transactions for an account',
        'Transactions by type',
        'Failed transactions in time range',
      ],
      keyFields: ['transaction_id', 'payer_account_id', 'consensus_timestamp', 'result'],
      relationships: ['transfers', 'account', 'contract_actions'],
    },
    // ... more tables
  },
};
```

### 2. Query Templates and Examples

**Problem**: Models struggle with complex Hedera-specific queries.

**Solution**: Provide pre-built query templates.

```typescript
// Add new tool: get_query_templates
export const QUERY_TEMPLATES = {
  account_balance: {
    description: 'Get account balance and token holdings',
    template: `
      SELECT a.account_id, a.balance, 
             COUNT(DISTINCT tb.token_id) as token_count
      FROM account a
      LEFT JOIN token_balance tb ON a.id = tb.account_id
      WHERE a.account_id = $1
      GROUP BY a.account_id, a.balance
    `,
    parameters: ['account_id'],
    example: '0.0.123456',
  },
  token_transfers: {
    description: 'Track token transfers between accounts',
    template: `
      SELECT t.consensus_timestamp, tr.token_id, 
             tr.amount, tr.sender_account_id, tr.receiver_account_id
      FROM transaction t
      JOIN transfer tr ON t.consensus_timestamp = tr.consensus_timestamp
      WHERE tr.token_id = $1
        AND t.consensus_timestamp > NOW() - INTERVAL '$2'
      ORDER BY t.consensus_timestamp DESC
      LIMIT 100
    `,
    parameters: ['token_id', 'time_range'],
    example: ['0.0.456789', '24 hours'],
  },
  // ... more templates
};
```

### 3. Error Recovery and Hints

**Problem**: When queries fail, models don't get actionable feedback.

**Solution**: Enhance error messages with suggestions.

```typescript
// Enhanced error handling in database.ts
function enhanceErrorMessage(error: any, question: string, schema: DatabaseSchema): string {
  const suggestions: string[] = [];

  if (error.code === '42P01') {
    // Table not found
    const tables = Object.keys(schema.tables);
    suggestions.push(`Available tables: ${tables.slice(0, 5).join(', ')}`);
    suggestions.push("Try: 'List all tables' to see the schema");
  }

  if (error.code === '42703') {
    // Column not found
    suggestions.push("Use 'describe table [name]' to see available columns");
    suggestions.push('Common columns: account_id, transaction_id, consensus_timestamp');
  }

  if (error.message.includes('syntax error')) {
    suggestions.push('Try rephrasing your question more simply');
    suggestions.push("Example: 'Show recent transactions for account 0.0.123'");
  }

  return {
    error: error.message,
    suggestions: suggestions,
    availableActions: [
      "View schema with: 'show database schema'",
      "Get examples with: 'show query examples'",
      "List tables with: 'list all tables'",
    ],
  };
}
```

### 4. Query Optimization Hints

**Problem**: Generated queries may be inefficient for large datasets.

**Solution**: Add query optimization layer.

```typescript
// Add query optimizer
function optimizeQuery(sql: string, schema: DatabaseSchema): string {
  let optimized = sql;

  // Add LIMIT if missing
  if (!optimized.toLowerCase().includes('limit')) {
    optimized += ' LIMIT 100';
  }

  // Suggest indexes for common patterns
  if (optimized.includes('consensus_timestamp') && !optimized.includes('INDEX')) {
    // Add index hint comment
    optimized = `-- Consider using timestamp index\n${optimized}`;
  }

  // Convert timestamp comparisons to use indexes
  optimized = optimized.replace(
    /WHERE\s+consensus_timestamp\s*>\s*NOW\(\)\s*-\s*INTERVAL/gi,
    'WHERE consensus_timestamp > (NOW() - INTERVAL',
  );

  return optimized;
}
```

### 5. Context-Aware Query Generation

**Problem**: Models don't understand Hedera-specific concepts.

**Solution**: Add domain knowledge to the query generator.

```typescript
// Enhanced natural language processing
const HEDERA_CONCEPTS = {
  HBAR: {
    description: 'Native Hedera cryptocurrency',
    unit: 'tinybars',
    conversion: '1 HBAR = 100,000,000 tinybars',
    queryHint: 'Balance is stored in tinybars in the database',
  },
  'consensus timestamp': {
    description: 'Transaction finalization time',
    format: 'nanoseconds since epoch',
    queryHint: 'Use consensus_timestamp for transaction ordering',
  },
  account: {
    format: '0.0.X where X is the account number',
    queryHint: "Account IDs are stored as strings like '0.0.123456'",
  },
  token: {
    format: '0.0.X where X is the token ID',
    queryHint: 'Token IDs follow same format as accounts',
  },
};

function enhanceQuestionWithContext(question: string): string {
  let enhanced = question;

  // Add context for common terms
  if (question.toLowerCase().includes('hbar')) {
    enhanced += ' (Note: balances are in tinybars, 1 HBAR = 100,000,000 tinybars)';
  }

  if (question.match(/\d+\.\d+\.\d+/)) {
    enhanced += ' (This appears to be a Hedera entity ID)';
  }

  return enhanced;
}
```

### 6. Caching and Performance

**Problem**: Repeated similar queries waste resources.

**Solution**: Implement intelligent caching.

```typescript
// Query result cache
const QUERY_CACHE = new Map<
  string,
  {
    result: any;
    timestamp: number;
    ttl: number;
  }
>();

function getCachedResult(sql: string): any | null {
  const cached = QUERY_CACHE.get(sql);
  if (cached && Date.now() - cached.timestamp < cached.ttl) {
    return cached.result;
  }
  return null;
}

function cacheResult(sql: string, result: any, ttl: number = 300000) {
  QUERY_CACHE.set(sql, {
    result,
    timestamp: Date.now(),
    ttl,
  });
}
```

### 7. Structured Response Format

**Problem**: Models may struggle with varied response formats.

**Solution**: Standardize response structure.

```typescript
interface StandardizedResponse {
  success: boolean;
  query: {
    natural: string;
    sql: string;
    optimized: boolean;
  };
  result: {
    rowCount: number;
    executionTimeMs: number;
    data: any[];
    summary: string;
  };
  metadata: {
    cached: boolean;
    schema_version: string;
    suggestions?: string[];
  };
  error?: {
    message: string;
    code: string;
    suggestions: string[];
  };
}
```

## Implementation Priority

1. **High Priority** (Immediate impact)
   - Enhanced error messages with suggestions
   - Query templates for common operations
   - Schema documentation with examples

2. **Medium Priority** (Significant improvement)
   - Context-aware query generation
   - Query optimization hints
   - Standardized response format

3. **Low Priority** (Nice to have)
   - Caching layer
   - Performance monitoring
   - Query history tracking

## Usage Examples for External Models

### Effective Query Patterns

```typescript
// Good: Specific and well-structured
'Show the top 10 accounts by balance';
'List transactions from account 0.0.123456 in the last 24 hours';
'What tokens does account 0.0.789012 hold?';

// Better: With context
'Show recent HBAR transfers over 1000 HBAR (100000000000 tinybars)';
"Find failed transactions with result code != 'SUCCESS'";
'Get account balance history with daily snapshots';

// Best: Using templates
'Use template: account_balance for account 0.0.123456';
'Apply token_transfers template for token 0.0.555666';
```

### Error Recovery Patterns

```typescript
// When receiving an error, models should:
1. Check the error suggestions
2. Try a simpler query
3. Request schema information if needed
4. Use query templates as fallback
```

## Testing Recommendations

1. **Create test suite** with common Hedera queries
2. **Benchmark response times** for optimization
3. **Test error cases** to ensure helpful feedback
4. **Validate query safety** with malicious input tests
5. **Load test** with concurrent queries

## Monitoring and Metrics

Track these metrics to measure improvement:

- Query success rate
- Average response time
- Error recovery rate
- Cache hit ratio
- Most common query patterns
- Failed query patterns

## Conclusion

These optimizations will significantly improve the success rate of external models querying Hedera blockchain data by:

- Providing better context and documentation
- Offering fallback options and templates
- Giving actionable error feedback
- Optimizing query performance
- Standardizing response formats

The simplified architecture is already strong; these enhancements build upon that foundation to create a more robust and model-friendly interface.
