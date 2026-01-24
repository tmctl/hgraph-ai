/**
 * OAuth 2.1 / OIDC Middleware for MCP Server
 * Implements JWT validation with JWKS support
 */

import { Request, Response, NextFunction } from 'express';
import jwt, { JwtPayload, VerifyOptions } from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { promisify } from 'util';

export interface AuthConfig {
  enabled: boolean;
  mode: 'oauth2' | 'basic' | 'hybrid';
  issuer: string;
  audience: string;
  jwksUri: string;
  allowedAlgorithms: string[];
  clockSkewSeconds: number;
  jwksCacheTTLSeconds: number;
  scopeToRoleMap: Record<string, string>;
  // Legacy basic auth token for hybrid mode
  basicToken?: string;
}

export interface AuthenticatedRequest extends Request {
  auth?: {
    sub: string;
    scopes: string[];
    roles: string[];
    token: JwtPayload;
  };
}

// JWKS client with caching
let jwksClientInstance: jwksClient.JwksClient | null = null;

function getJwksClient(config: AuthConfig): jwksClient.JwksClient {
  if (!jwksClientInstance) {
    jwksClientInstance = jwksClient({
      jwksUri: config.jwksUri,
      cache: true,
      cacheMaxEntries: 5,
      cacheMaxAge: config.jwksCacheTTLSeconds * 1000,
      rateLimit: true,
      jwksRequestsPerMinute: 10,
    });
  }
  return jwksClientInstance;
}

// Get signing key from JWKS
async function getSigningKey(kid: string, config: AuthConfig): Promise<string> {
  const client = getJwksClient(config);
  const getSigningKeyAsync = promisify(client.getSigningKey.bind(client));
  const key = await getSigningKeyAsync(kid);
  if (!key) {
    throw new Error('Signing key not found');
  }
  return key.getPublicKey();
}

// Validate JWT token
async function validateJWT(token: string, config: AuthConfig): Promise<JwtPayload> {
  // Decode token header to get kid
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded || typeof decoded === 'string') {
    throw new Error('Invalid token format');
  }

  const { header, payload } = decoded;

  // Check algorithm
  if (!config.allowedAlgorithms.includes(header.alg || '')) {
    throw new Error(`Algorithm ${header.alg} not allowed`);
  }

  // Get signing key
  const signingKey = await getSigningKey(header.kid || '', config);

  // Verify token
  const verifyOptions: VerifyOptions = {
    algorithms: config.allowedAlgorithms as jwt.Algorithm[],
    issuer: config.issuer,
    audience: config.audience,
    clockTolerance: config.clockSkewSeconds,
  };

  return new Promise((resolve, reject) => {
    jwt.verify(token, signingKey, verifyOptions, (err, decoded) => {
      if (err) {
        reject(err);
      } else {
        resolve(decoded as JwtPayload);
      }
    });
  });
}

// Extract scopes from token
function extractScopes(token: JwtPayload): string[] {
  const scopes: string[] = [];

  // Check 'scope' claim (space-delimited)
  if (typeof token.scope === 'string') {
    scopes.push(...token.scope.split(' '));
  }

  // Check 'scopes' claim (array)
  if (Array.isArray(token.scopes)) {
    scopes.push(...token.scopes);
  }

  // Check 'scp' claim (array)
  if (Array.isArray(token.scp)) {
    scopes.push(...token.scp);
  }

  return [...new Set(scopes)]; // Remove duplicates
}

// Extract roles from token
function extractRoles(token: JwtPayload, scopeToRoleMap: Record<string, string>): string[] {
  const roles: string[] = [];

  // Map scopes to roles
  const scopes = extractScopes(token);
  scopes.forEach((scope) => {
    if (scopeToRoleMap[scope]) {
      roles.push(scopeToRoleMap[scope]);
    }
  });

  // Check realm_access.roles
  if (token.realm_access && Array.isArray(token.realm_access.roles)) {
    roles.push(...token.realm_access.roles);
  }

  // Check resource_access for client-specific roles
  if (token.resource_access && token.azp) {
    const clientRoles = token.resource_access[token.azp];
    if (clientRoles && Array.isArray(clientRoles.roles)) {
      roles.push(...clientRoles.roles);
    }
  }

  return [...new Set(roles)]; // Remove duplicates
}

// Create error response
function createErrorResponse(code: number, error: string, description?: string): any {
  return {
    jsonrpc: '2.0',
    id: null,
    error: {
      code: code === 401 ? -32001 : -32002,
      message: error,
      data: description,
    },
  };
}

