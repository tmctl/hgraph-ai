/**
 * Authentication utilities
 */

import crypto from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(crypto.scrypt);

/**
 * Hash a password using scrypt
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(32).toString('hex');
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString('hex')}`;
}

/**
 * Verify a password against its hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    const [salt, storedHash] = hash.split(':');
    const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
    return storedHash === derivedKey.toString('hex');
  } catch (error) {
    return false;
  }
}

/**
 * Generate a secure random token
 */
export function generateSecureToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Generate OAuth authorization code
 */
export function generateAuthCode(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Generate OAuth access token
 */
export function generateAccessToken(): string {
  return crypto.randomBytes(48).toString('base64url');
}

/**
 * Generate OAuth refresh token
 */
export function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString('base64url');
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate redirect URI
 */
export function isValidRedirectUri(uri: string): boolean {
  try {
    const url = new URL(uri);
    // Allow http for localhost in development
    return (
      url.protocol === 'https:' ||
      (url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1'))
    );
  } catch {
    return false;
  }
}

/**
 * Create a JWT-like session token (simple implementation)
 */
export function createSessionToken(userId: string, email: string): string {
  const header = Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'HS256' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub: userId,
      email,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60, // 24 hours
    }),
  ).toString('base64url');

  const secret = process.env.JWT_SECRET || 'default-secret-change-in-production';
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${payload}`)
    .digest('base64url');

  return `${header}.${payload}.${signature}`;
}

/**
 * Verify and decode session token
 */
export function verifySessionToken(token: string): { userId: string; email: string } | null {
  try {
    const [header, payload, signature] = token.split('.');
    if (!header || !payload || !signature) return null;

    const secret = process.env.JWT_SECRET || 'default-secret-change-in-production';
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(`${header}.${payload}`)
      .digest('base64url');

    if (signature !== expectedSignature) return null;

    const decodedPayload = JSON.parse(Buffer.from(payload, 'base64url').toString());

    // Check expiration
    if (decodedPayload.exp < Math.floor(Date.now() / 1000)) return null;

    return {
      userId: decodedPayload.sub,
      email: decodedPayload.email,
    };
  } catch {
    return null;
  }
}
