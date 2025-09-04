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

  nft_ownership: {
    name: 'nft_ownership',
    description: 'Get current owner and history of a specific NFT',
    category: 'nft',
    template: `
      SELECT 
        n.token_id,
        n.serial_number,
        n.account_id as current_owner,
        n.created_timestamp,
        n.metadata,
        n.spender,
        a.balance as owner_hbar_balance,
        COUNT(DISTINCT n2.serial_number) as other_nfts_owned
      FROM nft n
      LEFT JOIN account a ON n.account_id = a.account_id
      LEFT JOIN nft n2 ON n.account_id = n2.account_id AND n.token_id = n2.token_id
      WHERE n.token_id = $1 AND n.serial_number = $2
      GROUP BY n.token_id, n.serial_number, n.account_id, n.created_timestamp, 
               n.metadata, n.spender, a.balance
    `,
    parameters: [
      {
        name: 'token_id',
        type: 'string',
        description: 'NFT collection token ID',
        example: '0.0.987654',
      },
      {
        name: 'serial_number',
        type: 'number',
        description: 'NFT serial number',
        example: 1,
      },
    ],
    exampleUsage: 'Get ownership info for NFT 0.0.987654 serial #1',
  },

  // Advanced Account Analytics
  account_activity_analysis: {
    name: 'account_activity_analysis',
    description: 'Comprehensive account activity analysis with trends',
    category: 'account',
    template: `
      WITH daily_stats AS (
        SELECT 
          DATE_TRUNC('day', to_timestamp(consensus_timestamp / 1000000000)) as day,
          COUNT(*) as tx_count,
          SUM(charged_tx_fee) as daily_fees,
          COUNT(DISTINCT type) as unique_tx_types
        FROM transaction
        WHERE payer_account_id = $1
          AND consensus_timestamp > extract(epoch from NOW() - INTERVAL '$2') * 1000000000
        GROUP BY day
      ),
      token_activity AS (
        SELECT 
          COUNT(DISTINCT tt.token_id) as active_tokens,
          SUM(ABS(tt.amount)) as total_token_volume
        FROM token_transfer tt
        JOIN transaction t ON tt.consensus_timestamp = t.consensus_timestamp
        WHERE tt.account_id = $1
          AND t.consensus_timestamp > extract(epoch from NOW() - INTERVAL '$2') * 1000000000
      )
      SELECT 
        a.account_id,
        a.balance as current_balance_tinybars,
        a.balance / 100000000.0 as current_balance_hbar,
        COUNT(DISTINCT tb.token_id) as tokens_held,
        COALESCE(ta.active_tokens, 0) as active_tokens_traded,
        COALESCE(ta.total_token_volume, 0) as token_volume,
        COALESCE(AVG(ds.tx_count), 0) as avg_daily_transactions,
        COALESCE(SUM(ds.tx_count), 0) as total_transactions,
        COALESCE(SUM(ds.daily_fees), 0) as total_fees_paid,
        COALESCE(MAX(ds.unique_tx_types), 0) as max_unique_tx_types_per_day
      FROM account a
      LEFT JOIN token_balance tb ON a.id = tb.account_id AND tb.balance > 0
      LEFT JOIN daily_stats ds ON true
      LEFT JOIN token_activity ta ON true
      WHERE a.account_id = $1
      GROUP BY a.account_id, a.balance, ta.active_tokens, ta.total_token_volume
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
        description: 'Time range for analysis',
        example: '30 days',
      },
    ],
    exampleUsage: 'Analyze account 0.0.123456 activity over 30 days',
  },

  // Cross-entity relationship queries
  account_token_relationships: {
    name: 'account_token_relationships',
    description: 'Find relationships between accounts through shared token holdings',
    category: 'account',
    template: `
      WITH account_tokens AS (
        SELECT token_id 
        FROM token_balance 
        WHERE account_id = (SELECT id FROM account WHERE account_id = $1)
          AND balance > 0
      )
      SELECT 
        a.account_id,
        COUNT(DISTINCT tb.token_id) as shared_tokens,
        array_agg(DISTINCT t.symbol ORDER BY t.symbol) as shared_token_symbols,
        SUM(tb.balance) as total_token_balances,
        a.balance / 100000000.0 as account_hbar_balance
      FROM token_balance tb
      JOIN account_tokens at ON tb.token_id = at.token_id
      JOIN account a ON tb.account_id = a.id
      JOIN token t ON tb.token_id = t.token_id
      WHERE a.account_id != $1
        AND tb.balance > 0
      GROUP BY a.account_id, a.balance
      HAVING COUNT(DISTINCT tb.token_id) >= $2
      ORDER BY shared_tokens DESC
      LIMIT $3
    `,
    parameters: [
      {
        name: 'account_id',
        type: 'string',
        description: 'Reference account ID',
        example: '0.0.123456',
      },
      {
        name: 'min_shared_tokens',
        type: 'number',
        description: 'Minimum number of shared tokens',
        example: 2,
      },
      {
        name: 'limit',
        type: 'number',
        description: 'Maximum results',
        example: 20,
      },
    ],
    exampleUsage: 'Find accounts sharing at least 2 tokens with 0.0.123456',
  },

  // Token liquidity and distribution
  token_distribution_analysis: {
    name: 'token_distribution_analysis',
    description: 'Analyze token distribution and concentration metrics',
    category: 'token',
    template: `
      WITH token_stats AS (
        SELECT 
          tb.token_id,
          COUNT(DISTINCT tb.account_id) as holder_count,
          SUM(tb.balance) as total_distributed,
          MAX(tb.balance) as largest_holding,
          MIN(tb.balance) FILTER (WHERE tb.balance > 0) as smallest_holding,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY tb.balance) as median_holding
        FROM token_balance tb
        WHERE tb.token_id = $1
          AND tb.balance > 0
        GROUP BY tb.token_id
      ),
      top_holders AS (
        SELECT 
          tb.account_id,
          tb.balance,
          ROUND(100.0 * tb.balance / ts.total_distributed, 4) as percentage_held
        FROM token_balance tb
        JOIN token_stats ts ON tb.token_id = ts.token_id
        WHERE tb.token_id = $1
          AND tb.balance > 0
        ORDER BY tb.balance DESC
        LIMIT 10
      )
      SELECT 
        t.token_id,
        t.name,
        t.symbol,
        t.total_supply,
        t.decimals,
        ts.holder_count,
        ts.total_distributed,
        ROUND(100.0 * ts.total_distributed / t.total_supply, 2) as distribution_percentage,
        ts.largest_holding,
        ts.smallest_holding,
        ts.median_holding,
        ROUND(100.0 * ts.largest_holding / ts.total_distributed, 4) as largest_holder_percentage,
        json_agg(
          json_build_object(
            'account', th.account_id,
            'balance', th.balance,
            'percentage', th.percentage_held
          ) ORDER BY th.balance DESC
        ) as top_10_holders
      FROM token t
      JOIN token_stats ts ON t.token_id = ts.token_id
      LEFT JOIN top_holders th ON true
      WHERE t.token_id = $1
      GROUP BY t.token_id, t.name, t.symbol, t.total_supply, t.decimals,
               ts.holder_count, ts.total_distributed, ts.largest_holding,
               ts.smallest_holding, ts.median_holding
    `,
    parameters: [
      {
        name: 'token_id',
        type: 'string',
        description: 'Token ID to analyze',
        example: '0.0.456789',
      },
    ],
    exampleUsage: 'Analyze distribution metrics for token 0.0.456789',
  },

  // Transaction pattern detection
  transaction_patterns: {
    name: 'transaction_patterns',
    description: 'Detect transaction patterns and anomalies',
    category: 'transaction',
    template: `
      WITH hourly_patterns AS (
        SELECT 
          EXTRACT(HOUR FROM to_timestamp(consensus_timestamp / 1000000000)) as hour,
          EXTRACT(DOW FROM to_timestamp(consensus_timestamp / 1000000000)) as day_of_week,
          type,
          COUNT(*) as tx_count,
          AVG(charged_tx_fee) as avg_fee
        FROM transaction
        WHERE consensus_timestamp > extract(epoch from NOW() - INTERVAL '$1') * 1000000000
        GROUP BY hour, day_of_week, type
      ),
      peak_hours AS (
        SELECT 
          hour,
          SUM(tx_count) as total_txs,
          RANK() OVER (ORDER BY SUM(tx_count) DESC) as hour_rank
        FROM hourly_patterns
        GROUP BY hour
      )
      SELECT 
        json_build_object(
          'peak_hours', (
            SELECT json_agg(json_build_object('hour', hour, 'transactions', total_txs))
            FROM peak_hours 
            WHERE hour_rank <= 3
          ),
          'transaction_types', (
            SELECT json_agg(json_build_object(
              'type', type,
              'total_count', SUM(tx_count),
              'avg_fee', AVG(avg_fee)
            ))
            FROM hourly_patterns
            GROUP BY type
            ORDER BY SUM(tx_count) DESC
          ),
          'busiest_day', (
            SELECT json_build_object(
              'day', CASE day_of_week 
                WHEN 0 THEN 'Sunday'
                WHEN 1 THEN 'Monday'
                WHEN 2 THEN 'Tuesday'
                WHEN 3 THEN 'Wednesday'
                WHEN 4 THEN 'Thursday'
                WHEN 5 THEN 'Friday'
                WHEN 6 THEN 'Saturday'
              END,
              'transactions', SUM(tx_count)
            )
            FROM hourly_patterns
            GROUP BY day_of_week
            ORDER BY SUM(tx_count) DESC
            LIMIT 1
          )
        ) as patterns
    `,
    parameters: [
      {
        name: 'time_range',
        type: 'string',
        description: 'Time range for pattern analysis',
        example: '7 days',
      },
    ],
    exampleUsage: 'Analyze transaction patterns over the last 7 days',
  },

  // Smart contract gas optimization
  contract_gas_analysis: {
    name: 'contract_gas_analysis',
    description: 'Analyze gas usage patterns for contract optimization',
    category: 'contract',
    template: `
      WITH function_stats AS (
        SELECT 
          cr.contract_id,
          cr.function_parameters,
          COUNT(*) as call_count,
          AVG(cr.gas_used) as avg_gas_used,
          MIN(cr.gas_used) as min_gas_used,
          MAX(cr.gas_used) as max_gas_used,
          STDDEV(cr.gas_used) as gas_stddev,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY cr.gas_used) as median_gas
        FROM contract_result cr
        WHERE cr.contract_id = $1
          AND cr.consensus_timestamp > extract(epoch from NOW() - INTERVAL '$2') * 1000000000
        GROUP BY cr.contract_id, cr.function_parameters
      ),
      error_analysis AS (
        SELECT 
          COUNT(*) FILTER (WHERE error_message IS NOT NULL) as error_count,
          COUNT(*) as total_calls,
          array_agg(DISTINCT error_message) FILTER (WHERE error_message IS NOT NULL) as error_types
        FROM contract_result
        WHERE contract_id = $1
          AND consensus_timestamp > extract(epoch from NOW() - INTERVAL '$2') * 1000000000
      )
      SELECT 
        c.contract_id,
        c.evm_address,
        COUNT(DISTINCT fs.function_parameters) as unique_functions_called,
        SUM(fs.call_count) as total_calls,
        AVG(fs.avg_gas_used) as overall_avg_gas,
        MAX(fs.max_gas_used) as peak_gas_usage,
        ea.error_count,
        ROUND(100.0 * ea.error_count / NULLIF(ea.total_calls, 0), 2) as error_rate_percentage,
        ea.error_types,
        json_agg(
          json_build_object(
            'function', encode(fs.function_parameters, 'hex'),
            'calls', fs.call_count,
            'avg_gas', fs.avg_gas_used,
            'median_gas', fs.median_gas,
            'gas_variance', fs.gas_stddev
          ) ORDER BY fs.call_count DESC
        ) as function_metrics
      FROM contract c
      JOIN function_stats fs ON c.contract_id = fs.contract_id
      CROSS JOIN error_analysis ea
      WHERE c.contract_id = $1
      GROUP BY c.contract_id, c.evm_address, ea.error_count, ea.total_calls, ea.error_types
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
        description: 'Time range for analysis',
        example: '30 days',
      },
    ],
    exampleUsage: 'Analyze gas usage for contract 0.0.789012 over 30 days',
  },

  // Topic message analytics
  topic_message_analytics: {
    name: 'topic_message_analytics',
    description: 'Analyze HCS topic message patterns and throughput',
    category: 'statistics',
    template: `
      WITH message_stats AS (
        SELECT 
          tm.topic_id,
          DATE_TRUNC('hour', to_timestamp(tm.consensus_timestamp / 1000000000)) as hour,
          COUNT(*) as message_count,
          AVG(LENGTH(tm.message)) as avg_message_size,
          MAX(LENGTH(tm.message)) as max_message_size,
          COUNT(DISTINCT tm.payer_account_id) as unique_submitters
        FROM topic_message tm
        WHERE tm.topic_id = $1
          AND tm.consensus_timestamp > extract(epoch from NOW() - INTERVAL '$2') * 1000000000
        GROUP BY tm.topic_id, hour
      ),
      throughput AS (
        SELECT 
          MAX(message_count) as peak_hourly_messages,
          AVG(message_count) as avg_hourly_messages,
          SUM(message_count) as total_messages,
          AVG(avg_message_size) as overall_avg_size
        FROM message_stats
      )
      SELECT 
        t.topic_id,
        t.memo,
        t.created_timestamp,
        tp.total_messages,
        tp.peak_hourly_messages,
        ROUND(tp.avg_hourly_messages, 2) as avg_hourly_messages,
        ROUND(tp.overall_avg_size, 2) as avg_message_size_bytes,
        json_agg(
          json_build_object(
            'hour', ms.hour,
            'messages', ms.message_count,
            'avg_size', ROUND(ms.avg_message_size, 2),
            'submitters', ms.unique_submitters
          ) ORDER BY ms.hour DESC
        ) as hourly_breakdown
      FROM topic t
      CROSS JOIN throughput tp
      LEFT JOIN message_stats ms ON t.topic_id = ms.topic_id
      WHERE t.topic_id = $1
      GROUP BY t.topic_id, t.memo, t.created_timestamp,
               tp.total_messages, tp.peak_hourly_messages,
               tp.avg_hourly_messages, tp.overall_avg_size
    `,
    parameters: [
      {
        name: 'topic_id',
        type: 'string',
        description: 'HCS topic ID',
        example: '0.0.123456',
      },
      {
        name: 'time_range',
        type: 'string',
        description: 'Time range for analysis',
        example: '24 hours',
      },
    ],
    exampleUsage: 'Analyze message patterns for topic 0.0.123456 over 24 hours',
  },

  // Network-wide token velocity
  token_velocity: {
    name: 'token_velocity',
    description: 'Calculate token velocity and circulation metrics',
    category: 'token',
    template: `
      WITH transfer_volume AS (
        SELECT 
          tt.token_id,
          DATE_TRUNC('day', to_timestamp(t.consensus_timestamp / 1000000000)) as day,
          SUM(ABS(tt.amount)) / 2 as daily_volume,
          COUNT(DISTINCT tt.account_id) as unique_accounts
        FROM token_transfer tt
        JOIN transaction t ON tt.consensus_timestamp = t.consensus_timestamp
        WHERE tt.token_id = $1
          AND t.consensus_timestamp > extract(epoch from NOW() - INTERVAL '$2') * 1000000000
          AND t.result = 22
        GROUP BY tt.token_id, day
      ),
      circulating_supply AS (
        SELECT 
          token_id,
          SUM(balance) as total_circulating
        FROM token_balance
        WHERE token_id = $1
          AND balance > 0
        GROUP BY token_id
      )
      SELECT 
        tk.token_id,
        tk.name,
        tk.symbol,
        tk.decimals,
        cs.total_circulating,
        COUNT(DISTINCT tv.day) as active_days,
        SUM(tv.daily_volume) as total_volume,
        AVG(tv.daily_volume) as avg_daily_volume,
        MAX(tv.daily_volume) as peak_daily_volume,
        AVG(tv.unique_accounts) as avg_daily_active_accounts,
        CASE 
          WHEN cs.total_circulating > 0 AND COUNT(DISTINCT tv.day) > 0
          THEN ROUND((SUM(tv.daily_volume) / COUNT(DISTINCT tv.day)) / cs.total_circulating, 4)
          ELSE 0
        END as daily_velocity,
        json_agg(
          json_build_object(
            'date', tv.day,
            'volume', tv.daily_volume,
            'active_accounts', tv.unique_accounts
          ) ORDER BY tv.day DESC
        ) as daily_metrics
      FROM token tk
      JOIN circulating_supply cs ON tk.token_id = cs.token_id
      LEFT JOIN transfer_volume tv ON tk.token_id = tv.token_id
      WHERE tk.token_id = $1
      GROUP BY tk.token_id, tk.name, tk.symbol, tk.decimals, cs.total_circulating
    `,
    parameters: [
      {
        name: 'token_id',
        type: 'string',
        description: 'Token ID to analyze',
        example: '0.0.456789',
      },
      {
        name: 'time_range',
        type: 'string',
        description: 'Time range for velocity calculation',
        example: '30 days',
      },
    ],
    exampleUsage: 'Calculate velocity metrics for token 0.0.456789 over 30 days',
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
