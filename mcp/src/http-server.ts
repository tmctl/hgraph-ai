#!/usr/bin/env node

import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { JSONRPCRequest, JSONRPCResponse } from '@modelcontextprotocol/sdk/types.js';

import { tools, handleToolCall } from './tools/index.js';
import { listResources, listResourceTemplates, readResource } from './resources/index.js';
import { listPrompts, getPrompt } from './prompts/index.js';

const PROTOCOL_VERSION = '1.0.0';

// Create Express app for HTTP server
const app = express();

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  credentials: true,
}));

app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// SSE clients management
interface SSEClient {
  id: string;
  response: Response;
  isAlive: boolean;
  createdAt: Date;
  lastActivity: Date;
}

const sseClients = new Map<string, SSEClient>();

// Helper to process JSON-RPC requests
async function processJSONRPCRequest(request: JSONRPCRequest): Promise<JSONRPCResponse> {
  try {
    // Handle the request based on method
    let result: any;
    
    if (request.method === 'tools/list') {
      result = { tools };
    } else if (request.method === 'tools/call') {
      const params = request.params as any;
      if (!params?.name) {
        throw new Error('Tool name is required');
      }
      result = await handleToolCall(params.name, params.arguments || {});
    } else if (request.method === 'resources/list') {
      const resources = await listResources();
      result = { resources };
    } else if (request.method === 'resources/templates/list') {
      const resourceTemplates = await listResourceTemplates();
      result = { resourceTemplates };
    } else if (request.method === 'resources/read') {
      const params = request.params as any;
      if (!params?.uri) {
        throw new Error('Resource URI is required');
      }
      const resourceData = await readResource(params.uri);
      result = {
        contents: [
          {
            uri: params.uri,
            mimeType: resourceData.mimeType,
            text:
              typeof resourceData.content === 'string'
                ? resourceData.content
                : JSON.stringify(resourceData.content, null, 2),
          },
        ],
      };
    } else if (request.method === 'prompts/list') {
      const prompts = await listPrompts();
      result = { prompts };
    } else if (request.method === 'prompts/get') {
      const params = request.params as any;
      if (!params?.name) {
        throw new Error('Prompt name is required');
      }
      const messages = await getPrompt(params.name, params.arguments || {});
      result = {
        description: `Prompt template: ${params.name}`,
        messages,
      };
    } else {
      // Unknown method
      return {
        jsonrpc: '2.0',
        id: request.id ?? null,
        error: {
          code: -32601,
          message: 'Method not found',
          data: { method: request.method }
        }
      } as any;
    }
    
    return {
      jsonrpc: '2.0',
      id: request.id ?? null,
      result
    } as JSONRPCResponse;
  } catch (error) {
    console.error('Error processing request:', error);
    return {
      jsonrpc: '2.0',
      id: request.id ?? null,
      error: {
        code: -32603,
        message: 'Internal error',
        data: error instanceof Error ? error.message : 'Unknown error'
      }
    } as any;
  }
}

// Routes
const apiPrefix = process.env.MCP_API_PREFIX || '/mcp';

// Health check
app.get(`${apiPrefix}/health`, (req, res) => {
  res.json({
    status: 'ok',
    protocol: 'MCP/1.0',
    transport: 'streamable-http',
    clients: sseClients.size,
    timestamp: new Date().toISOString(),
  });
});

// SSE endpoint
app.get(`${apiPrefix}/sse`, (req: Request, res: Response) => {
  const clientId = Math.random().toString(36).substring(7);
  
  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': '*',
  });

  // Create client
  const client: SSEClient = {
    id: clientId,
    response: res,
    isAlive: true,
    createdAt: new Date(),
    lastActivity: new Date(),
  };

  sseClients.set(clientId, client);

  // Send initial connection event
  res.write(`event: connected\ndata: ${JSON.stringify({
    clientId,
    protocol: 'MCP/1.0',
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
    },
    timestamp: new Date().toISOString(),
  })}\n\n`);

  // Handle disconnect
  req.on('close', () => {
    sseClients.delete(clientId);
    console.log(`SSE client disconnected: ${clientId}`);
  });

  req.on('error', (error) => {
    console.error(`SSE client error ${clientId}:`, error);
    sseClients.delete(clientId);
  });

  console.log(`SSE client connected: ${clientId}`);
});

// Message endpoint
app.post(`${apiPrefix}/message`, async (req: Request, res: Response) => {
  try {
    const request = req.body as JSONRPCRequest;
    
    if (!request || request.jsonrpc !== '2.0' || !request.method) {
      res.status(400).json({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32600,
          message: 'Invalid Request'
        }
      });
      return;
    }

    const response = await processJSONRPCRequest(request);
    res.json(response);
    
    // Broadcast to SSE clients
    for (const [_, client] of sseClients) {
      try {
        client.response.write(`event: message\ndata: ${JSON.stringify(response)}\n\n`);
      } catch (error) {
        // Client disconnected
      }
    }
  } catch (error) {
    console.error('Error handling message:', error);
    res.status(500).json({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32603,
        message: 'Internal error',
        data: error instanceof Error ? error.message : 'Unknown error'
      }
    });
  }
});

// Batch endpoint
app.post(`${apiPrefix}/batch`, async (req: Request, res: Response) => {
  try {
    const requests = req.body as JSONRPCRequest[];
    
    if (!Array.isArray(requests) || requests.length === 0) {
      res.status(400).json({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32600,
          message: 'Invalid batch request'
        }
      });
      return;
    }

    const responses = await Promise.all(
      requests.map(request => processJSONRPCRequest(request))
    );
    
    res.json(responses);
  } catch (error) {
    console.error('Error handling batch:', error);
    res.status(500).json({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32603,
        message: 'Internal error',
        data: error instanceof Error ? error.message : 'Unknown error'
      }
    });
  }
});

// Start heartbeat for SSE clients
setInterval(() => {
  const now = new Date();
  for (const [clientId, client] of sseClients) {
    if (client.isAlive) {
      try {
        client.response.write(`event: heartbeat\ndata: ${JSON.stringify({
          timestamp: now.toISOString()
        })}\n\n`);
        client.lastActivity = now;
      } catch (error) {
        // Client disconnected
        sseClients.delete(clientId);
      }
    }
  }
}, 30000); // Every 30 seconds

async function main() {
  const port = parseInt(process.env.MCP_PORT || '3001', 10);
  const host = process.env.MCP_HOST || 'localhost';

  app.listen(port, host, () => {
    console.error('================================================');
    console.error('Hgraph MCP Server (Streamable HTTP) running');
    console.error(`Protocol: MCP ${PROTOCOL_VERSION}`);
    console.error(`URL: http://${host}:${port}${apiPrefix}`);
    console.error('Endpoints:');
    console.error(`  - Health: GET ${apiPrefix}/health`);
    console.error(`  - SSE Stream: GET ${apiPrefix}/sse`);
    console.error(`  - Message: POST ${apiPrefix}/message`);
    console.error(`  - Batch: POST ${apiPrefix}/batch`);
    console.error('Capabilities: Tools, Resources, Prompts');
    console.error('Transport: Streamable HTTP with SSE');
    console.error('================================================');
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Server error:', error);
    process.exit(1);
  });
}

export default app;