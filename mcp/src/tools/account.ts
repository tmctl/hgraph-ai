import axios from 'axios';
import { z } from 'zod';

const HGRAPH_API_BASE =
  process.env.HGRAPH_REST_URL ||
  'https://mainnet.hedera.api.hgraph.io/v1/pk_prod_ab2c41b848c0b568e96a31ef0ca2f2fbaa549470/api/v1';

const AccountInfoSchema = z.object({
  account: z.string(),
  alias: z.string().optional(),
  auto_renew_period: z.number().optional(),
  balance: z.object({
    balance: z.number(),
    timestamp: z.string(),
    tokens: z
      .array(
        z.object({
          token_id: z.string(),
          balance: z.number(),
        }),
      )
      .optional(),
  }),
  created_timestamp: z.string(),
  decline_reward: z.boolean().optional(),
  deleted: z.boolean(),
  ethereum_nonce: z.number().optional(),
  evm_address: z.string().optional(),
  expiry_timestamp: z.string().optional(),
  key: z
    .object({
      _type: z.string(),
      key: z.string(),
    })
    .optional(),
  max_automatic_token_associations: z.number().optional(),
  memo: z.string(),
  pending_reward: z.number().optional(),
  receiver_sig_required: z.boolean().optional(),
  staked_account_id: z.string().optional(),
  staked_node_id: z.number().optional(),
  stake_period_start: z.string().optional(),
});

export async function getAccountInfo(accountId: string) {
  try {
    if (!accountId || !accountId.match(/^\d+\.\d+\.\d+$/)) {
      throw new Error('Invalid account ID format. Expected format: 0.0.123456');
    }

    const response = await axios.get(`${HGRAPH_API_BASE}/accounts/${accountId}`, {
      timeout: 10000,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Hgraph-MCP-Server/1.0',
      },
    });

    const accountData = AccountInfoSchema.parse(response.data);

    const formattedBalance = (accountData.balance.balance / 100000000).toFixed(8);
    const createdDate = new Date(parseFloat(accountData.created_timestamp) * 1000).toISOString();

    let result = `# Account Information for ${accountId}\n\n`;
    result += `**Account ID:** ${accountData.account}\n`;
    result += `**HBAR Balance:** ${formattedBalance} ℏ\n`;
    result += `**Created:** ${createdDate}\n`;
    result += `**Deleted:** ${accountData.deleted ? 'Yes' : 'No'}\n`;

    if (accountData.alias) {
      result += `**Alias:** ${accountData.alias}\n`;
    }

    if (accountData.evm_address) {
      result += `**EVM Address:** ${accountData.evm_address}\n`;
    }

    if (accountData.memo) {
      result += `**Memo:** ${accountData.memo}\n`;
    }

    if (accountData.key) {
      result += `**Public Key Type:** ${accountData.key._type}\n`;
      result += `**Public Key:** ${accountData.key.key.substring(0, 20)}...\n`;
    }

    if (accountData.staked_node_id !== undefined) {
      result += `**Staked to Node:** ${accountData.staked_node_id}\n`;
    }

    if (accountData.staked_account_id) {
      result += `**Staked to Account:** ${accountData.staked_account_id}\n`;
    }

    if (accountData.pending_reward) {
      const pendingReward = (accountData.pending_reward / 100000000).toFixed(8);
      result += `**Pending Reward:** ${pendingReward} ℏ\n`;
    }

    if (accountData.balance.tokens && accountData.balance.tokens.length > 0) {
      result += `\n## Token Holdings\n`;
      accountData.balance.tokens.forEach((token) => {
        result += `- **${token.token_id}:** ${token.balance}\n`;
      });
    }

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
        throw new Error(`Account ${accountId} not found`);
      }
      throw new Error(
        `API request failed: ${error.response?.status} ${error.response?.statusText}`,
      );
    }
    throw error;
  }
}