// Main OAuth middleware factory
export function createOAuthMiddleware(config: AuthConfig) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // Skip auth for OPTIONS requests (CORS preflight)
    if (req.method === 'OPTIONS') {
      return next();
    }

    // Skip if auth is disabled
    if (!config.enabled) {
      return next();
    }

    const authHeader = req.headers.authorization;

    // Handle hybrid mode - accept either Bearer or Basic
    if (config.mode === 'hybrid') {
      if (authHeader?.startsWith('Basic ')) {
        // Legacy basic auth
        const token = authHeader.substring(6);
        if (token === config.basicToken) {
          console.warn('[AUTH] Basic auth used (deprecated) - please migrate to OAuth');
          req.auth = {
            sub: 'basic-auth-user',
            scopes: ['mcp.read', 'mcp.write', 'mcp.admin'],
            roles: ['reader', 'writer', 'admin'],
            token: { sub: 'basic-auth-user' } as JwtPayload,
          };
          return next();
        } else {
          res.setHeader('WWW-Authenticate', 'Basic realm="MCP Server"');
          return res
            .status(401)
            .json(
              createErrorResponse(401, 'invalid_credentials', 'Invalid basic auth credentials'),
            );
        }
      }
      // Fall through to OAuth validation
    }

    // Handle basic mode
    if (config.mode === 'basic') {
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.setHeader('WWW-Authenticate', 'Bearer realm="MCP Server"');
        return res
          .status(401)
          .json(createErrorResponse(401, 'invalid_request', 'Bearer token required'));
      }

      const token = authHeader.substring(7);
      if (token === config.basicToken) {
        req.auth = {
          sub: 'basic-auth-user',
          scopes: ['mcp.read', 'mcp.write', 'mcp.admin'],
          roles: ['reader', 'writer', 'admin'],
          token: { sub: 'basic-auth-user' } as JwtPayload,
        };
        return next();
      } else {
        res.setHeader('WWW-Authenticate', 'Bearer error="invalid_token"');
        return res
          .status(401)
          .json(createErrorResponse(401, 'invalid_token', 'Invalid bearer token'));
      }
    }

    // OAuth mode - validate JWT
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.setHeader('WWW-Authenticate', 'Bearer realm="MCP Server"');
      return res
        .status(401)
        .json(createErrorResponse(401, 'invalid_request', 'Bearer token required'));
    }

    const token = authHeader.substring(7);
    console.log('[AUTH] Validating token for request to:', req.path);

    try {
      // Validate JWT
      const decodedToken = await validateJWT(token, config);
      console.log('[AUTH] Token validated successfully, sub:', decodedToken.sub);

      // Extract scopes and roles
      const scopes = extractScopes(decodedToken);
      const roles = extractRoles(decodedToken, config.scopeToRoleMap);
      console.log('[AUTH] Scopes:', scopes, 'Roles:', roles);

      // Attach auth info to request
      req.auth = {
        sub: decodedToken.sub || '',
        scopes,
        roles,
        token: decodedToken,
      };

      next();
    } catch (error: any) {
      console.error('[AUTH] Token validation failed:', error.message);
      console.error('[AUTH] Error details:', error.stack);

      // Determine error type
      let errorType = 'invalid_token';
      let statusCode = 401;
      let description = 'Token validation failed';

      if (error.name === 'TokenExpiredError') {
        errorType = 'invalid_token';
        description = 'Token has expired';
      } else if (error.name === 'JsonWebTokenError') {
        if (error.message.includes('audience')) {
          errorType = 'invalid_token';
          description = 'Invalid audience';
        } else if (error.message.includes('issuer')) {
          errorType = 'invalid_token';
          description = 'Invalid issuer';
        } else {
          description = error.message;
        }
      } else if (error.message.includes('Algorithm')) {
        errorType = 'invalid_token';
        description = 'Invalid algorithm';
      }

      res.setHeader(
        'WWW-Authenticate',
        `Bearer error="${errorType}", error_description="${description}"`,
      );
      return res.status(statusCode).json(createErrorResponse(statusCode, errorType, description));
    }
  };
}

// Scope/role checking middleware
export function requireScopes(...requiredScopes: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.auth) {
      return res
        .status(401)
        .json(createErrorResponse(401, 'invalid_request', 'Authentication required'));
    }

    const hasScope = requiredScopes.some((scope) => req.auth!.scopes.includes(scope));
    if (!hasScope) {
      res.setHeader(
        'WWW-Authenticate',
        `Bearer error="insufficient_scope", scope="${requiredScopes.join(' ')}"`,
      );
      return res
        .status(403)
        .json(
          createErrorResponse(
            403,
            'insufficient_scope',
            `Required scopes: ${requiredScopes.join(', ')}`,
          ),
        );
    }

    next();
  };
}

export function requireRoles(...requiredRoles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.auth) {
      return res
        .status(401)
        .json(createErrorResponse(401, 'invalid_request', 'Authentication required'));
    }

    const hasRole = requiredRoles.some((role) => req.auth!.roles.includes(role));
    if (!hasRole) {
      return res
        .status(403)
        .json(
          createErrorResponse(
            403,
            'insufficient_permissions',
            `Required roles: ${requiredRoles.join(', ')}`,
          ),
        );
    }

    next();
  };
}
