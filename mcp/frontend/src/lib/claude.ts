export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ClaudeResponse {
  response: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  model?: string;
  mcpData?: {
    hasContext: boolean;
    suggestions: string[];
    sqlQuery?: string | null;
    queryDescription?: string | null;
    queryResults?: string | null;
  };
}

export interface ClaudeErrorResponse {
  error: string;
  type?: string;
  message?: string;
}

export interface ClaudeRequestOptions {
  model?: string;
  max_tokens?: number;
  temperature?: number;
  system?: string;
  accountId?: string;
}

class ClaudeAPIError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: string,
  ) {
    super(message);
    this.name = 'ClaudeAPIError';
  }
}

export class ClaudeAPI {
  private baseURL: string;
  private token?: string;

  constructor(baseURL?: string, token?: string) {
    // Use empty string for relative paths when no baseURL provided
    // This ensures API calls go through nginx proxy
    this.baseURL = baseURL || import.meta.env.VITE_API_BASE_URL || '';
    this.token = token;
  }

  setToken(token: string | undefined) {
    this.token = token;
  }

  async sendMessage(
    message: string,
    conversationHistory: ClaudeMessage[] = [],
    systemPrompt?: string,
    accountId?: string,
  ): Promise<ClaudeResponse> {
    try {
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };

      if (this.token) {
        headers['Authorization'] = `Bearer ${this.token}`;
      }

      const response = await fetch(`${this.baseURL}/api/claude`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message,
          conversationHistory,
          systemPrompt,
          accountId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new ClaudeAPIError(
          data.error || `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          data.type,
        );
      }

      return data as ClaudeResponse;
    } catch (error) {
      if (error instanceof ClaudeAPIError) {
        throw error;
      }
      throw new ClaudeAPIError(
        `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async chat(
    userMessage: string,
    conversationHistory: ClaudeMessage[] = [],
    systemPrompt?: string,
    accountId?: string,
  ): Promise<string> {
    const response = await this.sendMessage(
      userMessage,
      conversationHistory,
      systemPrompt,
      accountId,
    );
    return response.response;
  }

  async chatWithMetadata(
    userMessage: string,
    conversationHistory: ClaudeMessage[] = [],
    systemPrompt?: string,
    accountId?: string,
  ): Promise<ClaudeResponse> {
    return await this.sendMessage(userMessage, conversationHistory, systemPrompt, accountId);
  }
}

export const createClaudeAPI = (baseURL?: string, token?: string) => {
  return new ClaudeAPI(baseURL, token);
};

export { ClaudeAPIError };
