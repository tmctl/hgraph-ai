/**
 * User authentication routes (registration, login, logout)
 */

import { Router, Request, Response } from 'express';
import { userStore } from '../models/user.js';
import {
  hashPassword,
  verifyPassword,
  isValidEmail,
  createSessionToken,
  verifySessionToken,
} from '../utils/auth.js';

const router = Router();

/**
 * POST /register - User registration
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;

    // Validation
    if (!email || !password) {
      res.status(400).json({
        error: 'missing_fields',
        message: 'Email and password are required',
      });
      return;
    }

    if (!isValidEmail(email)) {
      res.status(400).json({
        error: 'invalid_email',
        message: 'Please provide a valid email address',
      });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({
        error: 'weak_password',
        message: 'Password must be at least 6 characters long',
      });
      return;
    }

    // Check if user already exists
    const existingUser = await userStore.findUserByEmail(email);
    if (existingUser) {
      res.status(409).json({
        error: 'user_exists',
        message: 'A user with this email already exists',
      });
      return;
    }

    // Create user
    const passwordHash = await hashPassword(password);
    const user = await userStore.createUser(email, passwordHash, name);

    // Create session token
    const sessionToken = createSessionToken(user.id, user.email);

    // Set secure cookie
    res.cookie('session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        verified: user.verified,
      },
    });
  } catch (error: any) {
    console.error('Registration error:', error);
    res.status(500).json({
      error: 'server_error',
      message: 'Internal server error',
    });
  }
});

/**
 * POST /login - User login
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      res.status(400).json({
        error: 'missing_fields',
        message: 'Email and password are required',
      });
      return;
    }

    // Find user
    const user = await userStore.findUserByEmail(email);
    if (!user) {
      res.status(401).json({
        error: 'invalid_credentials',
        message: 'Invalid email or password',
      });
      return;
    }

    // Verify password
    const isValidPassword = await verifyPassword(password, user.password_hash);
    if (!isValidPassword) {
      res.status(401).json({
        error: 'invalid_credentials',
        message: 'Invalid email or password',
      });
      return;
    }

    // Create session token
    const sessionToken = createSessionToken(user.id, user.email);

    // Set secure cookie
    res.cookie('session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });

    res.json({
      success: true,
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        verified: user.verified,
      },
    });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'server_error',
      message: 'Internal server error',
    });
  }
});

/**
 * POST /logout - User logout
 */
router.post('/logout', (req: Request, res: Response) => {
  res.clearCookie('session');
  res.json({
    success: true,
    message: 'Logged out successfully',
  });
});

/**
 * GET /me - Get current user info
 */
router.get('/me', async (req: Request, res: Response) => {
  try {
    const sessionToken = req.cookies.session;
    if (!sessionToken) {
      res.status(401).json({
        error: 'not_authenticated',
        message: 'No session found',
      });
      return;
    }

    const session = verifySessionToken(sessionToken);
    if (!session) {
      res.status(401).json({
        error: 'invalid_session',
        message: 'Invalid or expired session',
      });
      return;
    }

    const user = await userStore.findUserById(session.userId);
    if (!user) {
      res.status(404).json({
        error: 'user_not_found',
        message: 'User not found',
      });
      return;
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        verified: user.verified,
      },
    });
  } catch (error: any) {
    console.error('Get user error:', error);
    res.status(500).json({
      error: 'server_error',
      message: 'Internal server error',
    });
  }
});

/**
 * Middleware to require authentication
 */
export function requireAuth(req: Request, res: Response, next: any) {
  const sessionToken = req.cookies.session;
  if (!sessionToken) {
    res.status(401).json({
      error: 'not_authenticated',
      message: 'Authentication required',
    });
    return;
  }

  const session = verifySessionToken(sessionToken);
  if (!session) {
    res.status(401).json({
      error: 'invalid_session',
      message: 'Invalid or expired session',
    });
    return;
  }

  // Add user info to request
  (req as any).user = session;
  next();
}

export default router;
