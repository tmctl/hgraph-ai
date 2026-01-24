# Keycloak Setup for MCP Dashboard OAuth

This guide explains how to configure Keycloak to work with the MCP Dashboard OAuth authentication.

## Prerequisites

1. Keycloak running on `http://localhost:8080`
2. Frontend running on `http://localhost:5173`
3. MCP server running on `http://localhost:3002`

## Step 1: Start Keycloak

From the MCP directory:

```bash
# Start Keycloak and PostgreSQL
docker-compose up -d keycloak postgres

# Wait for Keycloak to be ready
# Access admin console at http://localhost:8080/admin
# Default credentials: admin/admin
```

## Step 2: Configure the MCP Public Client

1. Login to Keycloak Admin Console at `http://localhost:8080/admin`
   - Username: `admin`
   - Password: `admin`

2. Select the `mcp` realm (or create it if it doesn't exist)

3. Navigate to **Clients** → **mcp-public-client** (or create a new client)

4. Configure the client with these settings:

### General Settings
- **Client ID**: `mcp-public-client`
- **Name**: MCP Dashboard
- **Description**: Public client for MCP Dashboard OAuth
- **Client Protocol**: openid-connect
- **Client authentication**: OFF (public client)

### Access Settings
- **Root URL**: `http://localhost:5173`
- **Home URL**: `http://localhost:5173`
- **Valid Redirect URIs**:
  - `http://localhost:5173/auth/callback`
  - `http://localhost:5173/*`
- **Valid post logout redirect URIs**: `http://localhost:5173/*`
- **Web Origins**:
  - `http://localhost:5173`
  - `+` (to allow all Valid Redirect URIs origins)

### Capability Settings
- **Standard flow**: ✓ Enabled (Authorization Code Flow)
- **Direct access grants**: ✗ Disabled
- **Implicit flow**: ✗ Disabled
- **Service accounts roles**: ✗ Disabled
- **OAuth 2.0 Device Authorization Grant**: ✗ Disabled
- **OIDC CIBA Grant**: ✗ Disabled

### Login Settings
- **Login theme**: keycloak (or your custom theme)
- **Consent required**: ✗ Disabled

## Step 3: Configure Client Scopes

1. Go to **Client scopes** in the mcp realm

2. Create these scopes if they don't exist:
   - `mcp.read` - Read access to MCP resources
   - `mcp.write` - Write access to MCP resources
   - `mcp.admin` - Administrative access

3. Assign scopes to the client:
   - Navigate to **Clients** → **mcp-public-client** → **Client scopes**
   - Add the MCP scopes as **Optional** client scopes

## Step 4: Create Test Users (Optional)

1. Go to **Users** → **Add user**

2. Create a test user:
   - **Username**: `testuser`
   - **Email**: `test@example.com`
   - **Email verified**: ✓

3. Set password:
   - Go to **Credentials** tab
   - Set password: `test123`
   - **Temporary**: ✗ (uncheck)

## Step 5: Configure CORS in Keycloak

If you're still experiencing CORS issues:

1. Navigate to **Realm Settings** → **Security defenses**

2. Update **Web Origins** settings:
   - Add `http://localhost:5173` to allowed origins
   - Add `http://localhost:3001` to allowed origins

## Step 6: Start the MCP OAuth Server

```bash
# From the MCP directory
npm run build
MCP_AUTH_ENABLED=true MCP_AUTH_MODE=oauth2 npm run start:oauth
```

## Step 7: Start the Frontend

```bash
# From the frontend directory
npm run dev
```

## Testing the OAuth Flow

1. Navigate to `http://localhost:5173/mcp-dashboard`
2. You should be automatically redirected to Keycloak login
3. Login with your test credentials
4. You'll be redirected back to the dashboard with OAuth authentication
5. The dashboard will show real MCP server data

## Troubleshooting

### CORS Errors
- Ensure Web Origins in Keycloak client includes `http://localhost:5173`
- Check that the MCP server is running with OAuth enabled
- Verify the redirect URI matches exactly: `http://localhost:5173/auth/callback`

### Authentication Loops
- Clear browser cookies and localStorage
- Ensure the client is configured as a public client (no client secret)
- Check that PKCE is enabled (should be automatic for public clients)

### Token Errors
- Verify the token endpoint URL is correct
- Check that the client has the necessary scopes assigned
- Ensure the realm is named `mcp`

## Environment Variables

Ensure your `.env` file has these OAuth settings:

```env
# OAuth Configuration for MCP Server
VITE_OAUTH_ISSUER=http://localhost:8080/realms/mcp
VITE_OAUTH_CLIENT_ID=mcp-public-client
VITE_OAUTH_REDIRECT_URI=http://localhost:5173/auth/callback
VITE_OAUTH_AUTHZ_ENDPOINT=http://localhost:8080/realms/mcp/protocol/openid-connect/auth
VITE_OAUTH_TOKEN_ENDPOINT=http://localhost:8080/realms/mcp/protocol/openid-connect/token
```

## Security Notes

- This configuration is for development only
- In production, use HTTPS for all endpoints
- Configure proper CORS origins (no wildcards)
- Use secure token storage
- Implement proper session management
- Enable CSRF protection