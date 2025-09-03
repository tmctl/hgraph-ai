/**
 * Query Templates for Common Hedera Operations
 *
 * Pre-built, optimized query templates to help external models
 * craft better Hedera-specific queries
 */

export interface QueryTemplate {
  name: string;
  description: string;
  category: string;
  template: string;
  parameters: {
    name: string;
    type: string;
    description: string;
    example: string | number;
  }[];
  exampleUsage?: string;
  expectedOutput?: string;
}

export const QUERY_TEMPLATES: Record<string, QueryTemplate> = {
  // Account Related Templates
  account_balance: {
    name: 'account_balance',
    description: 'Get current balance and token holdings for a specific account',
    category: 'account',
    template: `
      SELECT 
        a.account_id,
        a.balance as balance_tinybars,
        CAST(a.balance / 100000000.0 AS DECIMAL(20,8)) as balance_hbar,
        a.staked_node_id,
        a.staked_account_id,
        COUNT(DISTINCT tb.token_id) as token_count,
        a.created_timestamp
      FROM account a
      LEFT JOIN token_balance tb ON a.id = tb.account_id AND tb.balance > 0
      WHERE a.account_id = $1
      GROUP BY a.account_id, a.balance, a.staked_node_id, a.staked_account_id, a.created_timestamp
    `,
    parameters: [
      {
        name: 'account_id',
        type: 'string',
        description: 'Hedera account ID in format 0.0.X',
        example: '0.0.123456',
      },
    ],
    exampleUsage: 'Get balance for account 0.0.123456',
    expectedOutput: 'Account balance in both tinybars and HBAR, plus token count',
  },

  account_transactions: {
    name: 'account_transactions',
    description: 'Get recent transactions for an account',
    category: 'account',
    template: `
      SELECT 
        t.transaction_id,
        t.consensus_timestamp,
        t.type,
        t.result,
        t.charged_tx_fee,
        t.max_fee,
        t.memo,
        t.valid_start_timestamp
      FROM transaction t
      WHERE t.payer_account_id = $1
        AND t.consensus_timestamp > NOW() - INTERVAL '$2'
      ORDER BY t.consensus_timestamp DESC
      LIMIT $3
    `,
    parameters: [
      {
        name: 'account_id',
        type: 'string',
        description: 'Hedera account ID',
        example: '0.0.123456',
      },
      {
        name: 'time_range',
        type: 'string',
        description: 'Time range (PostgreSQL interval format)',
        example: '24 hours',
      },
      {
        name: 'limit',
        type: 'number',
        description: 'Maximum number of results',
        example: 100,
      },
    ],
    exampleUsage: 'Show last 100 transactions for account 0.0.123456 in the past 24 hours',
  },

  account_tokens: {
    name: 'account_tokens',
    description: 'List all tokens held by an account with balances',
    category: 'account',
    template: `
      SELECT 
        tb.token_id,
        t.name as token_name,
        t.symbol as token_symbol,
        tb.balance,
        t.decimals,
        t.type as token_type,
        CASE 
          WHEN t.decimals > 0 THEN CAST(tb.balance / POWER(10, t.decimals) AS DECIMAL(20,8))
          ELSE tb.balance
        END as formatted_balance
      FROM token_balance tb
      JOIN token t ON tb.token_id = t.token_id
      JOIN account a ON tb.account_id = a.id
      WHERE a.account_id = $1
        AND tb.balance > 0
      ORDER BY tb.balance DESC
    `,
    parameters: [
      {
        name: 'account_id',
        type: 'string',
        description: 'Hedera account ID',
        example: '0.0.123456',
      },
    ],
    exampleUsage: 'List all tokens owned by account 0.0.123456',
  },

  // Token Related Templates
  token_transfers: {
    name: 'token_transfers',
    description: 'Track token transfers for a specific token',
    category: 'token',
    template: `
      SELECT 
        t.consensus_timestamp,
        t.transaction_id,
        tt.token_id,
        tt.account_id as sender,
        tt.amount,
        t.result,
        t.payer_account_id
      FROM transaction t
      JOIN token_transfer tt ON t.consensus_timestamp = tt.consensus_timestamp
      WHERE tt.token_id = $1
        AND t.consensus_timestamp > NOW() - INTERVAL '$2'
        AND tt.amount != 0
      ORDER BY t.consensus_timestamp DESC
      LIMIT $3
    `,
    parameters: [
      {
        name: 'token_id',
        type: 'string',
        description: 'Hedera token ID',
        example: '0.0.456789',
      },
      {
        name: 'time_range',
        type: 'string',
        description: 'Time range',
        example: '24 hours',
      },
      {
        name: 'limit',
        type: 'number',
        description: 'Maximum results',
        example: 100,
      },
    ],
    exampleUsage: 'Show last 100 transfers of token 0.0.456789 in past 24 hours',
  },

  token_info: {
    name: 'token_info',
    description: 'Get detailed information about a token',
    category: 'token',
    template: `
      SELECT 
        t.token_id,
        t.name,
        t.symbol,
        t.decimals,
        t.total_supply,
        t.initial_supply,
        t.type,
        t.treasury_account_id,
        t.created_timestamp,
        t.freeze_default,
        t.kyc_default,
        COUNT(DISTINCT tb.account_id) as holder_count
      FROM token t
      LEFT JOIN token_balance tb ON t.token_id = tb.token_id AND tb.balance > 0
      WHERE t.token_id = $1
      GROUP BY t.token_id, t.name, t.symbol, t.decimals, t.total_supply, 
               t.initial_supply, t.type, t.treasury_account_id, 
               t.created_timestamp, t.freeze_default, t.kyc_default
    `,
    parameters: [
      {
        name: 'token_id',
        type: 'string',
        description: 'Hedera token ID',
        example: '0.0.456789',
      },
    ],
    exampleUsage: 'Get full details for token 0.0.456789',
  },

  // Transaction Related Templates
  recent_transactions: {
    name: 'recent_transactions',
    description: 'Get the most recent network transactions',
    category: 'transaction',
    template: `
      SELECT 
        t.transaction_id,
        t.consensus_timestamp,
        t.type,
        t.result,
        t.payer_account_id,
        t.charged_tx_fee,
        t.max_fee,
        t.memo
      FROM transaction t
      WHERE t.consensus_timestamp > NOW() - INTERVAL '$1'
      ORDER BY t.consensus_timestamp DESC
      LIMIT $2
    `,
    parameters: [
      {
        name: 'time_range',
        type: 'string',
        description: 'Time range to search',
        example: '1 hour',
      },
      {
        name: 'limit',
        type: 'number',
        description: 'Maximum results',
        example: 50,
      },
    ],
    exampleUsage: 'Show 50 most recent transactions in the last hour',
  },

  failed_transactions: {
    name: 'failed_transactions',
    description: 'Find failed transactions in a time range',
    category: 'transaction',
    template: `
      SELECT 
        t.transaction_id,
        t.consensus_timestamp,
        t.type,
        t.result,
        t.payer_account_id,
        t.charged_tx_fee,
        t.memo,
        t.node_account_id
      FROM transaction t
      WHERE t.result != 'SUCCESS'
        AND t.consensus_timestamp > NOW() - INTERVAL '$1'
      ORDER BY t.consensus_timestamp DESC
      LIMIT $2
    `,
    parameters: [
      {
        name: 'time_range',
        type: 'string',
        description: 'Time range to search',
        example: '6 hours',
      },
      {
        name: 'limit',
        type: 'number',
        description: 'Maximum results',
        example: 100,
      },
    ],
    exampleUsage: 'Find failed transactions in the last 6 hours',
  },

  transaction_by_id: {
    name: 'transaction_by_id',
    description: 'Get full details of a specific transaction',
    category: 'transaction',
    template: `
      SELECT 
        t.*,
        array_agg(
          json_build_object(
            'account_id', tr.account_id,
            'amount', tr.amount
          ) ORDER BY tr.amount DESC
        ) FILTER (WHERE tr.amount IS NOT NULL) as transfers
      FROM transaction t
      LEFT JOIN crypto_transfer tr ON t.consensus_timestamp = tr.consensus_timestamp
      WHERE t.transaction_id = $1
      GROUP BY t.transaction_id, t.consensus_timestamp, t.type, t.result, 
               t.payer_account_id, t.charged_tx_fee, t.max_fee, t.memo,
               t.valid_start_timestamp, t.node_account_id, t.scheduled,
               t.nonce, t.parent_consensus_timestamp
    `,
    parameters: [
      {
        name: 'transaction_id',
        type: 'string',
        description: 'Transaction ID',
        example: '0.0.123456@1234567890.123456789',
      },
    ],
    exampleUsage: 'Get full details for transaction 0.0.123456@1234567890.123456789',
  },

  // Network Statistics Templates
  network_stats: {
    name: 'network_stats',
    description: 'Get network statistics for a time period',
    category: 'statistics',
    template: `
      SELECT 
        COUNT(*) as total_transactions,
        COUNT(DISTINCT payer_account_id) as unique_accounts,
        SUM(charged_tx_fee) as total_fees_collected,
        AVG(charged_tx_fee) as avg_transaction_fee,
        COUNT(CASE WHEN result = 'SUCCESS' THEN 1 END) as successful_transactions,
        COUNT(CASE WHEN result != 'SUCCESS' THEN 1 END) as failed_transactions,
        ROUND(100.0 * COUNT(CASE WHEN result = 'SUCCESS' THEN 1 END) / COUNT(*), 2) as success_rate
      FROM transaction
      WHERE consensus_timestamp > NOW() - INTERVAL '$1'
    `,
    parameters: [
      {
        name: 'time_range',
        type: 'string',
        description: 'Time period for statistics',
        example: '1 day',
      },
    ],
    exampleUsage: 'Get network statistics for the past day',
  },

  top_accounts_by_transactions: {
    name: 'top_accounts_by_transactions',
    description: 'Find most active accounts by transaction count',
    category: 'statistics',
    template: `
      SELECT 
        payer_account_id,
        COUNT(*) as transaction_count,
        SUM(charged_tx_fee) as total_fees_paid,
        AVG(charged_tx_fee) as avg_fee,
        COUNT(DISTINCT type) as unique_transaction_types
      FROM transaction
      WHERE consensus_timestamp > NOW() - INTERVAL '$1'
      GROUP BY payer_account_id
      ORDER BY transaction_count DESC
      LIMIT $2
    `,
    parameters: [
      {
        name: 'time_range',
        type: 'string',
        description: 'Time period to analyze',
        example: '7 days',
      },
      {
        name: 'limit',
        type: 'number',
        description: 'Number of top accounts',
        example: 20,
      },
    ],
    exampleUsage: 'Show top 20 most active accounts in the past week',
  },

  // Contract Related Templates
  contract_calls: {
    name: 'contract_calls',
    description: 'Get contract calls for a specific contract',
    category: 'contract',
    template: `
      SELECT 
        cl.consensus_timestamp,
        cl.transaction_hash,
        cl.function_parameters,
        cl.gas_limit,
        cl.gas_used,
        cl.call_result,
        t.payer_account_id,
        t.result as transaction_result
      FROM contract_log cl
      JOIN transaction t ON cl.consensus_timestamp = t.consensus_timestamp
      WHERE cl.contract_id = $1
        AND cl.consensus_timestamp > NOW() - INTERVAL '$2'
      ORDER BY cl.consensus_timestamp DESC
      LIMIT $3
    `,
    parameters: [
      {
        name: 'contract_id',
        type: 'string',
        description: 'Smart contract ID',
        example: '0.0.789012',
      },
      {
        name: 'time_range',
        type: 'string',
        description: 'Time range',
        example: '24 hours',
      },
      {
        name: 'limit',
        type: 'number',
        description: 'Maximum results',
        example: 50,
      },
    ],
    exampleUsage: 'Show last 50 calls to contract 0.0.789012 in past 24 hours',
  },

  // NFT Related Templates
  nft_transfers: {
    name: 'nft_transfers',
    description: 'Track NFT transfers for a collection',
    category: 'nft',
    template: `
      SELECT 
        nft.consensus_timestamp,
        nft.token_id,
        nft.serial_number,
        nft.sender_account_id,
        nft.receiver_account_id,
        t.transaction_id,
        t.result
      FROM nft_transfer nft
      JOIN transaction t ON nft.consensus_timestamp = t.consensus_timestamp
      WHERE nft.token_id = $1
        AND nft.consensus_timestamp > NOW() - INTERVAL '$2'
      ORDER BY nft.consensus_timestamp DESC
      LIMIT $3
    `,
    parameters: [
      {
        name: 'token_id',
        type: 'string',
        description: 'NFT collection token ID',
        example: '0.0.987654',
      },
      {
        name: 'time_range',
        type: 'string',
        description: 'Time range',
        example: '7 days',
      },
      {
        name: 'limit',
        type: 'number',
        description: 'Maximum results',
        example: 100,
      },
    ],
    exampleUsage: 'Track NFT transfers for collection 0.0.987654 in past week',
  },
};

