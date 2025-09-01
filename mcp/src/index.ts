#!/usr/bin/env node

import 'dotenv/config';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { tools, handleToolCall } from './tools/index.js';
import { listResources, listResourceTemplates, readResource } from './resources/index.js';
import { listPrompts, getPrompt } from './prompts/index.js';

const PROTOCOL_VERSION = '1.0.0';

const server = new Server(
  {
    name: 'hgraph-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
    },
  },
);

// Tool definitions moved to tools/index.ts for better organization

// Register handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools,
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  return await handleToolCall(name, args);
});

// Resource handlers
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const resources = await listResources();
  return {
    resources,
  };
});

server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
  const resourceTemplates = await listResourceTemplates();
  return {
    resourceTemplates,
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;
  const resourceData = await readResource(uri);
  
  return {
    contents: [
      {
        uri,
        mimeType: resourceData.mimeType,
        text: typeof resourceData.content === 'string'
          ? resourceData.content
          : JSON.stringify(resourceData.content, null, 2),
      },
    ],
  };
});

// Prompt handlers
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  const prompts = await listPrompts();
  return {
    prompts,
  };
});

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const messages = await getPrompt(name, args || {});
  
  return {
    description: `Prompt template: ${name}`,
    messages,
  };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('================================================');
  console.error('Hgraph MCP Server (stdio) running');
  console.error(`Protocol: MCP ${PROTOCOL_VERSION}`);
  console.error('Capabilities: Tools, Resources, Prompts');
  console.error('Transport: stdio (for Claude Desktop)');
  console.error('================================================');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Server error:', error);
    process.exit(1);
  });
}