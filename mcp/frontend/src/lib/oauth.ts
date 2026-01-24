/**
 * OAuth 2.1 Client for MCP Server Authentication
 * Implements Authorization Code + PKCE flow for secure authentication
 */

import axios from 'axios';

// OAuth configuration
export interface OAuthConfig {
  issuer: string;
  clientId: string;
  redirectUri: string;
  authzEndpoint: string;
  tokenEndpoint: string;
  scopes: string[];
}

// Default configuration for Keycloak
export const defaultOAuthConfig: OAuthConfig = {
  issuer: import.meta.env.VITE_OAUTH_ISSUER || 'http://localhost:8080/realms/mcp',
  clientId: import.meta.env.VITE_OAUTH_CLIENT_ID || 'mcp-public-client',
  redirectUri: import.meta.env.VITE_OAUTH_REDIRECT_URI || `${window.location.origin}/auth/callback`,
  authzEndpoint: import.meta.env.VITE_OAUTH_AUTHZ_ENDPOINT || 'http://localhost:8080/realms/mcp/protocol/openid-connect/auth',
  tokenEndpoint: import.meta.env.VITE_OAUTH_TOKEN_ENDPOINT || 'http://localhost:8080/realms/mcp/protocol/openid-connect/token',
  scopes: [] // Start with no scopes - Keycloak will provide default scopes
};

// Token storage keys
const TOKEN_STORAGE_KEY = 'mcp_access_token';
const REFRESH_TOKEN_STORAGE_KEY = 'mcp_refresh_token';
const TOKEN_EXPIRY_KEY = 'mcp_token_expiry';
const CODE_VERIFIER_KEY = 'mcp_code_verifier';
const STATE_KEY = 'mcp_auth_state';

// PKCE utilities
function generateRandomString(length: number): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let result = '';
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < length; i++) {
    result += charset[randomValues[i] % charset.length];
  }
  return result;
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  return btoa(String.fromCharCode(...hashArray))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

export class OAuthClient {
  private config: OAuthConfig;

  constructor(config?: Partial<OAuthConfig>) {
    this.config = { ...defaultOAuthConfig, ...config };
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    const token = this.getAccessToken();
    const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY);

    if (!token || !expiry) {
      return false;
    }

