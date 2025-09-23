/**
 * Simple HTTP client for MCP server communication
 * Directly sends JSON-RPC messages without the MCP SDK
 */
export class MCPHttpClient {
  constructor(url) {
    this.url = url;
    this.requestId = 0;
    this.initialized = false;
  }

  async connect() {
    try {
      // Test the connection with a simple request
      const testResponse = await this.sendRequest('tools/list');

      if (testResponse.result) {
        this.initialized = true;
        console.log('✅ MCP HTTP client connected successfully');
        console.log('🔧 Available tools:', testResponse.result.tools?.length || 0);
        return true;
      }

      throw new Error('Failed to connect to MCP server');
    } catch (error) {
      console.error('❌ Failed to connect to MCP server:', error);
      throw error;
    }
  }

  async sendRequest(method, params = {}) {
    const request = {
      jsonrpc: '2.0',
      id: ++this.requestId,
      method,
      params,
    };

    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(`MCP error: ${data.error.message || JSON.stringify(data.error)}`);
      }

      return data;
    } catch (error) {
      console.error(`❌ MCP request error (${method}):`, error.message);
      throw error;
    }
  }

  async listResources() {
    if (!this.initialized) throw new Error('Client not initialized');
    const response = await this.sendRequest('resources/list');
    return { resources: response.result?.resources || [] };
  }

  async readResource(params) {
    if (!this.initialized) throw new Error('Client not initialized');
    const response = await this.sendRequest('resources/read', params);
    return response.result;
  }

  async listTools() {
    if (!this.initialized) throw new Error('Client not initialized');
    const response = await this.sendRequest('tools/list');
    return { tools: response.result?.tools || [] };
  }

  async callTool(params) {
    if (!this.initialized) throw new Error('Client not initialized');
    // The server expects the tool name as the method and arguments as params
    const response = await this.sendRequest('tools/call', {
      name: params.name,
      arguments: params.arguments || {},
    });
    return response.result;
  }

  async listPrompts() {
    if (!this.initialized) throw new Error('Client not initialized');
    const response = await this.sendRequest('prompts/list');
    return { prompts: response.result?.prompts || [] };
  }

  async getPrompt(params) {
    if (!this.initialized) throw new Error('Client not initialized');
    const response = await this.sendRequest('prompts/get', params);
    return response.result;
  }

  async close() {
    this.initialized = false;
    console.log('🔌 MCP HTTP client closed');
  }
}
