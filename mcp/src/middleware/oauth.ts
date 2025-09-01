/**
 * OAuth 2.0 Middleware for MCP Server
 * 
 * Implements OAuth 2.0 Bearer Token authentication with support for
 * multiple providers and token introspection.
 */

import { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import { createHash, randomBytes } from 'crypto';

// OAuth Configuration
interface OAuthConfig {
  enabled: boolean;
  providers: {
    [key: string]: {
      issuer: string;
      audience: string;
      jwksUri?: string;
      introspectionEndpoint?: string;
      clientId?: string;
      clientSecret?: string;
    };
  };
  tokenCacheTimeout: number;
  requiredScopes: string[];
}

// Token Cache
interface CachedToken {
  valid: boolean;
  userId?: string;
  scopes: string[];
  expiresAt: number;
  provider: string;
}

const tokenCache = new Map<string, CachedToken>();

/**
 * Get OAuth configuration from environment
 */
function getOAuthConfig(): OAuthConfig {
  return {
    enabled: process.env.OAUTH_ENABLED === 'true',
    providers: {
      google: {
        issuer: 'https://accounts.google.com',
        audience: process.env.OAUTH_GOOGLE_CLIENT_ID || '',
        jwksUri: 'https://www.googleapis.com/oauth2/v3/certs',
        introspectionEndpoint: 'https://oauth2.googleapis.com/tokeninfo',
      },
      auth0: {
        issuer: process.env.OAUTH_AUTH0_DOMAIN || '',
        audience: process.env.OAUTH_AUTH0_AUDIENCE || '',
        jwksUri: process.env.OAUTH_AUTH0_JWKS_URI || '',
        clientId: process.env.OAUTH_AUTH0_CLIENT_ID || '',
        clientSecret: process.env.OAUTH_AUTH0_CLIENT_SECRET || '',
      },
      custom: {
        issuer: process.env.OAUTH_CUSTOM_ISSUER || '',
        audience: process.env.OAUTH_CUSTOM_AUDIENCE || '',
        introspectionEndpoint: process.env.OAUTH_CUSTOM_INTROSPECTION_ENDPOINT || '',
        clientId: process.env.OAUTH_CUSTOM_CLIENT_ID || '',
        clientSecret: process.env.OAUTH_CUSTOM_CLIENT_SECRET || '',
      },
    },
    tokenCacheTimeout: parseInt(process.env.OAUTH_CACHE_TIMEOUT || '300') * 1000, // 5 minutes default
    requiredScopes: (process.env.OAUTH_REQUIRED_SCOPES || 'mcp:read,mcp:tools').split(','),
  };
}

/**
 * Extract Bearer token from Authorization header
 */
function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
  
  return parts[1];
}

/**
 * Generate cache key for token
 */
function getCacheKey(token: string): string {
  return createHash('sha256').update(token).digest('hex').substring(0, 16);
}

/**
 * Validate token with Google OAuth
 */
async function validateGoogleToken(token: string): Promise<CachedToken | null> {
  try {
    const response = await axios.get(
      `https://oauth2.googleapis.com/tokeninfo?access_token=${token}`,
      { timeout: 5000 }
    );
    
    const data = response.data;
    
    if (data.error) {
      console.warn('Google token validation failed:', data.error);
      return null;
    }
    
    // Check audience if configured
    const config = getOAuthConfig();
    if (config.providers.google.audience && data.aud !== config.providers.google.audience) {
      console.warn('Google token audience mismatch');
      return null;
    }
    
    return {
      valid: true,
      userId: data.email || data.sub,
      scopes: data.scope ? data.scope.split(' ') : [],
      expiresAt: Date.now() + (data.expires_in * 1000),
      provider: 'google',
    };
  } catch (error) {
    console.error('Google token validation error:', error);
    return null;
  }
}

/**
 * Validate token with Auth0
 */
