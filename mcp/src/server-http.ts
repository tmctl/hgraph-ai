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
import cookieParser from 'cookie-parser';
import { join } from 'path';
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
  rateLimitMiddleware,
  corsOptions,
  securityHeaders,
  initializeAuth,
} from './middleware/auth.js';
import { listResources, listResourceTemplates, readResource } from './resources/index.js';
import { listPrompts, getPrompt } from './prompts/index.js';
import { tools, handleToolCall } from './tools/index.js';
// Import auth dependencies
import * as crypto from 'crypto';
import { userStore } from './models/user.js';
import { sendMagicCode, sendWelcomeEmail, logEmailAttempt } from './services/email.js';

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
app.use(cookieParser());
app.use(securityHeaders);

// Authentication routes (inline to avoid module issues)
app.post('/auth/request-code', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string') {
      res.status(400).json({ error: 'Email is required' });
      return;
    }
    const normalizedEmail = email.toLowerCase().trim();
    const ipAddress = req.headers['x-forwarded-for'] as string || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    const existingCode = await userStore.findMagicCode(normalizedEmail);
    if (existingCode && !existingCode.used && existingCode.expires_at > new Date()) {
      res.status(429).json({ 
        error: 'Code already sent', 
        message: 'Please check your email or wait a few minutes before requesting a new code' 
      });
      return;
    }
    const magicCode = await userStore.createMagicCode(normalizedEmail, ipAddress, userAgent);
    const emailSent = await sendMagicCode(normalizedEmail, magicCode.code, ipAddress);
    if (!emailSent) {
      res.status(500).json({ error: 'Failed to send email' });
      return;
    }
    res.json({ 
      success: true, 
      message: 'Magic code sent to your email. Please check your inbox.' 
    });
  } catch (error) {
    console.error('Error in request-code:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/auth/verify-code', async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      res.status(400).json({ error: 'Email and code are required' });
      return;
    }
    const normalizedEmail = email.toLowerCase().trim();
    const isValid = await userStore.verifyMagicCode(normalizedEmail, code);
    if (!isValid) {
      logEmailAttempt(normalizedEmail, 'failed', 'Invalid or expired code');
      res.status(401).json({ error: 'Invalid or expired code' });
      return;
    }
    let user = await userStore.findUserByEmail(normalizedEmail);
    const isNewUser = !user;
    if (!user) {
      user = await userStore.createUser(normalizedEmail);
      await sendWelcomeEmail(normalizedEmail);
    }
    logEmailAttempt(normalizedEmail, 'success', isNewUser ? 'New user created' : 'Existing user');
    const accessToken = crypto.randomBytes(32).toString('hex');
    const refreshToken = crypto.randomBytes(32).toString('hex');
    await userStore.createAccessToken(accessToken, 'web-client', user.id, ['read', 'write']);
    const accessTokenRecord = await userStore.findAccessToken(accessToken);
    if (accessTokenRecord) {
      await userStore.createRefreshToken(refreshToken, accessTokenRecord.id);
    }
    res.cookie('session_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 1000,
    });
    res.json({
      success: true,
      user: { id: user.id, email: user.email, name: user.name },
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'Bearer',
      expires_in: 3600,
    });
  } catch (error) {
    console.error('Error in verify-code:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Serve static files from public directory
app.use(express.static(join(process.cwd(), 'public')));

// Import additional routes

// User authentication API routes

// OAuth client management API routes

// OAuth provider routes

// OAuth discovery endpoints (public, no auth required)
app.get('/.well-known/oauth-authorization-server', (req, res) => {
  res.json({
    issuer: `${req.protocol}://${req.get('host')}`,
    authorization_endpoint: `${req.protocol}://${req.get('host')}/auth/authorize`,
    token_endpoint: `${req.protocol}://${req.get('host')}/auth/callback`,
    userinfo_endpoint: `${req.protocol}://${req.get('host')}/auth/userinfo`,
    registration_endpoint: `${req.protocol}://${req.get('host')}/register`,
    scopes_supported: ['read', 'write', 'admin'],
    response_types_supported: ['code', 'token'],
    grant_types_supported: ['authorization_code', 'client_credentials'],
    token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
    service_documentation: `${req.protocol}://${req.get('host')}/docs`,
  });
});

app.get('/.well-known/oauth-protected-resource', (req, res) => {
  res.json({
    resource_server: `${req.protocol}://${req.get('host')}`,
    authorization_servers: [`${req.protocol}://${req.get('host')}`],
    scopes_supported: ['read', 'write', 'admin'],
    bearer_methods_supported: ['header', 'body', 'query'],
    resource_documentation: `${req.protocol}://${req.get('host')}/docs`,
  });
});

// Dynamic client registration endpoint (public)
app.post('/register', (req, res) => {
  const { client_name, client_uri, redirect_uris, grant_types, response_types } = req.body;

  // Generate client credentials
  const clientId = crypto.randomUUID();
  const clientSecret = crypto.randomBytes(32).toString('hex');

  res.json({
    client_id: clientId,
    client_secret: clientSecret,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_secret_expires_at: 0, // Never expires
    client_name: client_name || 'MCP Client',
    client_uri: client_uri,
    redirect_uris: redirect_uris || [`${req.protocol}://${req.get('host')}/callback`],
    grant_types: grant_types || ['authorization_code'],
    response_types: response_types || ['code'],
    token_endpoint_auth_method: 'client_secret_post',
  });
});

/**
 * Root POST endpoint - Handle MCP client registration/initialization (BEFORE auth middleware)
 */
app.post('/', async (req, res) => {
  // Handle MCP JSON-RPC requests directly for Claude.ai web
  if (req.body && (req.body.jsonrpc === '2.0' || req.body.method)) {
    try {
      const request = req.body;
      
      // Handle initialize request
      if (request.method === 'initialize') {
        // Accept any protocol version for now
        const clientVersion = request.params?.protocolVersion || '1.0.0';
        res.json({
          jsonrpc: '2.0',
          id: request.id,
          result: {
            protocolVersion: clientVersion, // Echo back the client's version
            capabilities: {
              tools: {
                listChanged: false
              },
              resources: {
                listChanged: false
              },
              prompts: {
                listChanged: false
              }
            },
            serverInfo: {
              name: 'hgraph-mcp-server',
              version: '1.0.0',
            },
          },
        });
        return;
      }
      
      // Handle tool list request
      if (request.method === 'tools/list') {
        const toolsList = Object.values(tools).map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema
        }));
        res.json({
          jsonrpc: '2.0',
          id: request.id,
          result: {
            tools: toolsList
          }
        });
        return;
      }
      
      // Handle tool call request
      if (request.method === 'tools/call') {
        const { name, arguments: args } = request.params;
        const result = await handleToolCall(name, args);
        res.json({
          jsonrpc: '2.0',
          id: request.id,
          result
        });
        return;
      }
      
      // Handle other MCP requests via the server
      const response = await mcpServer.handleRequest(request);
      res.json(response);
      return;
    } catch (error: any) {
      res.json({
        jsonrpc: '2.0',
        id: req.body.id || null,
        error: {
          code: -32603,
          message: error.message || 'Internal error',
        },
      });
      return;
    }
  }

  // Default response for other POST requests
  res.json({
    message: 'MCP Server Root Endpoint',
    server: 'hgraph-mcp-server',
    version: '1.0.0',
    protocol: PROTOCOL_VERSION,
    instructions: 'Use GET / for server info, or /sse for MCP connections',
  });
});

