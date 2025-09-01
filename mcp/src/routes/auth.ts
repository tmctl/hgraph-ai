/**
 * Authentication routes for magic link system
 */

import { Router, Request, Response } from 'express';
import * as crypto from 'crypto';
import { userStore } from '../models/user.js';
import { sendMagicCode, sendWelcomeEmail, logEmailAttempt } from '../services/email.js';

const router = Router();

// Test route
router.get('/test', (req: Request, res: Response) => {
  res.json({ message: 'Auth routes are working!' });
});

/**
 * Request magic link code
 * POST /auth/request-code
 */
router.post('/request-code', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email || typeof email !== 'string') {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    // Normalize email
    const normalizedEmail = email.toLowerCase().trim();

    // Get IP address for logging
    const ipAddress = req.headers['x-forwarded-for'] as string || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    // Check if there's an existing unused code
    const existingCode = await userStore.findMagicCode(normalizedEmail);
    if (existingCode && !existingCode.used && existingCode.expires_at > new Date()) {
      res.status(429).json({ 
        error: 'Code already sent', 
        message: 'Please check your email or wait a few minutes before requesting a new code' 
      });
      return;
    }

    // Create new magic code
    const magicCode = await userStore.createMagicCode(normalizedEmail, ipAddress, userAgent);

    // Send email with code
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

/**
 * Verify magic link code
 * POST /auth/verify-code
 */
router.post('/verify-code', async (req: Request, res: Response) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      res.status(400).json({ error: 'Email and code are required' });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Verify the code
    const isValid = await userStore.verifyMagicCode(normalizedEmail, code);

    if (!isValid) {
      logEmailAttempt(normalizedEmail, 'failed', 'Invalid or expired code');
      res.status(401).json({ error: 'Invalid or expired code' });
      return;
    }

    // Find or create user
    let user = await userStore.findUserByEmail(normalizedEmail);
    const isNewUser = !user;

    if (!user) {
      user = await userStore.createUser(normalizedEmail);
      await sendWelcomeEmail(normalizedEmail);
    }

    // Log successful authentication
    logEmailAttempt(normalizedEmail, 'success', isNewUser ? 'New user created' : 'Existing user');

    // Generate OAuth tokens
    const accessToken = crypto.randomBytes(32).toString('hex');
    const refreshToken = crypto.randomBytes(32).toString('hex');

    // Store tokens (simplified for now - in production, use proper OAuth flow)
    await userStore.createAccessToken(
      accessToken,
      'web-client',
      user.id,
      ['read', 'write'],
    );

    const accessTokenRecord = await userStore.findAccessToken(accessToken);
    if (accessTokenRecord) {
      await userStore.createRefreshToken(refreshToken, accessTokenRecord.id);
    }

    // Set session cookie
    res.cookie('session_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 1000, // 1 hour
    });

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
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

/**
 * Logout
 * POST /auth/logout
 */
router.post('/logout', (req: Request, res: Response) => {
  res.clearCookie('session_token');
  res.json({ success: true, message: 'Logged out successfully' });
});

/**
 * Get current user
 * GET /auth/me
 */
router.get('/me', async (req: Request, res: Response) => {
  try {
    // Get token from cookie or Authorization header
    const cookieToken = req.cookies?.session_token;
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    
    const token = cookieToken || bearerToken;

    if (!token) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    // Find access token
    const accessToken = await userStore.findAccessToken(token);
    if (!accessToken || accessToken.expires_at < new Date()) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    // Get user
    const user = await userStore.findUserById(accessToken.user_id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      verified: user.verified,
    });
  } catch (error) {
    console.error('Error in /me:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Clean up expired codes and tokens periodically
 */
setInterval(async () => {
  try {
    await userStore.cleanupMagicCodes();
    await userStore.cleanupExpiredTokens();
  } catch (error) {
    console.error('Error in cleanup:', error);
  }
}, 5 * 60 * 1000); // Every 5 minutes

export default router;