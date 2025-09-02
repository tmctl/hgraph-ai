/**
 * Consolidated Tools Export for MCP Server
 *
 * Central registry of all available tools with proper typing and validation
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { askQuestion } from './database.js';

// Export all tool definitions
export const tools: Tool[] = [
  {
    name: 'execute_query',
    description: 'Execute a SQL query and return the data from the database',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'SQL query string to execute',
        },
      },
      required: ['query'],
    },
  },
];

/**
 * Handle tool execution with proper error handling and response formatting
 */
export async function handleToolCall(name: string, args: any): Promise<any> {
  try {
    // Input validation
    const tool = tools.find((t) => t.name === name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }

    // Validate required parameters
    const required = tool.inputSchema.required || [];
    for (const param of required) {
      if (!args || args[param] === undefined) {
        throw new Error(`Missing required parameter: ${param}`);
      }
    }

    // Execute tool based on name
    switch (name) {
      case 'execute_query':
        return await askQuestion(args?.query as string);

      default:
        throw new Error(`Tool not implemented: ${name}`);
    }
  } catch (error) {
    // Return error in MCP format
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
