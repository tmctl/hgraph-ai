#!/usr/bin/env node

/**
 * HTTP/SSE Server for MCP
 * 
 * Provides a fully MCP-compliant HTTP server using Server-Sent Events
 * for proper streaming communication as per MCP specification.
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import crypto from 'crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  JSONRPCRequest,
} from '@modelcontextprotocol/sdk/types.js';

// Define proper JSON-RPC types
type JSONRPCResponse = {
  jsonrpc: '2.0';
  id: string | number | null;
} & (
  | { result: any; error?: never }
  | { error: { code: number; message: string; data?: any }; result?: never }
);

type JSONRPCError = {
  code: number;
  message: string;
  data?: any;
};

// Error codes from JSON-RPC spec
const ErrorCode = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
} as const;

import { SSETransport, SSEConnection } from './transport/sse.js';
import {
  authMiddleware,
  rateLimitMiddleware,
  corsOptions,
  securityHeaders,
  initializeAuth,
} from './middleware/auth.js';
import { listResources, listResourceTemplates, readResource } from './resources/index.js';
import { listPrompts, getPrompt } from './prompts/index.js';
import { tools, handleToolCall } from './tools/index.js';
import authRoutes from './routes/auth.js';

const app = express();
const PORT = process.env.MCP_PORT || 3001;
const PROTOCOL_VERSION = '1.0.0';

// Initialize authentication
initializeAuth();

// Create SSE transport
const sseTransport = new SSETransport();

// Create MCP server instance
const mcpServer = new Server(
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

// Middleware
app.use(cors(corsOptions()));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(securityHeaders);

// Authentication routes (before auth middleware)
app.use('/auth', authRoutes);

// Apply authentication and rate limiting to all other routes
app.use(authMiddleware);
app.use(rateLimitMiddleware);

// Connection storage
const connections = new Map<string, {
  initialized: boolean;
  capabilities: any;
  userId?: string;
}>();

/**
 * Root endpoint - Server information
 */
app.get('/', (req, res) => {
  res.json({
    mcp: PROTOCOL_VERSION,
    name: 'hgraph-mcp-server',
    description: 'MCP server for Hedera blockchain data access via Hgraph APIs',
    version: '1.0.0',
    transport: 'sse',
    endpoints: {
      sse: '/sse',
      rpc: '/rpc',
      health: '/health',
      auth: '/auth',
    },
    authentication: {
      methods: ['api-token', 'oauth2'],
      oauth: process.env.OAUTH_ENABLED === 'true',
    },
  });
});

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'hgraph-mcp-server',
    version: '1.0.0',
    protocol: PROTOCOL_VERSION,
    connections: sseTransport.getConnectionCount(),
    timestamp: new Date().toISOString(),
  });
});

/**
 * SSE endpoint - Main MCP communication channel
 */
app.get('/sse', (req, res) => {
  const connectionId = crypto.randomUUID();
  
  // Handle SSE connection
  sseTransport.handleConnection(req, res, connectionId);
  
  // Initialize connection state
  connections.set(connectionId, {
    initialized: false,
    capabilities: {},
    userId: (req as any).userId,
  });
  
  // Handle disconnection
  sseTransport.on('disconnection', (connection: SSEConnection) => {
    if (connection.id === connectionId) {
      connections.delete(connectionId);
    }
  });
});

/**
 * RPC endpoint - Handle JSON-RPC requests
 * This endpoint processes MCP protocol messages sent over HTTP POST
 */
app.post('/rpc', async (req, res) => {
  const connectionId = req.headers['x-connection-id'] as string;
  
  if (!connectionId) {
    res.status(400).json({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: ErrorCode.InvalidRequest,
        message: 'Missing x-connection-id header',
      },
    });
    return;
  }
  
  const connection = connections.get(connectionId);
  if (!connection) {
    res.status(400).json({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: ErrorCode.InvalidRequest,
        message: 'Invalid connection ID. Please establish SSE connection first.',
      },
    });
    return;
  }
  
  try {
    const request = req.body as JSONRPCRequest;
    const response = await handleRequest(request, connection);
    
    // Send response via SSE
    if (response) {
      sseTransport.sendResponse(connectionId, response);
      res.json({ success: true });
    } else {
      res.status(204).send();
    }
  } catch (error: any) {
    const errorResponse: JSONRPCResponse = {
      jsonrpc: '2.0',
      id: req.body.id || null,
      error: {
        code: ErrorCode.InternalError,
        message: error.message || 'Internal server error',
      },
    };
    
    sseTransport.sendResponse(connectionId, errorResponse);
    res.status(500).json(errorResponse);
  }
});

/**
 * Handle MCP protocol requests
 */
