/**
 * SSE (Server-Sent Events) Transport for MCP
 *
 * Implements the MCP protocol over HTTP using Server-Sent Events
 * for proper streaming communication as per MCP specification.
 */

import { EventEmitter } from 'events';
import { Request, Response } from 'express';
import { JSONRPCRequest, JSONRPCNotification } from '@modelcontextprotocol/sdk/types.js';

// Define a proper JSONRPCResponse type that includes error responses
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

export interface SSEConnection {
  id: string;
  response: Response;
  request: Request;
  isAlive: boolean;
  userId?: string;
  createdAt: Date;
  lastActivity: Date;
}

export class SSETransport extends EventEmitter {
  private connections: Map<string, SSEConnection> = new Map();
  private heartbeatInterval: NodeJS.Timeout;

  constructor() {
    super();

    // Send heartbeat every 30 seconds to keep connections alive
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, 30000);
  }

  /**
   * Handle new SSE connection
   */
  handleConnection(req: Request, res: Response, connectionId: string): void {
    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable Nginx buffering
    });

    // Create connection object
    const connection: SSEConnection = {
      id: connectionId,
      response: res,
      request: req,
      isAlive: true,
      userId: req.headers['x-user-id'] as string,
      createdAt: new Date(),
      lastActivity: new Date(),
    };

    // Store connection
    this.connections.set(connectionId, connection);

    // Send initial connection event
    this.sendEvent(connectionId, 'connected', {
      connectionId,
      protocol: '1.0.0',
      timestamp: new Date().toISOString(),
    });

    // Handle connection close
    req.on('close', () => {
      this.handleDisconnection(connectionId);
    });

    // Handle connection error
    req.on('error', (error) => {
      console.error(`SSE connection error for ${connectionId}:`, error);
      this.handleDisconnection(connectionId);
    });

    // Emit connection event
    this.emit('connection', connection);
  }

  /**
   * Handle disconnection
   */
  private handleDisconnection(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.isAlive = false;
      this.connections.delete(connectionId);
      this.emit('disconnection', connection);
    }
  }

  /**
   * Send event to specific connection
   */
  sendEvent(connectionId: string, event: string, data: any): boolean {
    const connection = this.connections.get(connectionId);
    if (!connection || !connection.isAlive) {
      return false;
    }

    try {
      const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      connection.response.write(message);
      connection.lastActivity = new Date();
      return true;
    } catch (error) {
      console.error(`Failed to send event to ${connectionId}:`, error);
      this.handleDisconnection(connectionId);
      return false;
    }
  }

  /**
   * Send JSON-RPC response
   */
  sendResponse(connectionId: string, response: JSONRPCResponse): boolean {
    return this.sendEvent(connectionId, 'message', response);
  }

  /**
   * Send JSON-RPC notification
   */
  sendNotification(connectionId: string, notification: JSONRPCNotification): boolean {
    return this.sendEvent(connectionId, 'notification', notification);
  }

  /**
   * Send error response
   */
  sendError(connectionId: string, id: string | number | null, error: JSONRPCError): boolean {
    const response: JSONRPCResponse = {
      jsonrpc: '2.0',
      id: id ?? null,
      error,
    };
    return this.sendResponse(connectionId, response);
  }

  /**
   * Broadcast event to all connections
   */
  broadcast(event: string, data: any): void {
    for (const [connectionId] of this.connections) {
      this.sendEvent(connectionId, event, data);
    }
  }

  /**
   * Send heartbeat to keep connections alive
   */
  private sendHeartbeat(): void {
    const now = new Date();
    const timeout = 60000; // 1 minute timeout

    for (const [connectionId, connection] of this.connections) {
      if (now.getTime() - connection.lastActivity.getTime() > timeout) {
        // Connection timed out
        this.handleDisconnection(connectionId);
      } else {
        // Send heartbeat
        this.sendEvent(connectionId, 'heartbeat', {
          timestamp: now.toISOString(),
        });
      }
    }
  }

  /**
   * Get active connections count
   */
  getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * Get connection by ID
   */
  getConnection(connectionId: string): SSEConnection | undefined {
    return this.connections.get(connectionId);
  }

  /**
   * Close all connections and cleanup
   */
  close(): void {
    clearInterval(this.heartbeatInterval);

    for (const [connectionId] of this.connections) {
      this.sendEvent(connectionId, 'close', {
        reason: 'Server shutting down',
      });
      this.handleDisconnection(connectionId);
    }
  }
}
