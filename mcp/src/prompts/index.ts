/**
 * Prompt Templates for MCP Server
 *
 * Provides reusable interaction templates for common tasks
 */

import { Prompt, PromptMessage } from '@modelcontextprotocol/sdk/types.js';

// Available prompts
const prompts: Prompt[] = [
  {
    name: 'analyze_account',
    description: 'Comprehensive analysis of a Hedera account',
    arguments: [
      {
        name: 'accountId',
        description: 'Hedera account ID (e.g., 0.0.123456)',
        required: true,
      },
      {
        name: 'depth',
        description: 'Analysis depth: basic, detailed, or comprehensive',
        required: false,
      },
    ],
  },
  {
    name: 'token_portfolio',
    description: 'Analyze token portfolio and holdings',
    arguments: [
      {
        name: 'accountId',
        description: 'Hedera account ID to analyze',
        required: true,
      },
      {
        name: 'includeNFTs',
        description: 'Include NFT holdings in analysis',
        required: false,
      },
    ],
  },
  {
    name: 'transaction_investigation',
    description: 'Investigate and explain a transaction',
    arguments: [
      {
        name: 'transactionId',
        description: 'Transaction ID or hash to investigate',
        required: true,
      },
    ],
  },
  {
    name: 'contract_audit',
    description: 'Basic audit and analysis of a smart contract',
    arguments: [
      {
        name: 'contractId',
        description: 'Contract ID or EVM address',
        required: true,
      },
      {
        name: 'checkType',
        description: 'Type of check: security, gas, or functionality',
        required: false,
      },
    ],
  },
  {
    name: 'network_statistics',
    description: 'Generate network statistics and metrics',
    arguments: [
      {
        name: 'timeframe',
        description: 'Time period: hour, day, week, or month',
        required: false,
      },
      {
        name: 'metrics',
        description: 'Specific metrics to include (comma-separated)',
        required: false,
      },
    ],
  },
  {
    name: 'create_visualization',
    description: 'Create a data visualization',
    arguments: [
      {
        name: 'description',
        description: 'Natural language description of desired visualization',
        required: true,
      },
      {
        name: 'dataSource',
        description: 'Data source: account, token, transactions, or custom',
        required: false,
      },
    ],
  },
  {
    name: 'query_builder',
    description: 'Build a GraphQL query from natural language',
    arguments: [
      {
        name: 'description',
        description: 'What data do you want to query?',
        required: true,
      },
      {
        name: 'format',
        description: 'Output format: query, variables, or both',
        required: false,
      },
    ],
  },
  {
    name: 'gas_estimation',
    description: 'Estimate gas costs for operations',
    arguments: [
      {
        name: 'operation',
        description: 'Type of operation (transfer, deploy, call)',
        required: true,
      },
      {
        name: 'parameters',
        description: 'Operation parameters (JSON format)',
        required: false,
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

  // Generate prompt messages based on the template
  switch (name) {
    case 'analyze_account':
      return generateAccountAnalysisPrompt(args);

    case 'token_portfolio':
      return generateTokenPortfolioPrompt(args);

    case 'transaction_investigation':
      return generateTransactionInvestigationPrompt(args);

    case 'contract_audit':
      return generateContractAuditPrompt(args);

    case 'network_statistics':
      return generateNetworkStatisticsPrompt(args);

    case 'create_visualization':
      return generateVisualizationPrompt(args);

    case 'query_builder':
      return generateQueryBuilderPrompt(args);

    case 'gas_estimation':
      return generateGasEstimationPrompt(args);

    default:
      throw new Error(`Prompt not implemented: ${name}`);
  }
}

/**
 * Generate account analysis prompt
 */
function generateAccountAnalysisPrompt(args: Record<string, string>): PromptMessage[] {
  const depth = args.depth || 'detailed';

  return [
    {
      role: 'user',
      content: {
        type: 'text',
        text: `Please provide a ${depth} analysis of Hedera account ${args.accountId}.
        
Include the following in your analysis:
${
  depth === 'basic'
    ? `
- Current balance
- Account creation date
- Recent activity summary`
    : ''
}
${
  depth === 'detailed' || depth === 'comprehensive'
    ? `
- Current balance and historical trends
- Token holdings and values
- Transaction patterns and frequency
- Key interactions with other accounts
- Smart contract interactions`
    : ''
}
${
  depth === 'comprehensive'
    ? `
- Detailed transaction categorization
- Network fee analysis
- Token transfer patterns
- Potential risks or anomalies
- Recommendations for optimization`
    : ''
}

Use the available tools to gather the necessary data and present a clear, structured analysis.`,
      },
    },
  ];
}

/**
 * Generate token portfolio prompt
 */
function generateTokenPortfolioPrompt(args: Record<string, string>): PromptMessage[] {
  const includeNFTs = args.includeNFTs === 'true';

  return [
    {
      role: 'user',
      content: {
        type: 'text',
        text: `Analyze the token portfolio for account ${args.accountId}.

Please provide:
1. List of all token holdings with balances
2. Token values and percentages of portfolio
${includeNFTs ? '3. NFT collections and items owned' : ''}
${includeNFTs ? '4. Total portfolio value estimation' : '3. Total portfolio value estimation'}
${includeNFTs ? '5. Diversity and risk assessment' : '4. Diversity and risk assessment'}

Create a visualization showing the portfolio distribution if possible.`,
      },
    },
  ];
}

/**
 * Generate transaction investigation prompt
 */
function generateTransactionInvestigationPrompt(args: Record<string, string>): PromptMessage[] {
  return [
    {
      role: 'user',
      content: {
        type: 'text',
        text: `Investigate transaction ${args.transactionId} and provide a detailed explanation.

Include:
1. Transaction details (timestamp, parties involved, amounts)
2. Transaction type and purpose
3. Fee breakdown
4. Result and any errors
5. Related transactions or context
6. Plain English explanation of what happened

Use multiple tools to gather comprehensive information about this transaction.`,
      },
    },
  ];
}

/**
 * Generate contract audit prompt
 */
function generateContractAuditPrompt(args: Record<string, string>): PromptMessage[] {
  const checkType = args.checkType || 'general';

  return [
    {
      role: 'user',
      content: {
        type: 'text',
        text: `Perform a ${checkType} audit of smart contract ${args.contractId}.

Focus on:
${
  checkType === 'security'
    ? `
- Known vulnerability patterns
- Access control issues
- Reentrancy risks
- Integer overflow/underflow possibilities`
    : ''
}
${
  checkType === 'gas'
    ? `
- Gas consumption patterns
- Optimization opportunities
- Expensive operations
- Storage efficiency`
    : ''
}
${
  checkType === 'functionality'
    ? `
- Contract purpose and design
- Available functions and their uses
- Event emissions
- Integration points`
    : ''
}
${
  checkType === 'general'
    ? `
- Contract overview and purpose
- Key functions and events
- Basic security considerations
- Recent activity and usage`
    : ''
}

Provide actionable recommendations where applicable.`,
      },
    },
  ];
}

/**
 * Generate network statistics prompt
 */
function generateNetworkStatisticsPrompt(args: Record<string, string>): PromptMessage[] {
  const timeframe = args.timeframe || 'day';
  const metrics = args.metrics?.split(',') || ['transactions', 'accounts', 'tokens'];

  return [
    {
      role: 'user',
      content: {
        type: 'text',
        text: `Generate Hedera network statistics for the last ${timeframe}.

Include the following metrics:
${metrics.map((m) => `- ${m.trim()}`).join('\n')}

Provide:
1. Current values for each metric
2. Changes compared to previous ${timeframe}
3. Trends and patterns observed
4. Visual representation of the data
5. Key insights and observations

Use GraphQL queries to gather accurate, real-time data.`,
      },
    },
  ];
}

/**
 * Generate visualization prompt
 */
function generateVisualizationPrompt(args: Record<string, string>): PromptMessage[] {
  const dataSource = args.dataSource || 'auto';

  return [
    {
      role: 'user',
      content: {
        type: 'text',
        text: `Create a visualization based on: "${args.description}"

${dataSource !== 'auto' ? `Use data from: ${dataSource}` : 'Automatically determine the best data source.'}

Steps:
1. Gather the necessary data using appropriate tools
2. Process and structure the data for visualization
3. Generate D3.js visualization code
4. Provide the visualization along with insights

Make the visualization interactive and informative.`,
      },
    },
  ];
}

/**
 * Generate query builder prompt
 */
function generateQueryBuilderPrompt(args: Record<string, string>): PromptMessage[] {
  const format = args.format || 'both';

  return [
    {
      role: 'user',
      content: {
        type: 'text',
        text: `Build a GraphQL query for: "${args.description}"

Requirements:
${format === 'query' || format === 'both' ? '- Provide the complete GraphQL query' : ''}
${format === 'variables' || format === 'both' ? '- Include example variables' : ''}
${format === 'both' ? '- Show how to execute the query' : ''}

Additional:
- Optimize for performance
- Include relevant fields
- Add helpful comments
- Provide example response structure

Use the GraphQL schema to ensure query validity.`,
      },
    },
  ];
}

/**
 * Generate gas estimation prompt
 */
function generateGasEstimationPrompt(args: Record<string, string>): PromptMessage[] {
  const parameters = args.parameters ? JSON.parse(args.parameters) : {};

  return [
    {
      role: 'user',
      content: {
        type: 'text',
        text: `Estimate gas costs for operation: ${args.operation}

Parameters: ${JSON.stringify(parameters, null, 2)}

Provide:
1. Estimated gas usage
2. Current gas price
3. Total cost in HBAR
4. Cost in USD equivalent
5. Comparison with similar operations
6. Optimization suggestions if applicable

Use JSON-RPC methods to get accurate gas estimates.`,
      },
    },
  ];
}
