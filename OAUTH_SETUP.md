# OAuth 2.0 Setup Guide for MCP Server

## Overview

The MCP server now supports OAuth 2.0 authentication alongside API tokens. This provides more secure, standardized authentication using industry-standard OAuth providers.

## Supported Providers

1. **Google OAuth 2.0**
2. **Auth0**
3. **Custom OAuth Provider**

## Configuration

### 1. Environment Variables

Add these to your `.env` file:

```bash
# Enable OAuth
OAUTH_ENABLED=true

# OAuth Settings
OAUTH_REQUIRED_SCOPES=mcp:read,mcp:tools
OAUTH_CACHE_TIMEOUT=300
OAUTH_DEFAULT_REDIRECT_URI=http://localhost:3000/auth/callback
```

### 2. Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable Google OAuth 2.0 API
4. Create OAuth 2.0 credentials
5. Add redirect URI: `http://localhost:3001/auth/callback`

```bash
# Google OAuth Configuration
OAUTH_GOOGLE_CLIENT_ID=your-google-client-id
OAUTH_GOOGLE_CLIENT_SECRET=your-google-client-secret
```

### 3. Auth0 Setup

1. Go to [Auth0 Dashboard](https://manage.auth0.com/)
2. Create a new application (Single Page Application)
3. Configure allowed callback URLs
4. Create an API in Auth0 for your audience

```bash
# Auth0 OAuth Configuration
OAUTH_AUTH0_DOMAIN=https://your-tenant.auth0.com
OAUTH_AUTH0_CLIENT_ID=your-auth0-client-id
OAUTH_AUTH0_CLIENT_SECRET=your-auth0-client-secret
OAUTH_AUTH0_AUDIENCE=your-api-audience
OAUTH_AUTH0_JWKS_URI=https://your-tenant.auth0.com/.well-known/jwks.json
```

### 4. Custom OAuth Provider

For any OAuth 2.0 compliant provider:

```bash
# Custom OAuth Configuration
OAUTH_CUSTOM_ISSUER=https://your-oauth-provider.com
OAUTH_CUSTOM_AUDIENCE=your-api-audience
OAUTH_CUSTOM_CLIENT_ID=your-client-id
OAUTH_CUSTOM_CLIENT_SECRET=your-client-secret
OAUTH_CUSTOM_AUTH_URL=https://your-oauth-provider.com/auth
OAUTH_CUSTOM_TOKEN_URL=https://your-oauth-provider.com/token
OAUTH_CUSTOM_INTROSPECTION_ENDPOINT=https://your-oauth-provider.com/introspect
```

## OAuth Flow

### 1. Authorization Flow

```javascript
// Step 1: Get authorization URL
const response = await fetch('http://localhost:3001/auth/authorize?provider=google&redirect_uri=http://localhost:3000/callback');
const { authUrl, sessionId, state } = await response.json();

// Step 2: Redirect user to authUrl
window.location.href = authUrl;

// Step 3: Handle callback (user returns with code)
const tokenResponse = await fetch('http://localhost:3001/auth/callback', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    code: 'auth-code-from-callback',
    state: 'state-from-step-1',
    sessionId: 'session-id-from-step-1'
  })
});

const { access_token } = await tokenResponse.json();
```

### 2. Using the Access Token

```javascript
// Use Bearer token in requests
const response = await fetch('http://localhost:3001/sse', {
  headers: {
    'Authorization': `Bearer ${access_token}`
  }
});
```

## API Endpoints

### Authentication Status
```
GET /auth/status
```

Returns current authentication configuration and supported providers.

### Start OAuth Flow
```
GET /auth/authorize?provider=google&redirect_uri=http://localhost:3000/callback
```

Parameters:
- `provider`: `google`, `auth0`, or `custom`
- `redirect_uri`: Where to redirect after authorization

### Handle OAuth Callback
```
POST /auth/callback
{
  "code": "authorization_code",
  "state": "state_parameter",
  "sessionId": "session_identifier"
}
```

### Logout
```
POST /auth/logout
```

## Client Implementation Examples

### React/JavaScript

```jsx
import React, { useState, useEffect } from 'react';

function OAuthLogin() {
  const [accessToken, setAccessToken] = useState(null);
  
  const startOAuth = async () => {
    try {
      const response = await fetch('/auth/authorize?provider=google&redirect_uri=' + 
        encodeURIComponent(window.location.origin + '/auth/callback'));
      const data = await response.json();
      
      // Store session info
      localStorage.setItem('oauth_session', JSON.stringify({
        sessionId: data.sessionId,
        state: data.state
      }));
      
      // Redirect to OAuth provider
      window.location.href = data.authUrl;
    } catch (error) {
      console.error('OAuth start failed:', error);
    }
  };
  
  // Handle OAuth callback
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    
    if (code && state) {
      handleCallback(code, state);
    }
  }, []);
  
  const handleCallback = async (code, state) => {
    try {
      const session = JSON.parse(localStorage.getItem('oauth_session') || '{}');
      
      const response = await fetch('/auth/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          state,
          sessionId: session.sessionId
        })
      });
      
      const data = await response.json();
      setAccessToken(data.access_token);
      
      // Clean up
      localStorage.removeItem('oauth_session');
      window.history.replaceState({}, document.title, '/');
    } catch (error) {
      console.error('OAuth callback failed:', error);
    }
  };
  
  return (
    <div>
      {accessToken ? (
        <p>Authenticated! Token: {accessToken.substring(0, 20)}...</p>
      ) : (
        <button onClick={startOAuth}>Login with OAuth</button>
      )}
    </div>
  );
}
```

### Python Client

```python
import requests
import webbrowser
from urllib.parse import urlencode, parse_qs

class MCPOAuthClient:
    def __init__(self, base_url="http://localhost:3001"):
        self.base_url = base_url
        self.access_token = None
    
    def start_oauth(self, provider="google", redirect_uri="http://localhost:8080/callback"):
        """Start OAuth flow"""
        params = {
            'provider': provider,
            'redirect_uri': redirect_uri
        }
        
        response = requests.get(f"{self.base_url}/auth/authorize", params=params)
        data = response.json()
        
        print(f"Please visit: {data['authUrl']}")
        webbrowser.open(data['authUrl'])
        
        return data['sessionId'], data['state']
    
    def handle_callback(self, code, state, session_id):
        """Handle OAuth callback"""
        response = requests.post(f"{self.base_url}/auth/callback", json={
            'code': code,
            'state': state,
            'sessionId': session_id
        })
        
        data = response.json()
        self.access_token = data['access_token']
        return self.access_token
    
    def make_authenticated_request(self, endpoint):
        """Make request with OAuth token"""
        headers = {}
        if self.access_token:
            headers['Authorization'] = f'Bearer {self.access_token}'
        
        return requests.get(f"{self.base_url}{endpoint}", headers=headers)

# Usage
client = MCPOAuthClient()
session_id, state = client.start_oauth()

# After user completes OAuth flow, they'll have a code
# code = input("Enter authorization code: ")
# client.handle_callback(code, state, session_id)
```

## Security Considerations

1. **State Parameter**: Always validate the state parameter to prevent CSRF attacks
2. **HTTPS**: Use HTTPS in production for all OAuth flows
3. **Token Storage**: Store access tokens securely (not in localStorage for sensitive apps)
4. **Scopes**: Only request necessary scopes
5. **Token Expiration**: Handle token expiration and refresh appropriately

## Scopes

The server requires these scopes by default:
- `mcp:read` - Read access to MCP resources
- `mcp:tools` - Execute MCP tools

Configure custom scopes with:
```bash
OAUTH_REQUIRED_SCOPES=custom:scope1,custom:scope2
```

## Troubleshooting

### Common Issues

1. **Invalid Redirect URI**
   - Ensure redirect URI is registered with OAuth provider
   - Check exact match including protocol and port

2. **Token Validation Fails**
   - Verify provider configuration
   - Check token hasn't expired
   - Ensure required scopes are granted

3. **CORS Issues**
   - Add your frontend domain to `MCP_ALLOWED_ORIGINS`
   - Include `Authorization` header in CORS config

### Debug Mode

Enable debug logging:
```bash
LOG_LEVEL=debug
```

### Authentication Status

Check current auth status:
```bash
curl http://localhost:3001/auth/status
```

## Migration from API Tokens

OAuth can run alongside API tokens. No migration required:

- Existing API token authentication continues to work
- New clients can use OAuth
- Gradual migration possible

## Production Deployment

1. **Environment Variables**: Set all OAuth config in production environment
2. **HTTPS**: Ensure all OAuth URLs use HTTPS
3. **Redirect URIs**: Update to production domain
4. **Token Caching**: Consider Redis for token cache in multi-instance deployments
5. **Monitoring**: Monitor OAuth provider rate limits and errors