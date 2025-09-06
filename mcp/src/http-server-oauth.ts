#!/usr/bin/env node

import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { JSONRPCRequest, JSONRPCResponse } from '@modelcontextprotocol/sdk/types.js';

import { tools, handleToolCall } from './tools/index.js';
import { listResources, listResourceTemplates, readResource } from './resources/index.js';
import { listPrompts, getPrompt } from './prompts/index.js';

// OAuth imports
import {
  createOAuthMiddleware,
  requireScopes,
  requireRoles,
  AuthConfig,
  AuthenticatedRequest,
} from './auth/oauth-middleware.js';
import { createOAuthRoutes, OAuthRoutesConfig } from './auth/oauth-routes.js';

const PROTOCOL_VERSION = '1.0.0';

// Create Express app for HTTP server
const app = express();

// Parse environment variables for OAuth config
const authConfig: OAuthRoutesConfig = {
  enabled: process.env.MCP_AUTH_ENABLED === 'true',
  mode: (process.env.MCP_AUTH_MODE || 'oauth2') as 'oauth2' | 'basic' | 'hybrid',
  issuer: process.env.MCP_AUTH_ISSUER || 'http://localhost:8080/realms/mcp',
  audience: process.env.MCP_AUTH_AUDIENCE || 'mcp-api',
  jwksUri:
    process.env.MCP_AUTH_JWKS_URI ||
    'http://localhost:8080/realms/mcp/protocol/openid-connect/certs',
  discoveryBase: process.env.MCP_AUTH_DISCOVERY_BASE || 'http://localhost:3001',
  tokenEndpoint:
    process.env.MCP_AUTH_TOKEN_ENDPOINT ||
    'http://localhost:8080/realms/mcp/protocol/openid-connect/token',
  authzEndpoint:
    process.env.MCP_AUTH_AUTHZ_ENDPOINT ||
    'http://localhost:8080/realms/mcp/protocol/openid-connect/auth',
  registrationEndpoint:
    process.env.MCP_AUTH_REGISTRATION_ENDPOINT ||
    'http://localhost:8080/realms/mcp/clients-registrations/openid-connect',
  allowedAlgorithms: (process.env.MCP_AUTH_ALLOWED_ALGS || 'RS256,ES256').split(','),
  clockSkewSeconds: parseInt(process.env.MCP_AUTH_CLOCK_SKEW_SECONDS || '120', 10),
  jwksCacheTTLSeconds: parseInt(process.env.MCP_AUTH_JWKS_CACHE_TTL_SECONDS || '3600', 10),
  scopeToRoleMap: JSON.parse(
    process.env.MCP_SCOPE_TO_ROLE_MAP_JSON ||
      '{"mcp.read":"reader","mcp.write":"writer","mcp.admin":"admin"}',
  ),
  enableDCR: process.env.MCP_ENABLE_DCR === 'true',
  initialAccessToken: process.env.MCP_INITIAL_ACCESS_TOKEN,
  // Legacy basic auth token for hybrid mode
  basicToken: process.env.MCP_AUTH_TOKEN,
};

// Middleware
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    credentials: true,
  }),
);

app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Mount OAuth routes (discovery, auth flow, DCR)
const oauthRoutes = createOAuthRoutes(authConfig);
app.use(oauthRoutes);

// Create OAuth middleware
const authMiddleware = createOAuthMiddleware(authConfig);

// SSE clients management
interface SSEClient {
  id: string;
  response: Response;
  isAlive: boolean;
  createdAt: Date;
  lastActivity: Date;
  auth?: {
    sub: string;
    scopes: string[];
    roles: string[];
  };
}

const sseClients = new Map<string, SSEClient>();

// Helper to process JSON-RPC requests
async function processJSONRPCRequest(
  request: JSONRPCRequest,
  auth?: AuthenticatedRequest['auth'],
): Promise<JSONRPCResponse> {
  try {
    // Check authorization for specific methods
    const method = request.method;

    // Define method permissions
    const methodPermissions: Record<string, { scopes?: string[]; roles?: string[] }> = {
      'tools/list': { scopes: ['mcp.read'] },
      'tools/call': { scopes: ['mcp.write'] },
      'resources/list': { scopes: ['mcp.read'] },
      'resources/templates/list': { scopes: ['mcp.read'] },
      'resources/read': { scopes: ['mcp.read'] },
      'prompts/list': { scopes: ['mcp.read'] },
      'prompts/get': { scopes: ['mcp.read'] },
    };

    // Check permissions if auth is enabled
    if (authConfig.enabled && auth) {
      const perms = methodPermissions[method];
      if (perms) {
        if (perms.scopes) {
          const hasScope = perms.scopes.some((scope) => auth.scopes.includes(scope));
          if (!hasScope) {
            return {
              jsonrpc: '2.0',
              id: request.id ?? null,
              error: {
                code: -32002,
                message: 'Forbidden',
                data: `Insufficient scopes. Required: ${perms.scopes.join(', ')}`,
              },
            } as any;
          }
        }
        if (perms.roles) {
          const hasRole = perms.roles.some((role) => auth.roles.includes(role));
          if (!hasRole) {
            return {
              jsonrpc: '2.0',
              id: request.id ?? null,
              error: {
                code: -32002,
                message: 'Forbidden',
                data: `Insufficient roles. Required: ${perms.roles.join(', ')}`,
              },
            } as any;
          }
        }
      }
    }

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
          data: { method: request.method },
        },
      } as any;
    }

    return {
      jsonrpc: '2.0',
      id: request.id ?? null,
      result,
    } as JSONRPCResponse;
  } catch (error) {
    console.error('Error processing request:', error);
    return {
      jsonrpc: '2.0',
      id: request.id ?? null,
      error: {
        code: -32603,
        message: 'Internal error',
        data: error instanceof Error ? error.message : 'Unknown error',
      },
    } as any;
  }
}

