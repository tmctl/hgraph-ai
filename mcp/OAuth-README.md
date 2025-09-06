# MCP Server OAuth 2.1 Implementation

This document describes the OAuth 2.1/OIDC implementation for the MCP server, replacing basic authentication with a standards-compliant authorization system using Keycloak.

## Table of Contents
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Configuration](#configuration)
- [OAuth Flows](#oauth-flows)
- [Migration from Basic Auth](#migration-from-basic-auth)
- [Testing](#testing)
- [Security Considerations](#security-considerations)
- [Troubleshooting](#troubleshooting)

## Quick Start

### 1. Start Keycloak and MCP Server

```bash
# Start Keycloak and PostgreSQL
docker-compose up -d keycloak postgres

# Wait for Keycloak to be ready (check http://localhost:8080)
# Default admin credentials: admin/admin

# Start MCP server with OAuth enabled
npm run build
MCP_AUTH_ENABLED=true MCP_AUTH_MODE=oauth2 npm run start:oauth

# Or use the OAuth-specific server
tsx src/http-server-oauth.ts
```

### 2. Test OAuth Authentication

```bash
# Get an access token using client credentials
ACCESS_TOKEN=$(curl -s -X POST \
  http://localhost:8080/realms/mcp/protocol/openid-connect/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=mcp-service-client" \
  -d "client_secret=mcp-service-secret" \
  -d "scope=mcp.read mcp.write" \
  | jq -r '.access_token')

# Use the token to call MCP API
curl -X POST http://localhost:3001/mcp/message \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Architecture

### Components

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│   Client    │────▶│  MCP Server  │────▶│   Keycloak   │
│             │◀────│              │◀────│              │
└─────────────┘     └──────────────┘     └──────────────┘
                           │                     │
                           ▼                     ▼
                    ┌──────────────┐     ┌──────────────┐
                    │     JWKS     │     │  PostgreSQL  │
                    │    Cache     │     │              │
                    └──────────────┘     └──────────────┘
```

### Key Features

- **OAuth 2.1 Compliant**: Implements Authorization Code + PKCE and Client Credentials flows
- **JWT Validation**: Validates tokens using JWKS with caching
- **Scope-based Authorization**: Maps OAuth scopes to MCP permissions
- **Discovery Endpoint**: Exposes `.well-known/oauth-authorization-server`
- **Dynamic Client Registration**: Supports RFC 7591 client registration
- **Hybrid Mode**: Allows parallel operation with basic auth during migration

## Configuration

### Environment Variables

```bash
# Core OAuth Configuration
MCP_AUTH_ENABLED=true                    # Enable authorization
MCP_AUTH_MODE=oauth2                     # oauth2 | basic | hybrid

# OAuth Endpoints
MCP_AUTH_ISSUER=http://localhost:8080/realms/mcp
MCP_AUTH_AUDIENCE=mcp-api
MCP_AUTH_JWKS_URI=http://localhost:8080/realms/mcp/protocol/openid-connect/certs
MCP_AUTH_TOKEN_ENDPOINT=http://localhost:8080/realms/mcp/protocol/openid-connect/token
MCP_AUTH_AUTHZ_ENDPOINT=http://localhost:8080/realms/mcp/protocol/openid-connect/auth
MCP_AUTH_REGISTRATION_ENDPOINT=http://localhost:8080/realms/mcp/clients-registrations/openid-connect

# Security Settings
MCP_AUTH_ALLOWED_ALGS=RS256,ES256        # Allowed JWT algorithms
MCP_AUTH_CLOCK_SKEW_SECONDS=120          # Clock skew tolerance
MCP_AUTH_JWKS_CACHE_TTL_SECONDS=3600     # JWKS cache duration

# Scope Mapping
MCP_SCOPE_TO_ROLE_MAP_JSON='{"mcp.read":"reader","mcp.write":"writer","mcp.admin":"admin"}'

# Dynamic Client Registration
MCP_ENABLE_DCR=true
MCP_INITIAL_ACCESS_TOKEN=<token>         # Optional, for protected DCR

# Hybrid Mode (migration)
MCP_AUTH_TOKEN=legacy-token              # Basic auth token for hybrid mode
```

### Keycloak Realm Configuration

The repository includes a pre-configured realm (`keycloak/realms/mcp-realm.json`) with:

#### Clients
- **mcp-api**: Confidential client for server-to-server
- **mcp-public-client**: Public client for browser flows (PKCE required)
- **mcp-service-client**: Service account for automation

#### Scopes
- `mcp.read`: Read access to MCP resources
- `mcp.write`: Write access to MCP resources
- `mcp.admin`: Administrative access

#### Test Users
- `test-user` / `test123`: Regular user
- `admin-user` / `admin123`: Admin user

## OAuth Flows

### 1. Client Credentials Flow (Service-to-Service)

Perfect for automation, CI/CD, and backend services.

```bash
# Request token
curl -X POST http://localhost:8080/realms/mcp/protocol/openid-connect/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=mcp-service-client" \
  -d "client_secret=mcp-service-secret" \
  -d "scope=mcp.read mcp.write"

# Response
{
  "access_token": "eyJhbGc...",
  "expires_in": 300,
  "token_type": "Bearer",
  "scope": "mcp.read mcp.write"
}
```

### 2. Authorization Code + PKCE Flow (User Login)

For web applications and public clients.

```javascript
// Step 1: Generate PKCE challenge
const codeVerifier = base64url(crypto.randomBytes(32));
const codeChallenge = base64url(sha256(codeVerifier));

// Step 2: Redirect to authorization
window.location.href = `http://localhost:8080/realms/mcp/protocol/openid-connect/auth?` +
  `response_type=code&` +
  `client_id=mcp-public-client&` +
  `redirect_uri=${encodeURIComponent('http://localhost:3001/auth/callback')}&` +
  `scope=openid profile email mcp.read&` +
  `state=${state}&` +
  `code_challenge=${codeChallenge}&` +
  `code_challenge_method=S256`;

// Step 3: Handle callback and exchange code
const params = new URLSearchParams(window.location.search);
const code = params.get('code');

const tokenResponse = await fetch('http://localhost:8080/realms/mcp/protocol/openid-connect/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code: code,
    redirect_uri: 'http://localhost:3001/auth/callback',
    client_id: 'mcp-public-client',
    code_verifier: codeVerifier
  })
});
```

### 3. Dynamic Client Registration

Register new clients programmatically:

```bash
curl -X POST http://localhost:3001/register \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <initial_access_token>" \
  -d '{
    "application_type": "web",
    "redirect_uris": ["https://app.example.com/callback"],
    "client_name": "My Application",
    "token_endpoint_auth_method": "client_secret_basic"
  }'

# Response
{
  "client_id": "generated-client-id",
  "client_secret": "generated-secret",
  "registration_access_token": "...",
  "registration_client_uri": "..."
}
```

## Migration from Basic Auth

### Hybrid Mode

Run both OAuth and basic auth in parallel during migration:

```bash
# Enable hybrid mode
MCP_AUTH_MODE=hybrid
MCP_AUTH_TOKEN=legacy-basic-token

# Both authentication methods work:
# OAuth
curl -H "Authorization: Bearer <jwt_token>" ...

# Basic (logs deprecation warning)
curl -H "Authorization: Bearer legacy-basic-token" ...
```

### Migration Steps

1. **Enable hybrid mode** in production
2. **Update clients** to use OAuth tokens
3. **Monitor logs** for basic auth usage
4. **Switch to OAuth-only** once migration complete
5. **Remove basic auth** configuration

## Testing

### Run OAuth Flow Tests

```bash
# Start Keycloak and MCP server first
docker-compose up -d

# Run test suite
npm run test:oauth

# Or run individual test
tsx tests/test-oauth-flows.ts
```

### Manual Testing

1. **Discovery Endpoint**:
```bash
curl http://localhost:3001/.well-known/oauth-authorization-server | jq
```

2. **Health Check**:
```bash
curl http://localhost:3001/health/auth | jq
```

3. **Token Validation**:
```bash
# Invalid token should return 401
curl -X POST http://localhost:3001/mcp/message \
  -H "Authorization: Bearer invalid-token" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Security Considerations

### Production Checklist

- [ ] **Use HTTPS everywhere** - OAuth requires secure transport
- [ ] **Configure proper CORS** - Restrict allowed origins
- [ ] **Rotate secrets regularly** - Use secret management tools
- [ ] **Enable rate limiting** - Protect auth endpoints
- [ ] **Monitor failed authentications** - Set up alerting
- [ ] **Use short token lifetimes** - 5-15 minutes for access tokens
- [ ] **Implement token refresh** - Use refresh tokens for long sessions
- [ ] **Validate redirect URIs** - Prevent open redirect attacks
- [ ] **Enable PKCE** - Required for all public clients
- [ ] **Audit logs** - Track all auth events

### Token Validation

The server validates:
- **Signature**: Using JWKS from Keycloak
- **Issuer**: Must match `MCP_AUTH_ISSUER`
- **Audience**: Must contain `MCP_AUTH_AUDIENCE`
- **Expiration**: With clock skew tolerance
- **Algorithm**: Only allowed algorithms
- **Scopes**: Mapped to MCP permissions

## Troubleshooting

### Common Issues

#### 1. "Invalid token" errors
- Check token expiration: `jwt decode <token>`
- Verify JWKS endpoint is accessible
- Check issuer and audience match configuration

#### 2. "Keycloak unreachable"
- Ensure Keycloak is running: `docker-compose ps`
- Check network connectivity between services
- Verify Keycloak URLs in configuration

#### 3. "CORS errors"
- Add client origin to CORS configuration
- Check Keycloak client web origins setting

#### 4. "Scope insufficient" errors
- Verify token includes required scopes
- Check scope-to-role mapping configuration
- Ensure client has access to scopes in Keycloak

### Debug Mode

Enable detailed logging:
```bash
DEBUG=oauth:* npm run start:oauth
```

### Keycloak Admin Console

Access at http://localhost:8080/admin (admin/admin)
- View/edit realm configuration
- Manage clients and users
- Monitor active sessions
- Review event logs

## API Reference

### Discovery Endpoint
```
GET /.well-known/oauth-authorization-server
```

### OAuth Endpoints
```
GET /auth/login           # Initiate PKCE flow
GET /auth/callback        # Handle authorization callback
POST /auth/logout         # Logout and revoke tokens
POST /register           # Dynamic client registration
```

### Protected MCP Endpoints
All require `Authorization: Bearer <token>` header:
```
GET /mcp/health          # No auth required
GET /mcp/sse            # Requires mcp.read
POST /mcp/message       # Scope depends on method
POST /mcp/batch         # Scope depends on methods
```

## Examples

### Node.js Client
```typescript
import axios from 'axios';

// Get token
const tokenResponse = await axios.post(
  'http://localhost:8080/realms/mcp/protocol/openid-connect/token',
  new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: 'mcp-service-client',
    client_secret: process.env.CLIENT_SECRET,
    scope: 'mcp.read mcp.write'
  })
);

const token = tokenResponse.data.access_token;

// Use token
const mcpResponse = await axios.post(
  'http://localhost:3001/mcp/message',
  { jsonrpc: '2.0', id: 1, method: 'tools/list' },
  { headers: { 'Authorization': `Bearer ${token}` } }
);
```

### Python Client
```python
import requests

# Get token
token_response = requests.post(
    'http://localhost:8080/realms/mcp/protocol/openid-connect/token',
    data={
        'grant_type': 'client_credentials',
        'client_id': 'mcp-service-client',
        'client_secret': CLIENT_SECRET,
        'scope': 'mcp.read mcp.write'
    }
)
token = token_response.json()['access_token']

# Use token
mcp_response = requests.post(
    'http://localhost:3001/mcp/message',
    json={'jsonrpc': '2.0', 'id': 1, 'method': 'tools/list'},
    headers={'Authorization': f'Bearer {token}'}
)
```

## Support

- **Documentation**: This file and inline code comments
- **Issues**: Report bugs in the GitHub repository
- **Keycloak Docs**: https://www.keycloak.org/documentation
- **OAuth 2.1 Spec**: https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-10
- **MCP Spec**: https://modelcontextprotocol.io/specification