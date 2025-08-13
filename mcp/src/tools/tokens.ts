import axios from 'axios';
import { z } from 'zod';

const HGRAPH_API_BASE =
  process.env.HGRAPH_REST_URL ||
  'https://mainnet.hedera.api.hgraph.io/v1/pk_prod_ab2c41b848c0b568e96a31ef0ca2f2fbaa549470/api/v1';

const TokenBalanceSchema = z.object({
  account: z.string(),
  balance: z.number(),
  created_timestamp: z.string(),
  freeze_status: z.string().optional(),
  kyc_status: z.string().optional(),
  token_id: z.string(),
});

const TokenBalanceListSchema = z.object({
  tokens: z.array(TokenBalanceSchema),
  links: z
    .object({
      next: z.string().optional(),
    })
    .optional(),
});

const TokenInfoSchema = z.object({
  admin_key: z
    .object({
      _type: z.string(),
      key: z.string(),
    })
    .optional(),
  auto_renew_account: z.string().optional(),
  auto_renew_period: z.number().optional(),
  created_timestamp: z.string(),
  custom_fees: z.array(z.any()).optional(),
  decimals: z.string(),
  deleted: z.boolean(),
  expiry_timestamp: z.string().optional(),
  fee_schedule_key: z
    .object({
      _type: z.string(),
      key: z.string(),
    })
    .optional(),
  freeze_default: z.boolean(),
  freeze_key: z
    .object({
      _type: z.string(),
      key: z.string(),
    })
    .optional(),
  initial_supply: z.string(),
  kyc_key: z
    .object({
      _type: z.string(),
      key: z.string(),
    })
    .optional(),
  max_supply: z.string(),
  memo: z.string().optional(),
  modified_timestamp: z.string().optional(),
  name: z.string(),
  pause_key: z
    .object({
      _type: z.string(),
      key: z.string(),
    })
    .optional(),
  pause_status: z.string().optional(),
  supply_key: z
    .object({
      _type: z.string(),
      key: z.string(),
    })
    .optional(),
  supply_type: z.string(),
  symbol: z.string(),
  token_id: z.string(),
  total_supply: z.string(),
  treasury_account_id: z.string(),
  type: z.string(),
  wipe_key: z
    .object({
      _type: z.string(),
      key: z.string(),
    })
    .optional(),
});

export async function getTokenBalances(accountId: string, tokenId?: string) {
  try {
    if (!accountId || !accountId.match(/^\d+\.\d+\.\d+$/)) {
      throw new Error('Invalid account ID format. Expected format: 0.0.123456');
    }

    if (tokenId && !tokenId.match(/^\d+\.\d+\.\d+$/)) {
      throw new Error('Invalid token ID format. Expected format: 0.0.123456');
    }

    const params: Record<string, string> = {
      'account.id': accountId,
    };

    if (tokenId) {
      params['token.id'] = tokenId;
    }

    const response = await axios.get(`${HGRAPH_API_BASE}/accounts/${accountId}/tokens`, {
      params,
      timeout: 15000,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Hgraph-MCP-Server/1.0',
      },
    });

    const tokenData = TokenBalanceListSchema.parse(response.data);

    if (!tokenData.tokens || tokenData.tokens.length === 0) {
      const message = tokenId
        ? `No balance found for token ${tokenId} in account ${accountId}`
        : `No token balances found for account ${accountId}`;

      return {
        content: [
          {
            type: 'text',
            text: message,
          },
        ],
      };
    }

    let result = tokenId
      ? `# Token Balance for ${tokenId} in Account ${accountId}\n\n`
      : `# Token Balances for Account ${accountId}\n\n`;

    result += `**Total tokens held:** ${tokenData.tokens.length}\n\n`;

    const tokenInfoPromises = tokenData.tokens.map(async (tokenBalance) => {
      try {
        const tokenInfoResponse = await axios.get(
          `${HGRAPH_API_BASE}/tokens/${tokenBalance.token_id}`,
          {
            timeout: 10000,
            headers: {
              Accept: 'application/json',
              'User-Agent': 'Hgraph-MCP-Server/1.0',
            },
          },
        );
        return TokenInfoSchema.parse(tokenInfoResponse.data);
      } catch (error) {
        return null;
      }
    });

    const tokenInfos = await Promise.all(tokenInfoPromises);

    tokenData.tokens.forEach((tokenBalance, index) => {
      const tokenInfo = tokenInfos[index];
      const createdDate = new Date(parseFloat(tokenBalance.created_timestamp) * 1000).toISOString();

      result += `## ${tokenInfo?.name || 'Unknown Token'} (${tokenBalance.token_id})\n`;
      result += `**Symbol:** ${tokenInfo?.symbol || 'N/A'}\n`;
      result += `**Balance:** ${tokenBalance.balance}`;

      if (tokenInfo?.decimals) {
        const decimals = parseInt(tokenInfo.decimals);
        if (decimals > 0) {
          const formattedBalance = (tokenBalance.balance / Math.pow(10, decimals)).toFixed(
            decimals,
          );
          result += ` (${formattedBalance} ${tokenInfo.symbol})`;
        }
      }
      result += '\n';

      result += `**Associated Since:** ${createdDate}\n`;

      if (tokenBalance.freeze_status) {
        result += `**Freeze Status:** ${tokenBalance.freeze_status}\n`;
      }

      if (tokenBalance.kyc_status) {
        result += `**KYC Status:** ${tokenBalance.kyc_status}\n`;
      }

      if (tokenInfo) {
        result += `**Token Type:** ${tokenInfo.type}\n`;
        result += `**Total Supply:** ${tokenInfo.total_supply}`;

        if (tokenInfo.decimals) {
          const decimals = parseInt(tokenInfo.decimals);
          if (decimals > 0) {
            const formattedSupply = (
              parseInt(tokenInfo.total_supply) / Math.pow(10, decimals)
            ).toFixed(decimals);
            result += ` (${formattedSupply} ${tokenInfo.symbol})`;
          }
        }
        result += '\n';

        if (tokenInfo.memo) {
          result += `**Memo:** ${tokenInfo.memo}\n`;
        }

        result += `**Treasury Account:** ${tokenInfo.treasury_account_id}\n`;
        result += `**Deleted:** ${tokenInfo.deleted ? 'Yes' : 'No'}\n`;

        if (tokenInfo.pause_status) {
          result += `**Pause Status:** ${tokenInfo.pause_status}\n`;
        }
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
        const message = tokenId
          ? `Token ${tokenId} not found or not associated with account ${accountId}`
          : `Account ${accountId} not found`;
        throw new Error(message);
      }
      throw new Error(
        `API request failed: ${error.response?.status} ${error.response?.statusText}`,
      );
    }
    throw error;
  }
}