// Routes
const apiPrefix = process.env.MCP_API_PREFIX || '/mcp';

// Health check - no auth required
app.get(`${apiPrefix}/health`, (req, res) => {
  res.json({
    status: 'ok',
    protocol: 'MCP/1.0',
    transport: 'streamable-http',
    clients: sseClients.size,
    timestamp: new Date().toISOString(),
    auth: {
      enabled: authConfig.enabled,
      mode: authConfig.mode,
      issuer: authConfig.issuer,
    },
  });
});

// SSE endpoint - with auth
app.get(`${apiPrefix}/sse`, authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const clientId = Math.random().toString(36).substring(7);

  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': '*',
  });

  // Create client with auth info
  const client: SSEClient = {
    id: clientId,
    response: res,
    isAlive: true,
    createdAt: new Date(),
    lastActivity: new Date(),
    auth: req.auth
      ? {
          sub: req.auth.sub,
          scopes: req.auth.scopes,
          roles: req.auth.roles,
        }
      : undefined,
  };

  sseClients.set(clientId, client);

  // Send initial connection event
  res.write(
    `event: connected\ndata: ${JSON.stringify({
      clientId,
      protocol: 'MCP/1.0',
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
      },
      auth: client.auth,
      timestamp: new Date().toISOString(),
    })}\n\n`,
  );

  // Handle disconnect
  req.on('close', () => {
    sseClients.delete(clientId);
    console.log(`SSE client disconnected: ${clientId}`);
  });

  req.on('error', (error) => {
    console.error(`SSE client error ${clientId}:`, error);
    sseClients.delete(clientId);
  });

  console.log(`SSE client connected: ${clientId} (${client.auth?.sub || 'anonymous'})`);
});

// Message endpoint - with auth
app.post(
  `${apiPrefix}/message`,
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const request = req.body as JSONRPCRequest;

      if (!request || request.jsonrpc !== '2.0' || !request.method) {
        res.status(400).json({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32600,
            message: 'Invalid Request',
          },
        });
        return;
      }

      const response = await processJSONRPCRequest(request, req.auth);
      res.json(response);

      // Broadcast to SSE clients (only to those with matching auth)
      for (const [_, client] of sseClients) {
        try {
          // In production, you might want to filter by auth context
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
          data: error instanceof Error ? error.message : 'Unknown error',
        },
      });
    }
  },
);

// Batch endpoint - with auth
app.post(`${apiPrefix}/batch`, authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const requests = req.body as JSONRPCRequest[];

    if (!Array.isArray(requests) || requests.length === 0) {
      res.status(400).json({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32600,
          message: 'Invalid batch request',
        },
      });
      return;
    }

    const responses = await Promise.all(
      requests.map((request) => processJSONRPCRequest(request, req.auth)),
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
        data: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
});

// Start heartbeat for SSE clients
setInterval(() => {
  const now = new Date();
  for (const [clientId, client] of sseClients) {
    if (client.isAlive) {
      try {
        client.response.write(
          `event: heartbeat\ndata: ${JSON.stringify({
            timestamp: now.toISOString(),
          })}\n\n`,
        );
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
    console.error('Hgraph MCP Server (OAuth 2.1) running');
    console.error(`Protocol: MCP ${PROTOCOL_VERSION}`);
    console.error(`URL: http://${host}:${port}${apiPrefix}`);
    console.error('Endpoints:');
    console.error(`  - Discovery: GET /.well-known/oauth-authorization-server`);
    console.error(`  - Health: GET ${apiPrefix}/health`);
    console.error(`  - SSE Stream: GET ${apiPrefix}/sse`);
    console.error(`  - Message: POST ${apiPrefix}/message`);
    console.error(`  - Batch: POST ${apiPrefix}/batch`);
    console.error('OAuth Endpoints:');
    console.error(`  - Login: GET /auth/login`);
    console.error(`  - Callback: GET /auth/callback`);
    console.error(`  - Logout: POST /auth/logout`);
    if (authConfig.enableDCR) {
      console.error(`  - DCR: POST /register`);
    }
    console.error('Capabilities: Tools, Resources, Prompts');
    console.error('Transport: Streamable HTTP with SSE');
    console.error(
      `Authorization: ${authConfig.enabled ? `OAuth 2.1 (${authConfig.mode} mode)` : 'Disabled'}`,
    );
    if (authConfig.enabled) {
      console.error(`  - Issuer: ${authConfig.issuer}`);
      console.error(`  - JWKS: ${authConfig.jwksUri}`);
      if (authConfig.mode === 'hybrid') {
        console.error('  - Mode: Hybrid (OAuth + Basic auth fallback)');
      }
    }
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
