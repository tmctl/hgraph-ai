/**
 * Prompt Templates for MCP Server
 *
 * Provides reusable interaction templates for common tasks
 */

import { Prompt, PromptMessage } from '@modelcontextprotocol/sdk/types.js';

// Available prompts
const prompts: Prompt[] = [
  {
    name: 'get_user_fungible_tokens',
    description: 'Query all fungible tokens owned by a specific account with their balances',
    arguments: [
      {
        name: 'account_id',
        description: 'The Hedera account ID (entity_id) to query tokens for',
        required: true,
      },
      {
        name: 'min_balance',
        description: 'Optional minimum balance filter (default: 0)',
        required: false,
      },
    ],
  },
  {
    name: 'get_token_holders',
    description: 'Get the top holders of a specific fungible token',
    arguments: [
      {
        name: 'token_id',
        description: 'The token ID to query holders for',
        required: true,
      },
      {
        name: 'limit',
        description: 'Number of top holders to return (default: 10)',
        required: false,
      },
    ],
  },
  {
    name: 'get_account_nfts',
    description: 'Query all NFTs owned by a specific account grouped by collection',
    arguments: [
      {
        name: 'account_id',
        description: 'The Hedera account ID (entity_id) to query NFTs for',
        required: true,
      },
    ],
  },
];

/**
 * List all available prompts
 */
export async function listPrompts(): Promise<Prompt[]> {
  return prompts;
}

/**
 * Get a specific prompt by name
 */
export async function getPrompt(
  name: string,
  args: Record<string, string>,
): Promise<PromptMessage[]> {
  const prompt = prompts.find((p) => p.name === name);

  if (!prompt) {
    throw new Error(`Unknown prompt: ${name}`);
  }

  // Validate required arguments
  for (const arg of prompt.arguments || []) {
    if (arg.required && !args[arg.name]) {
      throw new Error(`Missing required argument: ${arg.name}`);
    }
  }

  // Generate SQL based on prompt
  let sql = '';
  let userPrompt = '';

  switch (name) {
    case 'get_user_fungible_tokens':
      const minBalance = args.min_balance || '0';
      sql = `
        SELECT
          ta.token_id,
          t.name as token_name,
          t.symbol,
          ta.balance,
          t.decimals,
          CASE
            WHEN t.decimals > 0
            THEN ta.balance::numeric / POWER(10, t.decimals)
            ELSE ta.balance
          END as adjusted_balance
        FROM token_account ta
        JOIN token t ON ta.token_id = t.token_id
        WHERE ta.account_id = ${args.account_id}
          AND ta.balance > ${minBalance}
          AND t.type = 'FUNGIBLE_COMMON'
        ORDER BY ta.balance DESC;
      `.trim();

      userPrompt = `Get all fungible tokens for account ${args.account_id} with their balances`;
      break;

    case 'get_token_holders':
      const limit = args.limit || '10';
      sql = `
        SELECT
          ta.account_id,
          e.alias,
          ta.balance,
          t.decimals,
          CASE
            WHEN t.decimals > 0
            THEN ta.balance::numeric / POWER(10, t.decimals)
            ELSE ta.balance
          END as adjusted_balance,
          ROUND(ta.balance::numeric * 100.0 / t.total_supply, 4) as percentage_owned
        FROM token_account ta
        JOIN token t ON ta.token_id = t.token_id
        LEFT JOIN entity e ON ta.account_id = e.id
        WHERE ta.token_id = ${args.token_id}
          AND ta.balance > 0
        ORDER BY ta.balance DESC
        LIMIT ${limit};
      `.trim();

      userPrompt = `Get top ${limit} holders of token ${args.token_id}`;
      break;

    case 'get_account_nfts':
      sql = `
        SELECT
          n.token_id,
          t.name as collection_name,
          t.symbol,
          COUNT(*) as nft_count,
          array_agg(n.serial_number ORDER BY n.serial_number) as serial_numbers
        FROM nft n
        JOIN token t ON n.token_id = t.token_id
        WHERE n.account_id = ${args.account_id}
        GROUP BY n.token_id, t.name, t.symbol
        ORDER BY nft_count DESC;
      `.trim();

      userPrompt = `Get all NFT collections owned by account ${args.account_id}`;
      break;

    default:
      throw new Error(`Prompt not implemented: ${name}`);
  }

  return [
    {
      role: 'user',
      content: {
        type: 'text',
        text: userPrompt,
      },
    },
    {
      role: 'assistant',
      content: {
        type: 'text',
        text: `I'll help you with that query. Here's the SQL to ${userPrompt.toLowerCase()}:\n\n\`\`\`sql\n${sql}\n\`\`\`\n\nThis query will return the requested data from the Hedera mirror node database.`,
      },
    },
  ];
}
