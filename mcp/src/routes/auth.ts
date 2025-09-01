/**
 * Authentication routes for OAuth 2.0 flow
 */

import { Router, Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { 
  generateOAuthState, 
  validateOAuthState, 
  getAuthorizationUrl,
  getOAuthStatus 
} from '../middleware/oauth.js';
import { getAuthStatus } from '../middleware/auth.js';
import axios from 'axios';

const router = Router();

// In-memory state storage (use Redis/database in production)
const stateStore = new Map<string, { 
  state: string; 
  provider: string; 
  redirectUri: string; 
  createdAt: number; 
}>();

// Clean up expired states periodically
setInterval(() => {
  const now = Date.now();
  const expiry = 10 * 60 * 1000; // 10 minutes
  
  for (const [key, value] of stateStore.entries()) {
    if (now - value.createdAt > expiry) {
      stateStore.delete(key);
    }
  }
}, 60000); // Run every minute

/**
 * GET /auth/status - Get authentication configuration
 */
router.get('/status', (req: Request, res: Response) => {
  const status = {
    ...getAuthStatus(),
    endpoints: {
      authorize: '/auth/authorize',
      callback: '/auth/callback',
      logout: '/auth/logout',
    },
    supportedProviders: ['google', 'auth0', 'custom'],
  };
  
  res.json(status);
});

/**
 * GET /auth/authorize - Start OAuth flow
 */
router.get('/authorize', (req: Request, res: Response) => {
  const { provider = 'google', redirect_uri } = req.query;
  
  if (typeof provider !== 'string' || !['google', 'auth0', 'custom'].includes(provider)) {
    res.status(400).json({
      error: 'invalid_provider',
      message: 'Supported providers: google, auth0, custom',
    });
    return;
  }
  
  const redirectUri = redirect_uri as string || process.env.OAUTH_DEFAULT_REDIRECT_URI || '';
  if (!redirectUri) {
    res.status(400).json({
      error: 'missing_redirect_uri',
      message: 'redirect_uri parameter is required',
    });
    return;
  }
  
  try {
    const state = generateOAuthState();
    const sessionId = randomBytes(16).toString('hex');
    
    // Store state
    stateStore.set(sessionId, {
      state,
      provider,
      redirectUri,
      createdAt: Date.now(),
    });
    
    // Get authorization URL
    const authUrl = getAuthorizationUrl(provider, redirectUri, state);
    
    res.json({
      authUrl,
      state,
      sessionId,
      provider,
      expiresIn: 600, // 10 minutes
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'oauth_error',
      message: error.message,
    });
  }
});

/**
 * POST /auth/callback - Handle OAuth callback
 */
router.post('/callback', async (req: Request, res: Response) => {
  const { code, state, sessionId, error, error_description } = req.body;
  
  if (error) {
    res.status(400).json({
      error: 'oauth_error',
      message: error_description || error,
    });
    return;
  }
  
  if (!code || !state || !sessionId) {
    res.status(400).json({
      error: 'invalid_request',
      message: 'Missing required parameters: code, state, sessionId',
    });
    return;
  }
  
  // Validate state
  const storedSession = stateStore.get(sessionId);
  if (!storedSession) {
    res.status(400).json({
      error: 'invalid_session',
      message: 'Session expired or invalid',
    });
    return;
  }
  
  if (!validateOAuthState(state, storedSession.state)) {
    res.status(400).json({
      error: 'invalid_state',
      message: 'State parameter mismatch',
    });
    return;
  }
  
  try {
    // Exchange code for token
    const tokenResponse = await exchangeCodeForToken(
      storedSession.provider,
      code,
      storedSession.redirectUri
    );
    
    // Clean up state
    stateStore.delete(sessionId);
    
    res.json({
      access_token: tokenResponse.access_token,
      token_type: tokenResponse.token_type || 'Bearer',
      expires_in: tokenResponse.expires_in,
      scope: tokenResponse.scope,
      provider: storedSession.provider,
    });
  } catch (error: any) {
    console.error('Token exchange error:', error);
    res.status(500).json({
      error: 'token_exchange_failed',
      message: 'Failed to exchange authorization code for token',
    });
  }
});

/**
 * POST /auth/logout - Logout (invalidate token)
 */
router.post('/logout', (req: Request, res: Response) => {
  // For OAuth tokens, we can't really "logout" on the server side
  // since tokens are validated with the OAuth provider
  // Client should discard the token
  
  res.json({
    message: 'Logged out successfully',
    instruction: 'Discard your access token on the client side',
  });
});

/**
 * Exchange authorization code for access token
 */
async function exchangeCodeForToken(
  provider: string,
  code: string,
  redirectUri: string
): Promise<any> {
  const config = {
    google: {
      tokenUrl: 'https://oauth2.googleapis.com/token',
      clientId: process.env.OAUTH_GOOGLE_CLIENT_ID,
      clientSecret: process.env.OAUTH_GOOGLE_CLIENT_SECRET,
    },
    auth0: {
      tokenUrl: `${process.env.OAUTH_AUTH0_DOMAIN}/oauth/token`,
      clientId: process.env.OAUTH_AUTH0_CLIENT_ID,
      clientSecret: process.env.OAUTH_AUTH0_CLIENT_SECRET,
    },
    custom: {
      tokenUrl: process.env.OAUTH_CUSTOM_TOKEN_URL,
      clientId: process.env.OAUTH_CUSTOM_CLIENT_ID,
      clientSecret: process.env.OAUTH_CUSTOM_CLIENT_SECRET,
    },
  };
  
  const providerConfig = config[provider as keyof typeof config];
  if (!providerConfig || !providerConfig.tokenUrl) {
    throw new Error(`Token URL not configured for provider: ${provider}`);
  }
  
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: providerConfig.clientId || '',
    client_secret: providerConfig.clientSecret || '',
  });
  
  const response = await axios.post(
    providerConfig.tokenUrl,
    params,
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      timeout: 10000,
    }
  );
  
  if (response.data.error) {
    throw new Error(response.data.error_description || response.data.error);
  }
  
  return response.data;
}

export default router;