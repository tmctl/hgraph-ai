/**
 * OAuth client management routes
 */

import { Router, Request, Response } from 'express';
import { userStore } from '../models/user.js';
import { requireAuth } from './user-auth.js';
import { generateSecureToken, isValidRedirectUri } from '../utils/auth.js';
import crypto from 'crypto';

const router = Router();

/**
 * GET /clients - List user's OAuth clients
 */
router.get('/clients', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;

    // Get all data and filter by user
    const allData = await userStore.getAllData();
    const userClients = allData.clients.filter((client) => client.user_id === user.userId);

    res.json({
      clients: userClients.map((client) => ({
        id: client.id,
        client_id: client.client_id,
        name: client.name,
        redirect_uris: client.redirect_uris,
        scopes: client.scopes,
        created_at: client.created_at,
        // Don't return client_secret for security
      })),
    });
  } catch (error: any) {
    console.error('List clients error:', error);
    res.status(500).json({
      error: 'server_error',
      message: 'Internal server error',
    });
  }
});

/**
 * POST /clients - Create new OAuth client
 */
router.post('/clients', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { name, redirect_uris, scopes } = req.body;

    // Validation
    if (!name || !redirect_uris || !Array.isArray(redirect_uris)) {
      res.status(400).json({
        error: 'invalid_request',
        message: 'Missing required fields: name, redirect_uris (array)',
      });
      return;
    }

    if (redirect_uris.length === 0) {
      res.status(400).json({
        error: 'invalid_request',
        message: 'At least one redirect URI is required',
      });
      return;
    }

    // Validate all redirect URIs
    for (const uri of redirect_uris) {
      if (!isValidRedirectUri(uri)) {
        res.status(400).json({
          error: 'invalid_redirect_uri',
          message: `Invalid redirect URI: ${uri}`,
        });
        return;
      }
    }

    // Generate client credentials
    const clientId = crypto.randomUUID();
    const clientSecret = generateSecureToken(48);

    // Create client
    const client = await userStore.createClient(
      clientId,
      clientSecret,
      name,
      redirect_uris,
      user.userId,
      scopes || ['read'],
    );

    res.status(201).json({
      success: true,
      message: 'OAuth client created successfully',
      client: {
        id: client.id,
        client_id: client.client_id,
        client_secret: client.client_secret, // Only returned on creation
        name: client.name,
        redirect_uris: client.redirect_uris,
        scopes: client.scopes,
        created_at: client.created_at,
      },
    });
  } catch (error: any) {
    console.error('Create client error:', error);
    res.status(500).json({
      error: 'server_error',
      message: 'Internal server error',
    });
  }
});

export default router;