async function handleRequest(
  request: JSONRPCRequest,
  connection: any
): Promise<JSONRPCResponse | null> {
  const { method, params, id } = request;
  
  switch (method) {
    case 'initialize':
      connection.initialized = true;
      connection.capabilities = params?.capabilities || {};
      
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: PROTOCOL_VERSION,
          serverInfo: {
            name: 'hgraph-mcp-server',
            version: '1.0.0',
          },
          capabilities: {
            tools: {},
            resources: {},
            prompts: {},
          },
        },
      };
      
    case 'notifications/initialized':
      // This is a notification, no response needed
      return null;
      
    case 'tools/list':
      if (!connection.initialized) {
        throw new Error('Connection not initialized');
      }
      
      return {
        jsonrpc: '2.0',
        id,
        result: {
          tools,
        },
      };
      
    case 'tools/call':
      if (!connection.initialized) {
        throw new Error('Connection not initialized');
      }
      
      const toolResult = await handleToolCall(
        params?.name as string,
        params?.arguments as any
      );
      
      return {
        jsonrpc: '2.0',
        id,
        result: toolResult,
      };
      
    case 'resources/list':
      if (!connection.initialized) {
        throw new Error('Connection not initialized');
      }
      
      const resources = await listResources();
      
      return {
        jsonrpc: '2.0',
        id,
        result: {
          resources,
        },
      };
      
    case 'resources/templates/list':
      if (!connection.initialized) {
        throw new Error('Connection not initialized');
      }
      
      const templates = await listResourceTemplates();
      
      return {
        jsonrpc: '2.0',
        id,
        result: {
          resourceTemplates: templates,
        },
      };
      
    case 'resources/read':
      if (!connection.initialized) {
        throw new Error('Connection not initialized');
      }
      
      const resourceData = await readResource(params?.uri as string);
      
      return {
        jsonrpc: '2.0',
        id,
        result: {
          contents: [
            {
              uri: params?.uri as string,
              mimeType: resourceData.mimeType,
              text: typeof resourceData.content === 'string' 
                ? resourceData.content 
                : JSON.stringify(resourceData.content, null, 2),
            },
          ],
        },
      };
      
    case 'prompts/list':
      if (!connection.initialized) {
        throw new Error('Connection not initialized');
      }
      
      const prompts = await listPrompts();
      
      return {
        jsonrpc: '2.0',
        id,
        result: {
          prompts,
        },
      };
      
    case 'prompts/get':
      if (!connection.initialized) {
        throw new Error('Connection not initialized');
      }
      
      const messages = await getPrompt(
        params?.name as string,
        params?.arguments as Record<string, string>
      );
      
      return {
        jsonrpc: '2.0',
        id,
        result: {
          description: `Prompt template: ${params?.name}`,
          messages,
        },
      };
      
    case 'completion/complete':
      // This would integrate with the AI model for completions
      // For now, return not implemented
      throw new Error('Completion not implemented in this server');
      
    default:
      throw new Error(`Unknown method: ${method}`);
  }
}

/**
 * Graceful shutdown
 */
process.on('SIGINT', () => {
  console.log('\nShutting down MCP HTTP/SSE server...');
  sseTransport.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down MCP HTTP/SSE server...');
  sseTransport.close();
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  console.log('================================================');
  console.log(`🚀 Hgraph MCP HTTP/SSE Server`);
  console.log(`📍 Running on http://localhost:${PORT}`);
  const authMethods = [];
  if (process.env.MCP_API_TOKENS) authMethods.push('API Tokens');
  if (process.env.OAUTH_ENABLED === 'true') authMethods.push('OAuth 2.0');
  if (authMethods.length === 0) authMethods.push('Temporary Token');
  console.log(`🔐 Authentication: ${authMethods.join(', ')}`);
  if (process.env.OAUTH_ENABLED === 'true') {
    const providers = [];
    if (process.env.OAUTH_GOOGLE_CLIENT_ID) providers.push('Google');
    if (process.env.OAUTH_AUTH0_DOMAIN) providers.push('Auth0');
    if (process.env.OAUTH_CUSTOM_ISSUER) providers.push('Custom');
    if (providers.length > 0) {
      console.log(`🔑 OAuth Providers: ${providers.join(', ')}`);
    }
  }
  console.log(`📡 Protocol: MCP ${PROTOCOL_VERSION}`);
  console.log(`🔌 Transport: Server-Sent Events (SSE)`);
  console.log('================================================');
  console.log('Endpoints:');
  console.log(`  GET  /       - Server information`);
  console.log(`  GET  /health - Health check`);
  console.log(`  GET  /sse    - SSE connection (main MCP channel)`);
  console.log(`  POST /rpc    - RPC endpoint (requires connection)`);
  console.log(`  *    /auth/* - OAuth 2.0 authentication routes`);
  console.log('================================================');
});

export default app;