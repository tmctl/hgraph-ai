/**
 * User model and database operations
 */

import crypto from 'crypto';

export interface User {
  id: string;
  email: string;
  name?: string;
  verified: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface MagicCode {
  id: string;
  email: string;
  code: string;
  expires_at: Date;
  used: boolean;
  ip_address?: string;
  user_agent?: string;
  created_at: Date;
}

export interface OAuthClient {
  id: string;
  client_id: string;
  client_secret: string;
  name: string;
  redirect_uris: string[];
  scopes: string[];
  user_id: string;
  created_at: Date;
}

export interface OAuthAuthorizationCode {
  id: string;
  code: string;
  client_id: string;
  user_id: string;
  redirect_uri: string;
  scopes: string[];
  expires_at: Date;
  used: boolean;
  created_at: Date;
}

export interface OAuthAccessToken {
  id: string;
  token: string;
  client_id: string;
  user_id: string;
  scopes: string[];
  expires_at: Date;
  created_at: Date;
}

export interface OAuthRefreshToken {
  id: string;
  token: string;
  access_token_id: string;
  expires_at: Date;
  created_at: Date;
}

// In-memory storage for development (replace with real database in production)
export class UserStore {
  private users: Map<string, User> = new Map();
  private magicCodes: Map<string, MagicCode> = new Map();
  private clients: Map<string, OAuthClient> = new Map();
  private authCodes: Map<string, OAuthAuthorizationCode> = new Map();
  private accessTokens: Map<string, OAuthAccessToken> = new Map();
  private refreshTokens: Map<string, OAuthRefreshToken> = new Map();

  // User operations
  async createUser(email: string, name?: string): Promise<User> {
    const id = crypto.randomUUID();
    const user: User = {
      id,
      email: email.toLowerCase(),
      name,
      verified: true, // User is verified when they use magic link
      created_at: new Date(),
      updated_at: new Date(),
    };
    this.users.set(id, user);
    return user;
  }

  // Magic Code operations
  async createMagicCode(email: string, ipAddress?: string, userAgent?: string): Promise<MagicCode> {
    // Generate a 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const id = crypto.randomUUID();
    
    const magicCode: MagicCode = {
      id,
      email: email.toLowerCase(),
      code,
      expires_at: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      used: false,
      ip_address: ipAddress,
      user_agent: userAgent,
      created_at: new Date(),
    };
    
    // Store by email for easy lookup
    this.magicCodes.set(email.toLowerCase(), magicCode);
    return magicCode;
  }

  async findMagicCode(email: string): Promise<MagicCode | null> {
    return this.magicCodes.get(email.toLowerCase()) || null;
  }

  async verifyMagicCode(email: string, code: string): Promise<boolean> {
    const magicCode = await this.findMagicCode(email);
    
    if (!magicCode) return false;
    if (magicCode.used) return false;
    if (magicCode.code !== code) return false;
    if (magicCode.expires_at < new Date()) return false;
    
    // Mark as used
    magicCode.used = true;
    return true;
  }

  async cleanupMagicCodes(): Promise<void> {
    const now = new Date();
    for (const [email, code] of this.magicCodes.entries()) {
      if (code.expires_at < now || code.used) {
        this.magicCodes.delete(email);
      }
    }
  }

  async findUserByEmail(email: string): Promise<User | null> {
    for (const user of this.users.values()) {
      if (user.email === email.toLowerCase()) {
        return user;
      }
    }
    return null;
  }

  async findUserById(id: string): Promise<User | null> {
    return this.users.get(id) || null;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | null> {
    const user = this.users.get(id);
    if (!user) return null;

    const updatedUser = {
      ...user,
      ...updates,
      updated_at: new Date(),
    };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  // OAuth Client operations
  async createClient(
    clientId: string,
    clientSecret: string,
    name: string,
    redirectUris: string[],
    userId: string,
    scopes: string[] = ['read'],
  ): Promise<OAuthClient> {
    const id = crypto.randomUUID();
    const client: OAuthClient = {
      id,
      client_id: clientId,
      client_secret: clientSecret,
      name,
      redirect_uris: redirectUris,
      scopes,
      user_id: userId,
      created_at: new Date(),
    };
    this.clients.set(clientId, client);
    return client;
  }

  async findClientById(clientId: string): Promise<OAuthClient | null> {
    return this.clients.get(clientId) || null;
  }

  // Authorization Code operations
  async createAuthCode(
    code: string,
    clientId: string,
    userId: string,
    redirectUri: string,
    scopes: string[],
  ): Promise<OAuthAuthorizationCode> {
    const id = crypto.randomUUID();
    const authCode: OAuthAuthorizationCode = {
      id,
      code,
      client_id: clientId,
      user_id: userId,
      redirect_uri: redirectUri,
      scopes,
      expires_at: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      used: false,
      created_at: new Date(),
    };
    this.authCodes.set(code, authCode);
    return authCode;
  }

  async findAuthCode(code: string): Promise<OAuthAuthorizationCode | null> {
    return this.authCodes.get(code) || null;
  }

  async markAuthCodeUsed(code: string): Promise<void> {
    const authCode = this.authCodes.get(code);
    if (authCode) {
      authCode.used = true;
    }
  }

  // Access Token operations
  async createAccessToken(
    token: string,
    clientId: string,
    userId: string,
    scopes: string[],
  ): Promise<OAuthAccessToken> {
    const id = crypto.randomUUID();
    const accessToken: OAuthAccessToken = {
      id,
      token,
      client_id: clientId,
      user_id: userId,
      scopes,
      expires_at: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      created_at: new Date(),
    };
    this.accessTokens.set(token, accessToken);
    return accessToken;
  }

  async findAccessToken(token: string): Promise<OAuthAccessToken | null> {
    return this.accessTokens.get(token) || null;
  }

  // Refresh Token operations
  async createRefreshToken(token: string, accessTokenId: string): Promise<OAuthRefreshToken> {
    const id = crypto.randomUUID();
    const refreshToken: OAuthRefreshToken = {
      id,
      token,
      access_token_id: accessTokenId,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      created_at: new Date(),
    };
    this.refreshTokens.set(token, refreshToken);
    return refreshToken;
  }

  async findRefreshToken(token: string): Promise<OAuthRefreshToken | null> {
    return this.refreshTokens.get(token) || null;
  }

  // Cleanup expired tokens (should be run periodically)
  async cleanupExpiredTokens(): Promise<void> {
    const now = new Date();

    // Cleanup auth codes
    for (const [code, authCode] of this.authCodes.entries()) {
      if (authCode.expires_at < now || authCode.used) {
        this.authCodes.delete(code);
      }
    }

    // Cleanup access tokens
    for (const [token, accessToken] of this.accessTokens.entries()) {
      if (accessToken.expires_at < now) {
        this.accessTokens.delete(token);
      }
    }

    // Cleanup refresh tokens
    for (const [token, refreshToken] of this.refreshTokens.entries()) {
      if (refreshToken.expires_at < now) {
        this.refreshTokens.delete(token);
      }
    }
  }

  // Debug method to see all data
  async getAllData() {
    return {
      users: Array.from(this.users.values()).map((u) => ({ ...u, password_hash: '[HIDDEN]' })),
      clients: Array.from(this.clients.values()),
      authCodes: Array.from(this.authCodes.values()),
      accessTokens: Array.from(this.accessTokens.values()),
      refreshTokens: Array.from(this.refreshTokens.values()),
    };
  }
}

// Global instance
export const userStore = new UserStore();
