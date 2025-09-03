/**
 * Consolidated Tools Export for MCP Server
 *
 * Central registry of all available tools with proper typing and validation
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { executeQuery } from './database.js';
import {
  getAllTemplates,
  getTemplatesByCategory,
  getTemplate,
  getCategories,
  formatTemplate,
  generateExampleSQL,
} from './queryTemplates.js';

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
  {
    name: 'get_query_templates',
    description:
      'Get pre-built query templates for common Hedera blockchain operations. Templates help craft optimized queries for accounts, tokens, transactions, contracts, NFTs, and network statistics.',
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description:
            'Filter templates by category (account, token, transaction, contract, nft, statistics). Leave empty to get all templates.',
          enum: ['account', 'token', 'transaction', 'contract', 'nft', 'statistics', 'all'],
        },
        template_name: {
          type: 'string',
          description: 'Get a specific template by name. Leave empty to list templates.',
        },
        generate_example: {
          type: 'boolean',
          description: 'Generate example SQL for the template(s) using default values',
        },
      },
      required: [],
    },
  },
  {
    name: 'use_query_template',
    description: 'Execute a query using a pre-built template with your parameter values',
    inputSchema: {
      type: 'object',
      properties: {
        template_name: {
          type: 'string',
          description: 'Name of the template to use',
        },
        parameters: {
          type: 'object',
          description: 'Parameter values for the template',
          additionalProperties: true,
        },
      },
      required: ['template_name', 'parameters'],
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
        return await executeQuery(args?.query as string);

      case 'get_query_templates': {
        const { category, template_name, generate_example } = args || {};

        // Get specific template
        if (template_name) {
          const template = getTemplate(template_name);
          if (!template) {
            throw new Error(`Template not found: ${template_name}`);
          }

          const response: any = {
            template: template,
          };

          if (generate_example) {
            response.example_sql = generateExampleSQL(template_name);
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(response, null, 2),
              },
            ],
          };
        }

        // Get templates by category or all
        let templates;
        if (category && category !== 'all') {
          templates = getTemplatesByCategory(category);
        } else {
          templates = getAllTemplates();
        }

        // Format response
        const response = {
          categories: getCategories(),
          templates: templates.map((t) => ({
            name: t.name,
            category: t.category,
            description: t.description,
            parameters: t.parameters,
            exampleUsage: t.exampleUsage,
            example_sql: generate_example ? generateExampleSQL(t.name) : undefined,
          })),
          total: templates.length,
        };

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
      }

      case 'use_query_template': {
        const { template_name, parameters } = args || {};

        if (!template_name) {
          throw new Error('Template name is required');
        }

        const template = getTemplate(template_name);
        if (!template) {
          throw new Error(`Template not found: ${template_name}`);
        }

        // Validate required parameters
        for (const param of template.parameters) {
          if (parameters[param.name] === undefined) {
            throw new Error(`Missing required parameter: ${param.name} (${param.description})`);
          }
        }

        // Format the template with parameters
        const sql = formatTemplate(template_name, parameters);
        if (!sql) {
          throw new Error('Failed to format template');
        }

        // Execute the query
        const result = await executeQuery(sql);

        // Add template info to response
        if (result && typeof result === 'object' && 'content' in result) {
          // Enhance the response with template metadata
          const enhancedContent = result.content.map((item: any) => {
            if (item.type === 'text') {
              try {
                const parsed = JSON.parse(item.text);
                parsed.template_used = template_name;
                parsed.parameters_used = parameters;
                return { ...item, text: JSON.stringify(parsed, null, 2) };
              } catch {
                // If not JSON, return as is
                return item;
              }
            }
            return item;
          });

          return { ...result, content: enhancedContent };
        }

        return result;
      }

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
