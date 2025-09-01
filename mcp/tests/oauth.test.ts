/**
 * OAuth 2.0 functionality tests
 */

import request from 'supertest';
import app from '../src/server-http';

describe('OAuth 2.0 Authentication', () => {
  beforeEach(() => {
    // Reset environment
    delete process.env.OAUTH_ENABLED;
  });

  describe('OAuth Disabled (Default)', () => {
    it('should return OAuth disabled status', async () => {
      const response = await request(app)
        .get('/auth/status')
        .expect(200);

      expect(response.body.oauth.enabled).toBe(false);
      expect(response.body.supportedProviders).toEqual(['google', 'auth0', 'custom']);
    });

    it('should still accept API token authentication', async () => {
      // This should work with API token even when OAuth is disabled
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.status).toBe('healthy');
    });

    it('should reject OAuth authorization request when disabled', async () => {
      const response = await request(app)
        .get('/auth/authorize?provider=google&redirect_uri=http://localhost:3000/callback')
        .expect(400);

      expect(response.body.error).toBe('invalid_provider');
    });
  });

  describe('OAuth Enabled', () => {
    beforeEach(() => {
      process.env.OAUTH_ENABLED = 'true';
      process.env.OAUTH_GOOGLE_CLIENT_ID = 'test-client-id';
    });

    afterEach(() => {
      delete process.env.OAUTH_ENABLED;
      delete process.env.OAUTH_GOOGLE_CLIENT_ID;
    });

    it('should return OAuth enabled status', async () => {
      const response = await request(app)
        .get('/auth/status')
        .expect(200);

      expect(response.body.oauth.enabled).toBe(true);
      expect(response.body.oauth.providers).toContain('google');
    });

    it('should start OAuth authorization flow', async () => {
      const response = await request(app)
        .get('/auth/authorize?provider=google&redirect_uri=http://localhost:3000/callback')
        .expect(200);

      expect(response.body).toHaveProperty('authUrl');
      expect(response.body).toHaveProperty('state');
      expect(response.body).toHaveProperty('sessionId');
      expect(response.body.provider).toBe('google');
      expect(response.body.authUrl).toContain('accounts.google.com');
    });

    it('should require redirect_uri parameter', async () => {
      const response = await request(app)
        .get('/auth/authorize?provider=google')
        .expect(400);

      expect(response.body.error).toBe('missing_redirect_uri');
    });

    it('should reject invalid provider', async () => {
      const response = await request(app)
        .get('/auth/authorize?provider=invalid&redirect_uri=http://localhost:3000/callback')
        .expect(400);

      expect(response.body.error).toBe('invalid_provider');
    });

    it('should handle callback validation', async () => {
      // First get a valid session
      const authResponse = await request(app)
        .get('/auth/authorize?provider=google&redirect_uri=http://localhost:3000/callback')
        .expect(200);

      // Try callback without required parameters
      const response = await request(app)
        .post('/auth/callback')
        .send({})
        .expect(400);

      expect(response.body.error).toBe('invalid_request');
    });

    it('should reject callback with invalid session', async () => {
      const response = await request(app)
        .post('/auth/callback')
        .send({
          code: 'test-code',
          state: 'test-state',
          sessionId: 'invalid-session'
        })
        .expect(400);

      expect(response.body.error).toBe('invalid_session');
    });
  });

  describe('Bearer Token Authentication', () => {
    it('should reject requests without Bearer token when OAuth enabled', async () => {
      process.env.OAUTH_ENABLED = 'true';

      const response = await request(app)
        .get('/sse')
        .expect(401);

      expect(response.body.error).toBe('oauth_required');

      delete process.env.OAUTH_ENABLED;
    });

    it('should reject invalid Bearer tokens', async () => {
      process.env.OAUTH_ENABLED = 'true';

      const response = await request(app)
        .get('/sse')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.error).toBe('invalid_token');

      delete process.env.OAUTH_ENABLED;
    });
  });

  describe('Mixed Authentication', () => {
    it('should support both API tokens and OAuth when both are configured', async () => {
      process.env.OAUTH_ENABLED = 'true';
      process.env.MCP_API_TOKENS = 'test-api-token';

      const statusResponse = await request(app)
        .get('/auth/status')
        .expect(200);

      expect(statusResponse.body.apiTokens.configured).toBe(true);
      expect(statusResponse.body.oauth.enabled).toBe(true);

      // Cleanup
      delete process.env.OAUTH_ENABLED;
      delete process.env.MCP_API_TOKENS;
    });
  });
});