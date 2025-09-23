import { useState, useCallback } from 'react';
import { createClaudeAPI, ClaudeMessage, ClaudeAPIError, ClaudeResponse } from '@/lib/claude';

export interface MessageMetadata {
  sqlQuery?: string | null;
  queryDescription?: string | null;
  queryResults?: string | null;
}

export interface UseClaude {
  sendMessage: (message: string, systemPrompt?: string, accountId?: string) => Promise<string>;
  sendMessageWithMetadata: (message: string, systemPrompt?: string, accountId?: string) => Promise<{ response: string; metadata?: MessageMetadata }>;
  isLoading: boolean;
  error: string | null;
  clearError: () => void;
  conversationHistory: ClaudeMessage[];
  clearHistory: () => void;
}

export const useClaude = (): UseClaude => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationHistory, setConversationHistory] = useState<
    ClaudeMessage[]
  >([]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const clearHistory = useCallback(() => {
    setConversationHistory([]);
  }, []);

  const sendMessage = useCallback(
    async (message: string, systemPrompt?: string, accountId?: string): Promise<string> => {
      setIsLoading(true);
      setError(null);

      try {
        const claude = createClaudeAPI();
        const response = await claude.chat(
          message,
          conversationHistory,
          systemPrompt,
          accountId
        );

        // Update conversation history
        setConversationHistory((prev) => [
          ...prev,
          { role: 'user', content: message },
          { role: 'assistant', content: response },
        ]);

        return response;
      } catch (err) {
        let errorMessage = 'An unexpected error occurred';

        // Use the improved error message from the server
        if (err instanceof ClaudeAPIError) {
          errorMessage = err.message;
        } else if (err instanceof Error) {
          errorMessage = err.message;
        }

        setError(errorMessage);
        throw new Error(errorMessage);
      } finally {
        setIsLoading(false);
      }
    },
    [conversationHistory]
  );

  const sendMessageWithMetadata = useCallback(
    async (message: string, systemPrompt?: string, accountId?: string): Promise<{ response: string; metadata?: MessageMetadata }> => {
      setIsLoading(true);
      setError(null);

      try {
        const claude = createClaudeAPI();
        const fullResponse = await claude.chatWithMetadata(
          message,
          conversationHistory,
          systemPrompt,
          accountId
        );

        // Update conversation history
        setConversationHistory((prev) => [
          ...prev,
          { role: 'user', content: message },
          { role: 'assistant', content: fullResponse.response },
        ]);

        return {
          response: fullResponse.response,
          metadata: fullResponse.mcpData ? {
            sqlQuery: fullResponse.mcpData.sqlQuery,
            queryDescription: fullResponse.mcpData.queryDescription,
            queryResults: fullResponse.mcpData.queryResults,
          } : undefined
        };
      } catch (err) {
        let errorMessage = 'An unexpected error occurred';

        // Use the improved error message from the server
        if (err instanceof ClaudeAPIError) {
          errorMessage = err.message;
        } else if (err instanceof Error) {
          errorMessage = err.message;
        }

        setError(errorMessage);
        throw new Error(errorMessage);
      } finally {
        setIsLoading(false);
      }
    },
    [conversationHistory]
  );

  return {
    sendMessage,
    sendMessageWithMetadata,
    isLoading,
    error,
    clearError,
    conversationHistory,
    clearHistory,
  };
};

