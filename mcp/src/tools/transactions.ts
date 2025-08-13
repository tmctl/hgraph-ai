import axios from 'axios';
import { z } from 'zod';

const HGRAPH_API_BASE =
  process.env.HGRAPH_REST_URL ||
  'https://mainnet.hedera.api.hgraph.io/v1/pk_prod_ab2c41b848c0b568e96a31ef0ca2f2fbaa549470/api/v1';

const TransactionSchema = z.object({
  bytes: z.string().optional(),
  charged_tx_fee: z.number(),
  consensus_timestamp: z.string(),
  entity_id: z.string().optional(),
  max_fee: z.string(),
  memo_base64: z.string().optional(),
  name: z.string(),
  nft_transfers: z.array(z.any()).optional(),
  node: z.string(),
  nonce: z.number(),
  parent_consensus_timestamp: z.string().optional(),
  result: z.string(),
  scheduled: z.boolean(),
  staking_reward_transfers: z.array(z.any()).optional(),
  token_transfers: z
    .array(
      z.object({
        token_id: z.string(),
        account: z.string(),
        amount: z.number(),
        is_approval: z.boolean().optional(),
      }),
    )
    .optional(),
  transaction_hash: z.string(),
  transaction_id: z.string(),
  transfers: z.array(
    z.object({
      account: z.string(),
      amount: z.number(),
      is_approval: z.boolean().optional(),
    }),
  ),
  valid_duration_seconds: z.string(),
  valid_start_timestamp: z.string(),
});

const TransactionListSchema = z.object({
  transactions: z.array(TransactionSchema),
  links: z
    .object({
      next: z.string().optional(),
    })
    .optional(),
});

export async function getTransactionHistory(
  accountId: string,
  limit: number = 10,
  order: 'asc' | 'desc' = 'desc',
) {
  try {
    if (!accountId || !accountId.match(/^\d+\.\d+\.\d+$/)) {
      throw new Error('Invalid account ID format. Expected format: 0.0.123456');
    }

    if (limit < 1 || limit > 100) {
      throw new Error('Limit must be between 1 and 100');
    }

    const response = await axios.get(`${HGRAPH_API_BASE}/transactions`, {
      params: {
        'account.id': accountId,
        limit: limit.toString(),
        order: order,
      },
      timeout: 15000,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Hgraph-MCP-Server/1.0',
      },
    });

    const transactionData = TransactionListSchema.parse(response.data);

    if (!transactionData.transactions || transactionData.transactions.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `No transactions found for account ${accountId}`,
          },
        ],
      };
    }

    let result = `# Transaction History for ${accountId}\n\n`;
    result += `**Total transactions returned:** ${transactionData.transactions.length}\n\n`;

    transactionData.transactions.forEach((tx, index) => {
      const timestamp = new Date(parseFloat(tx.consensus_timestamp) * 1000).toISOString();
      const fee = (tx.charged_tx_fee / 100000000).toFixed(8);

      result += `## Transaction ${index + 1}\n`;
      result += `**Hash:** ${tx.transaction_hash}\n`;
      result += `**ID:** ${tx.transaction_id}\n`;
      result += `**Type:** ${tx.name}\n`;
      result += `**Result:** ${tx.result}\n`;
      result += `**Timestamp:** ${timestamp}\n`;
      result += `**Fee:** ${fee} ℏ\n`;
      result += `**Node:** ${tx.node}\n`;

      if (tx.memo_base64) {
        try {
          const memo = Buffer.from(tx.memo_base64, 'base64').toString('utf-8');
          if (memo.trim()) {
            result += `**Memo:** ${memo}\n`;
          }
        } catch (e) {
          result += `**Memo (base64):** ${tx.memo_base64}\n`;
        }
      }

      if (tx.transfers && tx.transfers.length > 0) {
        result += `**HBAR Transfers:**\n`;
        tx.transfers.forEach((transfer) => {
          const amount = (transfer.amount / 100000000).toFixed(8);
          const sign = transfer.amount > 0 ? '+' : '';
          result += `  - ${transfer.account}: ${sign}${amount} ℏ\n`;
        });
      }

      if (tx.token_transfers && tx.token_transfers.length > 0) {
        result += `**Token Transfers:**\n`;
        tx.token_transfers.forEach((transfer) => {
          const sign = transfer.amount > 0 ? '+' : '';
          result += `  - ${transfer.account}: ${sign}${transfer.amount} (${transfer.token_id})\n`;
        });
      }

      if (tx.nft_transfers && tx.nft_transfers.length > 0) {
        result += `**NFT Transfers:** ${tx.nft_transfers.length} NFT(s) transferred\n`;
      }

      if (tx.staking_reward_transfers && tx.staking_reward_transfers.length > 0) {
        result += `**Staking Rewards:** Yes\n`;
      }

      result += '\n---\n\n';
    });

    return {
      content: [
        {
          type: 'text',
          text: result,
        },
      ],
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 404) {
        throw new Error(`No transactions found for account ${accountId}`);
      }
      throw new Error(
        `API request failed: ${error.response?.status} ${error.response?.statusText}`,
      );
    }
    throw error;
  }
}