/**
 * Get all available templates
 */
export function getAllTemplates(): QueryTemplate[] {
  return Object.values(QUERY_TEMPLATES);
}

/**
 * Get templates by category
 */
export function getTemplatesByCategory(category: string): QueryTemplate[] {
  return Object.values(QUERY_TEMPLATES).filter((t) => t.category === category);
}

/**
 * Get a specific template by name
 */
export function getTemplate(name: string): QueryTemplate | undefined {
  return QUERY_TEMPLATES[name];
}

/**
 * Get all available categories
 */
export function getCategories(): string[] {
  const categories = new Set<string>();
  Object.values(QUERY_TEMPLATES).forEach((t) => categories.add(t.category));
  return Array.from(categories);
}

/**
 * Format a template with actual parameter values
 */
export function formatTemplate(templateName: string, params: Record<string, any>): string | null {
  const template = QUERY_TEMPLATES[templateName];
  if (!template) return null;

  let sql = template.template.trim();

  // Replace parameters ($1, $2, etc.) with actual values
  template.parameters.forEach((param, index) => {
    const value = params[param.name];
    if (value !== undefined) {
      // Properly quote string values
      const quotedValue = typeof value === 'string' ? `'${value}'` : value;
      sql = sql.replace(new RegExp(`\\$${index + 1}`, 'g'), quotedValue);
    }
  });

  return sql;
}

/**
 * Generate example SQL for a template
 */
export function generateExampleSQL(templateName: string): string | null {
  const template = QUERY_TEMPLATES[templateName];
  if (!template) return null;

  const exampleParams: Record<string, any> = {};
  template.parameters.forEach((param) => {
    exampleParams[param.name] = param.example;
  });

  return formatTemplate(templateName, exampleParams);
}
