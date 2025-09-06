/**
 * Streamable HTTP Transport for MCP
 *
 * Implements the MCP protocol over HTTP with Server-Sent Events (SSE)
 * for streaming responses as per the MCP specification:
 * https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http
 */

import { EventEmitter } from 'events';
import express, { Request, Response, Application } from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import {
  JSONRPCRequest,
  JSONRPCNotification,
  JSONRPCResponse,
  JSONRPCError,
} from '@modelcontextprotocol/sdk/types.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { randomUUID } from 'crypto';

interface StreamableHTTPTransportOptions {
  port?: number;
  host?: string;
  corsOrigin?: string | string[];
  apiPrefix?: string;
  maxBodySize?: string;
}

interface SSEClient {
  id: string;
  response: Response;
  isAlive: boolean;
  createdAt: Date;
  lastActivity: Date;
}

export class StreamableHTTPTransport extends EventEmitter {
  private app: Application;
  private server: any;
  private sseClients: Map<string, SSEClient> = new Map();
  private mcpServer?: Server;
  private heartbeatInterval?: NodeJS.Timeout;
  private options: Required<StreamableHTTPTransportOptions>;
  private messageHandler?: (message: any) => Promise<any>;

  constructor(options: StreamableHTTPTransportOptions = {}) {
    super();

    this.options = {
      port: options.port ?? 3001,
      host: options.host ?? 'localhost',
      corsOrigin: options.corsOrigin ?? '*',
      apiPrefix: options.apiPrefix ?? '/mcp',
      maxBodySize: options.maxBodySize ?? '10mb',
    };

    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // CORS configuration
    this.app.use(
      cors({
        origin: this.options.corsOrigin,
        methods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
        credentials: true,
      }),
    );

    // Body parser for JSON requests
    this.app.use(bodyParser.json({ limit: this.options.maxBodySize }));
    this.app.use(bodyParser.urlencoded({ extended: true, limit: this.options.maxBodySize }));

    // Request logging middleware
    this.app.use((req, res, next) => {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
      next();
    });
  }

  private setupRoutes(): void {
    const prefix = this.options.apiPrefix;

    // Health check endpoint
    this.app.get(`${prefix}/health`, (req, res) => {
      res.json({
        status: 'ok',
        protocol: 'MCP/1.0',
        transport: 'streamable-http',
        clients: this.sseClients.size,
        timestamp: new Date().toISOString(),
      });
    });

    // SSE endpoint for streaming responses
    this.app.get(`${prefix}/sse`, (req, res) => {
      this.handleSSEConnection(req, res);
    });

    // Regular HTTP endpoint for request-response
    this.app.post(`${prefix}/message`, async (req, res) => {
      await this.handleHTTPMessage(req, res);
    });

    // Batch request endpoint
    this.app.post(`${prefix}/batch`, async (req, res) => {
      await this.handleBatchRequest(req, res);
    });
  }

