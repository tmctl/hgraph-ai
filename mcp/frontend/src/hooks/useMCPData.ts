import { useState, useEffect, useCallback } from 'react';

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
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
      const response = await fetch(`${apiBaseUrl}/api/mcp/data`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 503) {
          // MCP server not connected, but not a fatal error
          const fallbackData = await response.json();
          setData(fallbackData);
        } else {
          throw new Error(`Failed to fetch MCP data: ${response.statusText}`);
        }
      } else {
        const mcpData = await response.json();
        setData(mcpData);
      }
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