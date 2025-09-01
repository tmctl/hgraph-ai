/**
 * Authentication and Rate Limiting Middleware
 * 
 * Provides security for the MCP HTTP server with support for
 * both API tokens and OAuth 2.0 Bearer tokens
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { oauthMiddleware, getOAuthStatus } from './oauth.js';

// Rate limiting storage
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Token storage (in production, use a proper database or cache)
const validTokens = new Set<string>();

// Configuration
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 100; // 100 requests per minute
const TOKEN_HEADER = 'x-api-token';
const USER_ID_HEADER = 'x-user-id';

/**
 * Initialize authentication tokens
 */
export function initializeAuth(): void {
  // Generate initial API tokens from environment
  const tokens = process.env.MCP_API_TOKENS?.split(',') || [];
  
  if (tokens.length === 0) {
    // Generate a default token if none provided
    const defaultToken = crypto.randomBytes(32).toString('hex');
    console.log('================================================');
    console.log('WARNING: No API tokens configured!');
    console.log('Generated temporary token:', defaultToken);
    console.log('Set MCP_API_TOKENS environment variable for production');
    console.log('================================================');
    validTokens.add(defaultToken);
  } else {
    tokens.forEach(token => validTokens.add(token.trim()));
    console.log(`Loaded ${tokens.length} API tokens`);
  }
}

/**
 * Validate API token
 */
export function validateToken(token: string): boolean {
  return validTokens.has(token);
}

/**
 * Add a new API token
 */
export function addToken(token: string): void {
  validTokens.add(token);
}

/**
 * Remove an API token
 */
export function removeToken(token: string): boolean {
  return validTokens.delete(token);
}

/**
 * Combined authentication middleware
 * Supports both API tokens and OAuth 2.0
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip auth for health check and root info endpoint
  if (req.path === '/health' || (req.path === '/' && req.method === 'GET')) {
    return next();
  }
  
  // Check for OAuth Bearer token first
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return oauthMiddleware(req, res, next);
  }
  
  // Fall back to API token authentication
  const apiToken = req.headers[TOKEN_HEADER] as string;
  
  if (!apiToken) {
    res.status(401).json({
      error: 'Authentication required',
      message: `Missing ${TOKEN_HEADER} header or Authorization Bearer token`,
      supportedMethods: ['api-token', 'oauth2'],
    });
    return;
  }
  
  if (!validateToken(apiToken)) {
    res.status(403).json({
      error: 'Invalid token',
      message: 'The provided API token is invalid',
    });
    return;
  }
  
  // Extract user ID if provided
  const userId = req.headers[USER_ID_HEADER] as string;
  if (userId) {
    (req as any).userId = userId;
  }
  
  // Mark as API token authentication
  (req as any).authType = 'api-token';
  
  next();
}

/**
 * Rate limiting middleware
 */
export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip rate limiting for SSE connections
  if (req.path === '/sse') {
    return next();
  }
  
  // Use token or IP as identifier
  const token = req.headers[TOKEN_HEADER] as string;
  const identifier = token || req.ip || 'unknown';
  
  const now = Date.now();
  const entry = rateLimitStore.get(identifier);
  
  if (!entry || entry.resetTime < now) {
    // Create new entry
    rateLimitStore.set(identifier, {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW,
    });
    
    // Clean up old entries
    for (const [key, value] of rateLimitStore.entries()) {
      if (value.resetTime < now) {
        rateLimitStore.delete(key);
      }
    }
    
    return next();
  }
  
  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
    res.status(429).json({
      error: 'Rate limit exceeded',
      message: `Too many requests. Please retry after ${retryAfter} seconds`,
      retryAfter,
    });
    return;
  }
  
  entry.count++;
  next();
}

/**
 * CORS configuration for MCP
 */
export function corsOptions() {
  const allowedOrigins = process.env.MCP_ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];
  
  return {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Allow requests with no origin (e.g., Postman, curl)
      if (!origin) return callback(null, true);
      
      if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: [TOKEN_HEADER, USER_ID_HEADER, 'Content-Type', 'Authorization'],
    exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
  };
}

/**
 * Security headers middleware
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
}

/**
 * Get authentication status
 */
export function getAuthStatus(): any {
  return {
    apiTokens: {
      configured: validTokens.size > 0,
      count: validTokens.size,
    },
    oauth: getOAuthStatus(),
    rateLimiting: {
      maxRequests: RATE_LIMIT_MAX_REQUESTS,
      windowMs: RATE_LIMIT_WINDOW,
      activeEntries: rateLimitStore.size,
    },
  };
}