async function validateAuth0Token(token: string): Promise<CachedToken | null> {
  const config = getOAuthConfig();
  const provider = config.providers.auth0;
  
  if (!provider.clientId || !provider.clientSecret) {
    console.error('Auth0 client credentials not configured');
    return null;
  }
  
  try {
    // Use token introspection
    const introspectionUrl = `${provider.issuer}/oauth/introspect`;
    
    const response = await axios.post(
      introspectionUrl,
      new URLSearchParams({
        token,
        token_type_hint: 'access_token',
      }),
      {
        auth: {
          username: provider.clientId,
          password: provider.clientSecret,
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 5000,
      }
    );
    
    const data = response.data;
    
    if (!data.active) {
      return null;
    }
    
    // Check audience
    if (provider.audience && !data.aud?.includes(provider.audience)) {
      console.warn('Auth0 token audience mismatch');
      return null;
    }
    
    return {
      valid: true,
      userId: data.sub,
      scopes: data.scope ? data.scope.split(' ') : [],
      expiresAt: data.exp * 1000,
      provider: 'auth0',
    };
  } catch (error) {
    console.error('Auth0 token validation error:', error);
    return null;
  }
}

/**
 * Validate token with custom OAuth provider
 */
async function validateCustomToken(token: string): Promise<CachedToken | null> {
  const config = getOAuthConfig();
  const provider = config.providers.custom;
  
  if (!provider.introspectionEndpoint) {
    console.error('Custom OAuth introspection endpoint not configured');
    return null;
  }
  
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
    };
    
    // Add authentication if configured
    const authOptions: any = { timeout: 5000 };
    if (provider.clientId && provider.clientSecret) {
      authOptions.auth = {
        username: provider.clientId,
        password: provider.clientSecret,
      };
    }
    
    const response = await axios.post(
      provider.introspectionEndpoint,
      new URLSearchParams({
        token,
        token_type_hint: 'access_token',
      }),
      {
        headers,
        ...authOptions,
      }
    );
    
    const data = response.data;
    
    if (!data.active) {
      return null;
    }
    
    return {
      valid: true,
      userId: data.sub || data.username || data.client_id,
      scopes: data.scope ? data.scope.split(' ') : [],
      expiresAt: data.exp ? data.exp * 1000 : Date.now() + (3600 * 1000), // 1 hour default
      provider: 'custom',
    };
  } catch (error) {
    console.error('Custom OAuth token validation error:', error);
    return null;
  }
}

/**
 * Validate OAuth token
 */
async function validateToken(token: string): Promise<CachedToken | null> {
  // Check cache first
  const cacheKey = getCacheKey(token);
  const cached = tokenCache.get(cacheKey);
  
  if (cached && cached.expiresAt > Date.now()) {
    return cached;
  }
  
  // Try each configured provider
  const config = getOAuthConfig();
  
  for (const [providerName, provider] of Object.entries(config.providers)) {
    if (!provider.issuer && !provider.introspectionEndpoint) continue;
    
    let result: CachedToken | null = null;
    
    try {
      switch (providerName) {
        case 'google':
          if (provider.audience) {
            result = await validateGoogleToken(token);
          }
          break;
          
        case 'auth0':
          if (provider.issuer && provider.clientId) {
            result = await validateAuth0Token(token);
          }
          break;
          
        case 'custom':
          if (provider.introspectionEndpoint) {
            result = await validateCustomToken(token);
          }
          break;
      }
      
      if (result && result.valid) {
        // Cache the result
        tokenCache.set(cacheKey, result);
        
        // Clean up expired tokens periodically
        if (Math.random() < 0.1) { // 10% chance
          cleanupExpiredTokens();
        }
        
        return result;
      }
    } catch (error) {
      console.error(`Error validating token with ${providerName}:`, error);
      continue;
    }
  }
  
  // Cache failed validation briefly to prevent spam
  const failedResult: CachedToken = {
    valid: false,
    scopes: [],
    expiresAt: Date.now() + 60000, // Cache failure for 1 minute
    provider: 'none',
  };
  tokenCache.set(cacheKey, failedResult);
  
  return null;
}