    // Check if token is expired
    const expiryTime = parseInt(expiry, 10);
    const now = Date.now();
    return now < expiryTime;
  }

  /**
   * Get stored access token
   */
  getAccessToken(): string | null {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  }

  /**
   * Get stored refresh token
   */
  getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
  }

  /**
   * Initiate OAuth login flow
   */
  async login(): Promise<void> {
    // Generate PKCE parameters
    const codeVerifier = generateRandomString(128);
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const state = generateRandomString(32);

    // Store verifier and state for callback
    sessionStorage.setItem(CODE_VERIFIER_KEY, codeVerifier);
    sessionStorage.setItem(STATE_KEY, state);

    // Build authorization URL
    const params: Record<string, string> = {
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    };

    // Only add scope if we have scopes configured
    if (this.config.scopes.length > 0) {
      params.scope = this.config.scopes.join(' ');
    }

    const searchParams = new URLSearchParams(params);

    // Redirect to authorization endpoint
    window.location.href = `${this.config.authzEndpoint}?${searchParams.toString()}`;
  }

  /**
   * Handle OAuth callback
   */
  async handleCallback(callbackUrl: string): Promise<boolean> {
    const url = new URL(callbackUrl);
    const params = new URLSearchParams(url.search);

    const code = params.get('code');
    const state = params.get('state');
    const error = params.get('error');

    // Check for errors
    if (error) {
      console.error('OAuth error:', error, params.get('error_description'));
      this.clearTokens();
      return false;
    }

    // Verify state
    const storedState = sessionStorage.getItem(STATE_KEY);
    if (!storedState) {
      console.error('No stored state found - might be a page refresh');
      // Don't clear tokens, as user might already be authenticated
      return this.isAuthenticated();
    }

    if (state !== storedState) {
      console.error('State mismatch - stored:', storedState, 'received:', state);
      // Don't immediately fail - check if we're already authenticated
      if (this.isAuthenticated()) {
        // User is already authenticated, probably a duplicate callback
        sessionStorage.removeItem(CODE_VERIFIER_KEY);
        sessionStorage.removeItem(STATE_KEY);
        return true;
      }
      this.clearTokens();
      return false;
    }

    // Get code verifier
    const codeVerifier = sessionStorage.getItem(CODE_VERIFIER_KEY);
    if (!code || !codeVerifier) {
      console.error('Missing code or verifier');
      this.clearTokens();
      return false;
    }

    try {
      // Exchange code for tokens
      const tokenResponse = await axios.post(
        this.config.tokenEndpoint,
        new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: this.config.redirectUri,
          client_id: this.config.clientId,
          code_verifier: codeVerifier
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      const { access_token, refresh_token, expires_in } = tokenResponse.data;

      // Store tokens
      this.storeTokens(access_token, refresh_token, expires_in);

      // Clean up session storage
      sessionStorage.removeItem(CODE_VERIFIER_KEY);
      sessionStorage.removeItem(STATE_KEY);

      return true;
    } catch (error) {
      console.error('Token exchange failed:', error);
      this.clearTokens();
      return false;
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(): Promise<boolean> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      return false;
    }

    try {
      const tokenResponse = await axios.post(
        this.config.tokenEndpoint,
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: this.config.clientId
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      const { access_token, refresh_token: new_refresh_token, expires_in } = tokenResponse.data;

      // Store new tokens
      this.storeTokens(access_token, new_refresh_token || refreshToken, expires_in);

      return true;
    } catch (error) {
      console.error('Token refresh failed:', error);
      this.clearTokens();
      return false;
    }
  }

  /**
   * Logout and clear tokens
   */
  logout(): void {
    this.clearTokens();
    // Optionally redirect to logout endpoint
    const logoutUrl = `${this.config.issuer}/protocol/openid-connect/logout`;
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      post_logout_redirect_uri: window.location.origin
    });
    window.location.href = `${logoutUrl}?${params.toString()}`;
  }

  /**
   * Store tokens securely
   */
  private storeTokens(accessToken: string, refreshToken?: string, expiresIn?: number): void {
    localStorage.setItem(TOKEN_STORAGE_KEY, accessToken);

    if (refreshToken) {
      localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, refreshToken);
    }

    if (expiresIn) {
      // Calculate expiry time (with 30 second buffer)
      const expiryTime = Date.now() + ((expiresIn - 30) * 1000);
      localStorage.setItem(TOKEN_EXPIRY_KEY, expiryTime.toString());
    }
  }

  /**
   * Clear all tokens
   */
  private clearTokens(): void {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
    localStorage.removeItem(TOKEN_EXPIRY_KEY);
    sessionStorage.removeItem(CODE_VERIFIER_KEY);
    sessionStorage.removeItem(STATE_KEY);
  }

  /**
   * Get authorization header
   */
  getAuthHeader(): { Authorization: string } | {} {
    const token = this.getAccessToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  /**
   * Make authenticated request
   */
  async authenticatedRequest<T>(
    url: string,
    options?: RequestInit
  ): Promise<T> {
    // Check if token needs refresh
    if (!this.isAuthenticated()) {
      const refreshed = await this.refreshAccessToken();
      if (!refreshed) {
        throw new Error('Authentication required');
      }
    }

    const token = this.getAccessToken();
    const response = await fetch(url, {
      ...options,
      headers: {
        ...options?.headers,
        Authorization: `Bearer ${token}`
      }
    });

    if (response.status === 401) {
      // Try to refresh token
      const refreshed = await this.refreshAccessToken();
      if (refreshed) {
        // Retry request with new token
        const newToken = this.getAccessToken();
        const retryResponse = await fetch(url, {
          ...options,
          headers: {
            ...options?.headers,
            Authorization: `Bearer ${newToken}`
          }
        });

        if (!retryResponse.ok) {
          throw new Error(`Request failed: ${retryResponse.statusText}`);
        }

        return retryResponse.json();
      } else {
        throw new Error('Authentication required');
      }
    }

    if (!response.ok) {
      throw new Error(`Request failed: ${response.statusText}`);
    }

    return response.json();
  }
}

// Export singleton instance
export const oauthClient = new OAuthClient();