  private handleSSEConnection(req: Request, res: Response): void {
    const clientId = randomUUID();

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable Nginx buffering
      'Access-Control-Allow-Origin': '*',
    });

    // Create client object
    const client: SSEClient = {
      id: clientId,
      response: res,
      isAlive: true,
      createdAt: new Date(),
      lastActivity: new Date(),
    };

    // Store client
    this.sseClients.set(clientId, client);

    // Send initial connection event
    this.sendSSEEvent(client, 'connected', {
      clientId,
      protocol: 'MCP/1.0',
      capabilities: {},
      timestamp: new Date().toISOString(),
    });

    // Handle client disconnect
    req.on('close', () => {
      this.handleSSEDisconnection(clientId);
    });

    req.on('error', (error) => {
      console.error(`SSE client error ${clientId}:`, error);
      this.handleSSEDisconnection(clientId);
    });

    console.log(`SSE client connected: ${clientId}`);
  }

  private handleSSEDisconnection(clientId: string): void {
    const client = this.sseClients.get(clientId);
    if (client) {
      client.isAlive = false;
      this.sseClients.delete(clientId);
      console.log(`SSE client disconnected: ${clientId}`);
    }
  }

  private sendSSEEvent(client: SSEClient, event: string, data: any): boolean {
    if (!client.isAlive) {
      return false;
    }

    try {
      let message = '';
      if (event) {
        message += `event: ${event}\n`;
      }
      message += `data: ${JSON.stringify(data)}\n\n`;

      client.response.write(message);
      client.lastActivity = new Date();
      return true;
    } catch (error) {
      console.error(`Failed to send SSE event to ${client.id}:`, error);
      this.handleSSEDisconnection(client.id);
      return false;
    }
  }

  private async handleHTTPMessage(req: Request, res: Response): Promise<void> {
    try {
      const request = req.body as JSONRPCRequest;

      if (!this.validateJSONRPCRequest(request)) {
        res
          .status(400)
          .json(this.createErrorResponse(request?.id ?? null, -32600, 'Invalid Request'));
        return;
      }

      // Process the request through MCP server
      const response = await this.processRequest(request);
      res.json(response);
    } catch (error) {
      console.error('Error handling HTTP message:', error);
      res
        .status(500)
        .json(
          this.createErrorResponse(
            null,
            -32603,
            'Internal error',
            error instanceof Error ? error.message : 'Unknown error',
          ),
        );
    }
  }

  private async handleBatchRequest(req: Request, res: Response): Promise<void> {
    try {
      const requests = req.body as JSONRPCRequest[];

      if (!Array.isArray(requests) || requests.length === 0) {
        res.status(400).json(this.createErrorResponse(null, -32600, 'Invalid batch request'));
        return;
      }

      // Process all requests in parallel
      const responses = await Promise.all(requests.map((request) => this.processRequest(request)));

      res.json(responses);
    } catch (error) {
      console.error('Error handling batch request:', error);
      res
        .status(500)
        .json(
          this.createErrorResponse(
            null,
            -32603,
            'Internal error',
            error instanceof Error ? error.message : 'Unknown error',
          ),
        );
    }
  }

  private async processRequest(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    try {
      // Emit the request for the MCP server to handle
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Request timeout'));
        }, 30000); // 30 second timeout

        // Store the resolve callback for this request ID
        const requestId = request.id || `req_${Date.now()}`;
        
        // Emit the message for the MCP server to handle
        this.emit('message', {
          jsonrpc: request.jsonrpc,
          id: requestId,
          method: request.method,
          params: request.params,
        });
        
        // Set up a one-time listener for the response
        const responseHandler = (response: JSONRPCResponse) => {
          if (response.id === requestId) {
            clearTimeout(timeout);
            this.removeListener('response', responseHandler);
            resolve(response);
          }
        };
        
        this.on('response', responseHandler);
      });
    } catch (error) {
      return this.createErrorResponse(
        request.id ?? null,
        -32603,
        'Internal error',
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }

  private validateJSONRPCRequest(request: any): boolean {
    return (
      request &&
      typeof request === 'object' &&
      request.jsonrpc === '2.0' &&
      typeof request.method === 'string'
    );
  }

  private createErrorResponse(
    id: string | number | null,
    code: number,
    message: string,
    data?: any,
  ): JSONRPCResponse {
    const response: any = {
      jsonrpc: '2.0',
      id: id ?? null,
      error: {
        code,
        message,
        data,
      },
    };
    return response as JSONRPCResponse;
  }

  private startHeartbeat(): void {
    // Send heartbeat every 30 seconds
    this.heartbeatInterval = setInterval(() => {
      const now = new Date();
      const timeout = 60000; // 1 minute timeout

      for (const [clientId, client] of this.sseClients) {
        if (now.getTime() - client.lastActivity.getTime() > timeout) {
          // Client timed out
          this.handleSSEDisconnection(clientId);
        } else {
          // Send heartbeat
          this.sendSSEEvent(client, 'heartbeat', {
            timestamp: now.toISOString(),
          });
        }
      }
    }, 30000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }
  }

  // Transport interface implementation
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(this.options.port, this.options.host, () => {
          console.log(
            `Streamable HTTP transport listening on http://${this.options.host}:${this.options.port}`,
          );
          this.startHeartbeat();
          resolve();
        });

        this.server.on('error', (error: Error) => {
          console.error('Server error:', error);
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async close(): Promise<void> {
    this.stopHeartbeat();

    // Close all SSE connections
    for (const [clientId, client] of this.sseClients) {
      this.sendSSEEvent(client, 'close', {
        reason: 'Server shutting down',
      });
      this.handleSSEDisconnection(clientId);
    }

    // Close the HTTP server
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('Streamable HTTP transport closed');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  // Send a response to all connected SSE clients
  async send(message: JSONRPCResponse | JSONRPCNotification): Promise<void> {
    for (const [_, client] of this.sseClients) {
      this.sendSSEEvent(client, 'message', message);
    }
  }

  // Set the MCP server reference
  setServer(server: Server): void {
    this.mcpServer = server;
  }
  
  // Set message handler for processing requests
  setMessageHandler(handler: (message: any) => Promise<any>): void {
    this.messageHandler = handler;
  }

  // Get transport statistics
  getStats(): {
    connectedClients: number;
    uptime: number;
    totalRequests: number;
  } {
    return {
      connectedClients: this.sseClients.size,
      uptime: process.uptime(),
      totalRequests: 0, // TODO: Implement request counting
    };
  }
}
