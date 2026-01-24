import { useState, useEffect, useCallback } from 'react';
import { oauthClient } from '@/lib/oauth';

interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: any;
}

interface MCPResource {
  name: string;
  uri: string;
  description?: string;
  mimeType?: string;
}

interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

interface MCPData {
  status: string;
  tools: MCPTool[];
  resources: MCPResource[];
  prompts: MCPPrompt[];
}

export const useMCPData = () => {
  const [data, setData] = useState<MCPData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMCPData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Use relative path so nginx can proxy to the Node.js server
      // This will go through nginx proxy at the same origin

      // Get OAuth authorization header if available
      const authHeaders = oauthClient.getAuthHeader();

      const response = await fetch('/api/mcp/data', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders, // Include OAuth token if available
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          // Authentication required - redirect to login
          sessionStorage.setItem('auth_return_url', '/mcp-dashboard');
          oauthClient.login();
          return;
        } else if (response.status === 503) {
          // MCP server not available
          throw new Error('MCP server is currently unavailable. Please try again later.');
        } else {
          throw new Error(`Failed to fetch MCP data: ${response.statusText}`);
        }
      }

      const mcpData = await response.json();
      setData(mcpData);
    } catch (err) {
      console.error('Error fetching MCP data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch MCP data');
      // Set empty data on error
      setData({
        status: 'error',
        tools: [],
        resources: [],
        prompts: []
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMCPData();
  }, [fetchMCPData]);

  return {
    data,
    loading,
    error,
    refetch: fetchMCPData
  };
};