// Login page is now served by static middleware at root

// Apply authentication and rate limiting to protected routes (AFTER OAuth routes)
// Authentication is now handled per-route via magic link system
app.use(rateLimitMiddleware);

// Connection storage
const connections = new Map<
  string,
  {
    initialized: boolean;
    capabilities: any;
    userId?: string;
    userAuthorized?: boolean;
    authorizedAt?: string;
  }
>();

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
      register: '/register',
      discovery: '/.well-known/oauth-authorization-server',
    },
    authentication: {
      methods: ['api-token', 'oauth2'],
      oauth: process.env.OAUTH_ENABLED === 'true',
      discovery: {
        oauth_authorization_server: '/.well-known/oauth-authorization-server',
        oauth_protected_resource: '/.well-known/oauth-protected-resource',
      },
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
    userAuthorized: false,
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
 * Check if connector requires user authorization
 */
async function checkConnectorAuthorizationRequired(params: any): Promise<boolean> {
  // Always require authorization for new connections
  // In production, this could check user preferences, connector settings, etc.
  const clientInfo = params?.clientInfo as any;
  const isClaudeClient = clientInfo?.name === 'claude' || clientInfo?.name?.includes('claude');

  // Always prompt for Claude connections to ensure user consent
  return isClaudeClient || !process.env.SKIP_USER_AUTHORIZATION;
}

/**
 * Handle user authorization response
 */
async function handleUserAuthorization(
  params: any,
  connection: any,
): Promise<{ authorized: boolean; reason?: string }> {
  const { action, permissions } = params;

  if (action === 'authorize' && permissions) {
    // Validate that all required permissions are granted
    const requiredPermissions = [
      'read_accounts',
      'read_transactions',
      'read_tokens',
      'read_network_stats',
      'execute_graphql',
    ];

    const grantedPermissions = new Set(permissions);
    const hasAllRequired = requiredPermissions.every((p) => grantedPermissions.has(p));

    if (hasAllRequired) {
      connection.userAuthorized = true;
      connection.authorizedAt = new Date().toISOString();
      return { authorized: true };
    } else {
      return {
        authorized: false,
        reason: 'Insufficient permissions granted',
      };
    }
  }

  return {
    authorized: false,
    reason: 'Authorization denied by user',
  };
}

/**
 * Handle MCP protocol requests
 */
async function handleRequest(
  request: JSONRPCRequest,
  connection: any,
): Promise<JSONRPCResponse | null> {
  const { method, params, id } = request;

  switch (method) {
    case 'initialize':
      // Check if connector requires user authorization
      const requiresAuth = await checkConnectorAuthorizationRequired(params);

      if (requiresAuth && !connection.userAuthorized) {
        // Return authorization prompt response
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32001,
            message: 'User authorization required',
            data: {
              type: 'authorization_prompt',
              title: 'Authorize Hgraph MCP Server',
              description:
                'This connector will access Hedera blockchain data through Hgraph APIs. It can read account information, transactions, tokens, and other blockchain data.',
              permissions: [
                'Read account balances and information',
                'Query transaction history',
                'Access token metadata and balances',
                'Retrieve network statistics',
                'Execute GraphQL queries on Hedera data',
              ],
              capabilities: {
                tools: Object.keys(tools).length,
                resources: ['Account data', 'Transaction data', 'Token data', 'Network statistics'],
                prompts: ['Blockchain analysis', 'Account summary', 'Transaction analysis'],
              },
              authorizationUrl: `/auth/authorize?connector=hgraph-mcp&client_id=${(params?.clientInfo as any)?.name || 'claude'}`,
              prompt: 'Do you want to allow this connector to access Hedera blockchain data?',
            },
          },
        };
      }

      connection.initialized = true;
      connection.capabilities = params?.capabilities || {};
      connection.userAuthorized = true; // Set after successful auth check

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

    case 'connector/authorize':
      // Handle user authorization response
      const authResult = await handleUserAuthorization(params, connection);

      if (authResult.authorized) {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            authorized: true,
            message: 'Connector authorized successfully',
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
      } else {
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32002,
            message: 'Authorization failed',
            data: {
              reason: authResult.reason,
              type: 'authorization_denied',
            },
          },
        };
      }

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

      const toolResult = await handleToolCall(params?.name as string, params?.arguments as any);

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
              text:
                typeof resourceData.content === 'string'
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
        params?.arguments as Record<string, string>,
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
