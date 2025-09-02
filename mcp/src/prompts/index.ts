/**
 * Prompt Templates for MCP Server
 *
 * Provides reusable interaction templates for common tasks
 */

import { Prompt, PromptMessage } from '@modelcontextprotocol/sdk/types.js';

// Available prompts
const prompts: Prompt[] = [];

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

  // No prompts available
  throw new Error(`Prompt not implemented: ${name}`);
}