/**
 * Check if token has required scopes
 */
function hasRequiredScopes(tokenScopes: string[], requiredScopes: string[]): boolean {
  if (requiredScopes.length === 0) return true;
  
  return requiredScopes.some(required => {
    // Support wildcard scopes
    if (required.endsWith('*')) {
      const prefix = required.slice(0, -1);
      return tokenScopes.some(scope => scope.startsWith(prefix));
    }
    
    return tokenScopes.includes(required);
  });
}

/**
 * Clean up expired tokens from cache
 */
function cleanupExpiredTokens(): void {
  const now = Date.now();
  for (const [key, token] of tokenCache.entries()) {
    if (token.expiresAt <= now) {
      tokenCache.delete(key);
    }
  }
}

/**
 * OAuth middleware
 */
export function oauthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const config = getOAuthConfig();
  
  // Skip if OAuth not enabled
  if (!config.enabled) {
    return next();
  }
  
  // Skip auth for health check and root info endpoint
  if (req.path === '/health' || (req.path === '/' && req.method === 'GET')) {
    return next();
  }
  
  const token = extractBearerToken(req);
  
  if (!token) {
    res.status(401).json({
      error: 'oauth_required',
      message: 'OAuth Bearer token required',
      authUrl: process.env.OAUTH_AUTH_URL || '/auth',
    });
    return;
  }
  
  // Validate token asynchronously
  validateToken(token)
    .then(tokenInfo => {
      if (!tokenInfo || !tokenInfo.valid) {
        res.status(401).json({
          error: 'invalid_token',
          message: 'Invalid or expired OAuth token',
        });
        return;
      }
      
      // Check required scopes
      if (!hasRequiredScopes(tokenInfo.scopes, config.requiredScopes)) {
        res.status(403).json({
          error: 'insufficient_scope',
          message: 'Token does not have required scopes',
          requiredScopes: config.requiredScopes,
          providedScopes: tokenInfo.scopes,
        });
        return;
      }
      
      // Add user info to request
      (req as any).user = {
        id: tokenInfo.userId,
        scopes: tokenInfo.scopes,
        provider: tokenInfo.provider,
      };
      
      next();
    })
    .catch(error => {
      console.error('OAuth validation error:', error);
      res.status(500).json({
        error: 'oauth_error',
        message: 'OAuth validation failed',
      });
    });
}

/**
 * Generate OAuth state parameter for security
 */
export function generateOAuthState(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Validate OAuth state parameter
 */
export function validateOAuthState(provided: string, expected: string): boolean {
  return provided === expected;
}

/**
 * Get OAuth authorization URL
 */
export function getAuthorizationUrl(provider: string, redirectUri: string, state: string): string {
  const config = getOAuthConfig();
  const providerConfig = config.providers[provider];
  
  if (!providerConfig) {
    throw new Error(`Unknown OAuth provider: ${provider}`);
  }
  
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: providerConfig.clientId || '',
    redirect_uri: redirectUri,
    scope: config.requiredScopes.join(' '),
    state,
  });
  
  let authUrl = '';
  switch (provider) {
    case 'google':
      authUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
      break;
    case 'auth0':
      authUrl = `${providerConfig.issuer}/authorize`;
      break;
    case 'custom':
      authUrl = process.env.OAUTH_CUSTOM_AUTH_URL || '';
      break;
    default:
      throw new Error(`Authorization URL not configured for provider: ${provider}`);
  }
  
  return `${authUrl}?${params.toString()}`;
}

/**
 * Get current OAuth configuration (for debugging)
 */
export function getOAuthStatus(): any {
  const config = getOAuthConfig();
  
  return {
    enabled: config.enabled,
    providers: Object.keys(config.providers).filter(name => {
      const provider = config.providers[name];
      return provider.issuer || provider.introspectionEndpoint;
    }),
    cacheSize: tokenCache.size,
    requiredScopes: config.requiredScopes,
  };
}