/**
 * OAuth 2.0 Provider Routes
 */

import { Router, Request, Response } from 'express';
import { userStore } from '../models/user.js';
import { requireAuth } from './user-auth.js';
import {
  generateAuthCode,
  generateAccessToken,
  generateRefreshToken,
  isValidRedirectUri,
  verifySessionToken,
} from '../utils/auth.js';

const router = Router();

/**
 * GET /authorize - OAuth authorization endpoint
 * Shows authorization page to user
 */
router.get('/authorize', async (req: Request, res: Response) => {
  try {
    const { client_id, redirect_uri, response_type = 'code', scope = 'read', state } = req.query;

    // Validate required parameters
    if (!client_id || !redirect_uri) {
      res.status(400).json({
        error: 'invalid_request',
        message: 'Missing required parameters: client_id, redirect_uri',
      });
      return;
    }

    if (response_type !== 'code') {
      res.status(400).json({
        error: 'unsupported_response_type',
        message: 'Only "code" response type is supported',
      });
      return;
    }

    // Validate client
    const client = await userStore.findClientById(client_id as string);
    if (!client) {
      res.status(400).json({
        error: 'invalid_client',
        message: 'Unknown client_id',
      });
      return;
    }

    // Validate redirect URI
    if (!client.redirect_uris.includes(redirect_uri as string)) {
      res.status(400).json({
        error: 'invalid_redirect_uri',
        message: 'Redirect URI not registered for this client',
      });
      return;
    }

    if (!isValidRedirectUri(redirect_uri as string)) {
      res.status(400).json({
        error: 'invalid_redirect_uri',
        message: 'Invalid redirect URI format',
      });
      return;
    }

    // Check if user is authenticated
    const sessionToken = req.cookies.session;
    if (!sessionToken) {
      // Redirect to login with OAuth context
      const loginUrl = `/auth/login?client_id=${client_id}&redirect_uri=${encodeURIComponent(redirect_uri as string)}&scope=${scope}&state=${state || ''}`;
      res.redirect(loginUrl);
      return;
    }

    const session = verifySessionToken(sessionToken);
    if (!session) {
      const loginUrl = `/auth/login?client_id=${client_id}&redirect_uri=${encodeURIComponent(redirect_uri as string)}&scope=${scope}&state=${state || ''}`;
      res.redirect(loginUrl);
      return;
    }

    // Show authorization page
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Authorize ${client.name}</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 500px; margin: 50px auto; padding: 20px; }
            .app-info { background: #f5f5f5; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
            .permissions { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0; }
            .buttons { text-align: center; margin-top: 30px; }
            button { padding: 12px 30px; margin: 0 10px; border: none; border-radius: 5px; cursor: pointer; font-size: 16px; }
            .approve { background: #28a745; color: white; }
            .deny { background: #dc3545; color: white; }
            .approve:hover { background: #218838; }
            .deny:hover { background: #c82333; }
          </style>
        </head>
        <body>
          <div class="app-info">
            <h2>Authorize Application</h2>
            <p><strong>${client.name}</strong> wants to access your account.</p>
          </div>
          
          <div class="permissions">
            <h3>This application will be able to:</h3>
            <ul>
              ${scope
                .toString()
                .split(' ')
                .map((s) => `<li>Access your ${s} data</li>`)
                .join('')}
            </ul>
          </div>
          
          <div class="buttons">
            <form method="POST" action="/oauth/authorize" style="display: inline;">
              <input type="hidden" name="client_id" value="${client_id}">
              <input type="hidden" name="redirect_uri" value="${redirect_uri}">
              <input type="hidden" name="scope" value="${scope}">
              <input type="hidden" name="state" value="${state || ''}">
              <input type="hidden" name="action" value="approve">
              <button type="submit" class="approve">Authorize</button>
            </form>
            
            <form method="POST" action="/oauth/authorize" style="display: inline;">
              <input type="hidden" name="client_id" value="${client_id}">
              <input type="hidden" name="redirect_uri" value="${redirect_uri}">
              <input type="hidden" name="state" value="${state || ''}">
              <input type="hidden" name="action" value="deny">
              <button type="submit" class="deny">Deny</button>
            </form>
          </div>
        </body>
      </html>
    `);
  } catch (error: any) {
    console.error('OAuth authorize error:', error);
    res.status(500).json({
      error: 'server_error',
      message: 'Internal server error',
    });
  }
});

/**
 * POST /authorize - Handle authorization decision
 */
router.post('/authorize', async (req: Request, res: Response) => {
  try {
    const { client_id, redirect_uri, scope, state, action } = req.body;

    // Check authentication
    const sessionToken = req.cookies.session;
    if (!sessionToken) {
      res.status(401).json({
        error: 'not_authenticated',
        message: 'User not authenticated',
      });
      return;
    }

    const session = verifySessionToken(sessionToken);
    if (!session) {
      res.status(401).json({
        error: 'invalid_session',
        message: 'Invalid session',
      });
      return;
    }

    if (action === 'deny') {
      // User denied authorization
      const errorUrl = new URL(redirect_uri);
      errorUrl.searchParams.set('error', 'access_denied');
      errorUrl.searchParams.set('error_description', 'User denied authorization');
      if (state) errorUrl.searchParams.set('state', state);

      res.redirect(errorUrl.toString());
      return;
    }

    // User approved, generate authorization code
    const authCode = generateAuthCode();
    const scopes = scope ? scope.split(' ') : ['read'];

    await userStore.createAuthCode(authCode, client_id, session.userId, redirect_uri, scopes);

    // Redirect back to client with authorization code
    const successUrl = new URL(redirect_uri);
    successUrl.searchParams.set('code', authCode);
    if (state) successUrl.searchParams.set('state', state);

    res.redirect(successUrl.toString());
  } catch (error: any) {
    console.error('OAuth authorize POST error:', error);
    res.status(500).json({
      error: 'server_error',
      message: 'Internal server error',
    });
  }
});

/**
 * POST /token - OAuth token exchange endpoint
 */
router.post('/token', async (req: Request, res: Response) => {
  try {
    const { grant_type, code, redirect_uri, client_id, client_secret, refresh_token } = req.body;

    if (!grant_type) {
      res.status(400).json({
        error: 'invalid_request',
        message: 'Missing grant_type',
      });
      return;
    }

    // Validate client credentials
    const client = await userStore.findClientById(client_id);
    if (!client || client.client_secret !== client_secret) {
      res.status(401).json({
        error: 'invalid_client',
        message: 'Invalid client credentials',
      });
      return;
    }

    if (grant_type === 'authorization_code') {
      // Exchange authorization code for tokens
      if (!code || !redirect_uri) {
        res.status(400).json({
          error: 'invalid_request',
          message: 'Missing code or redirect_uri',
        });
        return;
      }

      const authCode = await userStore.findAuthCode(code);
      if (
        !authCode ||
        authCode.used ||
        authCode.expires_at < new Date() ||
        authCode.client_id !== client_id ||
        authCode.redirect_uri !== redirect_uri
      ) {
        res.status(400).json({
          error: 'invalid_grant',
          message: 'Invalid or expired authorization code',
        });
        return;
      }

      // Mark code as used
      await userStore.markAuthCodeUsed(code);

      // Generate tokens
      const accessToken = generateAccessToken();
      const refreshToken = generateRefreshToken();

      const dbAccessToken = await userStore.createAccessToken(
        accessToken,
        client_id,
        authCode.user_id,
        authCode.scopes,
      );

      await userStore.createRefreshToken(refreshToken, dbAccessToken.id);

      res.json({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 3600, // 1 hour
        refresh_token: refreshToken,
        scope: authCode.scopes.join(' '),
      });
      return;
    }

    if (grant_type === 'refresh_token') {
      // Refresh access token
      if (!refresh_token) {
        res.status(400).json({
          error: 'invalid_request',
          message: 'Missing refresh_token',
        });
        return;
      }

      const dbRefreshToken = await userStore.findRefreshToken(refresh_token);
      if (!dbRefreshToken || dbRefreshToken.expires_at < new Date()) {
        res.status(400).json({
          error: 'invalid_grant',
          message: 'Invalid or expired refresh token',
        });
        return;
      }

      // Find the original access token to get user and scope info
      const originalAccessToken = await userStore.findAccessToken(dbRefreshToken.access_token_id);
      if (!originalAccessToken) {
        res.status(400).json({
          error: 'invalid_grant',
          message: 'Associated access token not found',
        });
        return;
      }

      // Generate new access token
      const newAccessToken = generateAccessToken();
      await userStore.createAccessToken(
        newAccessToken,
        client_id,
        originalAccessToken.user_id,
        originalAccessToken.scopes,
      );

      res.json({
        access_token: newAccessToken,
        token_type: 'Bearer',
        expires_in: 3600,
        scope: originalAccessToken.scopes.join(' '),
      });
      return;
    }

    res.status(400).json({
      error: 'unsupported_grant_type',
      message: 'Only authorization_code and refresh_token grant types are supported',
    });
  } catch (error: any) {
    console.error('OAuth token error:', error);
    res.status(500).json({
      error: 'server_error',
      message: 'Internal server error',
    });
  }
});

/**
 * GET /userinfo - OAuth userinfo endpoint
 */
router.get('/userinfo', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: 'invalid_token',
        message: 'Missing or invalid authorization header',
      });
      return;
    }

    const accessToken = authHeader.substring(7);
    const dbAccessToken = await userStore.findAccessToken(accessToken);

    if (!dbAccessToken || dbAccessToken.expires_at < new Date()) {
      res.status(401).json({
        error: 'invalid_token',
        message: 'Invalid or expired access token',
      });
      return;
    }

    const user = await userStore.findUserById(dbAccessToken.user_id);
    if (!user) {
      res.status(404).json({
        error: 'user_not_found',
        message: 'User not found',
      });
      return;
    }

    res.json({
      sub: user.id,
      email: user.email,
      name: user.name,
      verified: user.verified,
      scope: dbAccessToken.scopes.join(' '),
    });
  } catch (error: any) {
    console.error('OAuth userinfo error:', error);
    res.status(500).json({
      error: 'server_error',
      message: 'Internal server error',
    });
  }
});

export default router;
