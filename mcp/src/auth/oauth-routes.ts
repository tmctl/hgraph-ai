/**
 * OAuth 2.1 Routes and Discovery Endpoints
 * Implements discovery, PKCE flow, and DCR support
 */

import { Router, Request, Response } from 'express';
import axios from 'axios';
import crypto from 'crypto';
import { AuthConfig } from './oauth-middleware';

export interface OAuthRoutesConfig extends AuthConfig {
  discoveryBase: string;
  tokenEndpoint: string;
  authzEndpoint: string;
  registrationEndpoint: string;
  enableDCR: boolean;
  initialAccessToken?: string;
}

// PKCE utilities
export function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

// State management (in production, use Redis or similar)
const authStates = new Map<
  string,
  {
    codeVerifier: string;
    redirectUri: string;
    state: string;
    nonce?: string;
    createdAt: number;
  }
>();

// Clean up old states periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of authStates.entries()) {
    if (now - value.createdAt > 600000) {
      // 10 minutes
      authStates.delete(key);
    }
  }
}, 60000); // Every minute

export function createOAuthRoutes(config: OAuthRoutesConfig): Router {
  const router = Router();

  /**
   * Discovery Endpoint
   * Exposes OAuth metadata at .well-known/oauth-authorization-server
   */
  router.get('/.well-known/oauth-authorization-server', async (req: Request, res: Response) => {
    try {
      // Option 1: Pass through from Keycloak
      if (config.issuer.includes('keycloak')) {
        const keycloakDiscovery = await axios.get(
          `${config.issuer}/.well-known/openid-configuration`,
          { timeout: 5000 },
        );

        // Transform Keycloak's OIDC discovery to OAuth 2.1 format
        const metadata = {
          issuer: config.issuer,
          authorization_endpoint:
            keycloakDiscovery.data.authorization_endpoint || config.authzEndpoint,
          token_endpoint: keycloakDiscovery.data.token_endpoint || config.tokenEndpoint,
          jwks_uri: keycloakDiscovery.data.jwks_uri || config.jwksUri,
          registration_endpoint: config.enableDCR
            ? keycloakDiscovery.data.registration_endpoint || config.registrationEndpoint
            : undefined,
          scopes_supported: keycloakDiscovery.data.scopes_supported || [
            'openid',
            'profile',
            'email',
            'mcp.read',
            'mcp.write',
            'mcp.admin',
          ],
          response_types_supported: keycloakDiscovery.data.response_types_supported || [
            'code',
            'token',
            'id_token',
            'code token',
            'code id_token',
            'token id_token',
            'code token id_token',
          ],
          grant_types_supported: keycloakDiscovery.data.grant_types_supported || [
            'authorization_code',
            'refresh_token',
            'client_credentials',
          ],
          token_endpoint_auth_methods_supported: keycloakDiscovery.data
            .token_endpoint_auth_methods_supported || [
            'client_secret_basic',
            'client_secret_post',
            'private_key_jwt',
          ],
          code_challenge_methods_supported: ['S256', 'plain'],
          revocation_endpoint: keycloakDiscovery.data.revocation_endpoint,
          introspection_endpoint: keycloakDiscovery.data.introspection_endpoint,
        };

        return res.json(metadata);
      }

      // Option 2: Static metadata
      const metadata = {
        issuer: config.issuer,
        authorization_endpoint: config.authzEndpoint,
        token_endpoint: config.tokenEndpoint,
        jwks_uri: config.jwksUri,
        registration_endpoint: config.enableDCR ? config.registrationEndpoint : undefined,
        scopes_supported: ['openid', 'profile', 'email', 'mcp.read', 'mcp.write', 'mcp.admin'],
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token', 'client_credentials'],
        token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
        code_challenge_methods_supported: ['S256'],
      };

      res.json(metadata);
    } catch (error) {
      console.error('[DISCOVERY] Failed to fetch metadata:', error);
      res.status(503).json({
        error: 'temporarily_unavailable',
        error_description: 'Discovery endpoint temporarily unavailable',
      });
    }
  });

  /**
   * Authorization Code + PKCE Flow
   * Step 1: Initiate login
   */
  router.get('/auth/login', (req: Request, res: Response) => {
    const {
      client_id = 'mcp-public-client',
      redirect_uri = `${config.discoveryBase}/auth/callback`,
      scope = 'openid profile email mcp.read',
      state = crypto.randomBytes(16).toString('hex'),
      nonce = crypto.randomBytes(16).toString('hex'),
    } = req.query;

    // Generate PKCE challenge
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    // Store state for callback verification
    authStates.set(state as string, {
      codeVerifier,
      redirectUri: redirect_uri as string,
      state: state as string,
      nonce: nonce as string,
      createdAt: Date.now(),
    });

    // Build authorization URL
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: client_id as string,
      redirect_uri: redirect_uri as string,
      scope: scope as string,
      state: state as string,
      nonce: nonce as string,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    const authUrl = `${config.authzEndpoint}?${params.toString()}`;

    // Redirect to authorization server
    res.redirect(authUrl);
  });

  /**
   * Authorization Code + PKCE Flow
   * Step 2: Handle callback
   */
  router.get('/auth/callback', async (req: Request, res: Response) => {
    const { code, state, error, error_description } = req.query;

    // Handle errors from authorization server
    if (error) {
      return res.status(400).json({
        error: error as string,
        error_description: error_description as string,
      });
    }

    // Verify state
    const stateData = authStates.get(state as string);
    if (!stateData) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'Invalid or expired state',
      });
    }

    authStates.delete(state as string);

    try {
      // Exchange code for tokens
      const tokenResponse = await axios.post(
        config.tokenEndpoint,
        new URLSearchParams({
          grant_type: 'authorization_code',
          code: code as string,
          redirect_uri: stateData.redirectUri,
          client_id: 'mcp-public-client',
          code_verifier: stateData.codeVerifier,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );

      const { access_token, refresh_token, id_token, expires_in } = tokenResponse.data;

      // In a real app, you'd set secure cookies or return to the frontend
      // For now, return the tokens (never do this in production!)
      res.json({
        access_token,
        refresh_token,
        id_token,
        expires_in,
        token_type: 'Bearer',
      });
    } catch (error: any) {
      console.error('[AUTH] Token exchange failed:', error.response?.data || error.message);
      res.status(400).json({
        error: 'invalid_grant',
        error_description: 'Failed to exchange authorization code',
      });
    }
  });

  /**
   * Logout endpoint
   */
  router.post('/auth/logout', async (req: Request, res: Response) => {
    const { refresh_token } = req.body;

    if (refresh_token) {
      try {
        // Revoke refresh token if revocation endpoint is available
        const discoveryResponse = await axios.get(
          `${config.issuer}/.well-known/openid-configuration`,
        );

        if (discoveryResponse.data.revocation_endpoint) {
          await axios.post(
            discoveryResponse.data.revocation_endpoint,
            new URLSearchParams({
              token: refresh_token,
              token_type_hint: 'refresh_token',
            }),
            {
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
              },
            },
          );
        }
      } catch (error) {
        console.error('[AUTH] Token revocation failed:', error);
      }
    }

    res.json({ message: 'Logged out successfully' });
  });

  /**
   * Dynamic Client Registration (DCR)
   * Passthrough to Keycloak's registration endpoint
   */
  if (config.enableDCR) {
    router.post('/register', async (req: Request, res: Response) => {
      try {
        const headers: any = {
          'Content-Type': 'application/json',
        };

        // Use initial access token if configured
        if (config.initialAccessToken) {
          headers['Authorization'] = `Bearer ${config.initialAccessToken}`;
        }

        const registrationResponse = await axios.post(config.registrationEndpoint, req.body, {
          headers,
        });

        res.status(201).json(registrationResponse.data);
      } catch (error: any) {
        console.error('[DCR] Registration failed:', error.response?.data || error.message);

        if (error.response) {
          res.status(error.response.status).json(error.response.data);
        } else {
          res.status(500).json({
            error: 'registration_failed',
            error_description: 'Client registration failed',
          });
        }
      }
    });
  }

  /**
   * Health check for auth system
   */
  router.get('/health/auth', async (req: Request, res: Response) => {
    const health: any = {
      mode: config.mode,
      oauth_enabled: config.mode === 'oauth2' || config.mode === 'hybrid',
      issuer: config.issuer,
      discovery_url: `${config.discoveryBase}/.well-known/oauth-authorization-server`,
      dcr_enabled: config.enableDCR,
    };

    // Check JWKS endpoint
    try {
      await axios.get(config.jwksUri, { timeout: 2000 });
      health.jwks_status = 'healthy';
    } catch (error) {
      health.jwks_status = 'unhealthy';
    }

    // Check Keycloak
    if (config.issuer.includes('keycloak')) {
      try {
        await axios.get(`${config.issuer}/.well-known/openid-configuration`, { timeout: 2000 });
        health.keycloak_status = 'healthy';
      } catch (error) {
        health.keycloak_status = 'unhealthy';
      }
    }

    const isHealthy =
      health.jwks_status === 'healthy' &&
      (!config.issuer.includes('keycloak') || health.keycloak_status === 'healthy');

    res.status(isHealthy ? 200 : 503).json(health);
  });

  return router;
}
