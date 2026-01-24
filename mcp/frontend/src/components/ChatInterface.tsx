import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, Bot, User, Sparkles, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useClaude } from '@/hooks/useClaude';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  timestamp: Date;
}

const ChatInterface = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: 'Hello! I can help you analyze Hedera blockchain data. Try asking me something like "How many NFTs do I have?" or "What is the current state of this smart contract?"',
      sender: 'bot',
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { sendMessage, isLoading, error, clearError } = useClaude();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const exampleQuestions = [
    'How many NFTs do I have?',
    'What is the current state of this smart contract?',
    'Show me my account balance history',
    'What tokens have I traded recently?',
  ];

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputValue,
      sender: 'user',
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const currentQuestion = inputValue;
    setInputValue('');
    clearError();

    const systemPrompt = `You are an AI assistant specialized in analyzing Hedera blockchain data. You help users understand their Hedera accounts, tokens, NFTs, smart contracts, and transaction history. 

Provide clear, informative responses about Hedera blockchain queries. If you need specific account information or real-time data, explain what information would be needed and how the user could obtain it through Hedera's APIs or explorers.

Keep responses concise but informative, and use markdown formatting when helpful for readability.`;

    try {
      const responseText = await sendMessage(currentQuestion, systemPrompt);

      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: responseText,
        sender: 'bot',
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, botMessage]);
    } catch (error) {
      console.error('Error querying Claude:', error);

      const errorText =
        error instanceof Error
          ? error.message
          : 'Sorry, I encountered an error while processing your query. Please try again.';
      const isRetryable =
        errorText.toLowerCase().includes('traffic') ||
        errorText.toLowerCase().includes('try again') ||
        errorText.toLowerCase().includes('rate limit');

      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: errorText + (isRetryable ? '\n\n💡 Tip: Click your message above to retry.' : ''),
        sender: 'bot',
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, errorMessage]);
    }
  };

  const handleQuestionClick = (question: string) => {
    setInputValue(question);
  };

  return (
    <section id="chat" className="py-20 bg-secondary/30">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-foreground mb-4">
              Try the{' '}
              <span className="bg-gradient-primary bg-clip-text text-transparent">
                AI Assistant
              </span>
            </h2>
            <p className="text-xl text-muted-foreground">
              Ask questions about Hedera blockchain data in natural language
            </p>
          </div>

          {/* Error Display */}
          {error && (
            <div className="mb-4 p-4 bg-destructive/10 border border-destructive/20 rounded-xl flex items-center gap-3 animate-fade-in">
              <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0" />
              <div className="flex-1">
                <p className="text-destructive text-sm font-medium">Error</p>
                <p className="text-destructive/80 text-sm">{error}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearError}
                className="text-destructive hover:bg-destructive/10"
              >
                ×
              </Button>
            </div>
          )}

          {/* Chat Container */}
          <div className="bg-card border border-border rounded-xl shadow-large overflow-hidden">
            {/* Messages */}
            <div className="h-96 overflow-y-auto p-6 space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    'flex gap-3 animate-fade-in',
                    message.sender === 'user' ? 'justify-end' : 'justify-start',
                  )}
                >
                  {message.sender === 'bot' && (
                    <div className="w-8 h-8 bg-gradient-primary rounded-lg flex items-center justify-center flex-shrink-0">
                      <Bot className="w-4 h-4 text-white" />
                    </div>
                  )}

                  <div
                    className={cn(
                      'max-w-xs lg:max-w-md px-4 py-2 rounded-lg',
                      message.sender === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary text-secondary-foreground',
                    )}
                  >
                    <p className="text-sm">{message.text}</p>
                  </div>

                  {message.sender === 'user' && (
                    <div className="w-8 h-8 bg-muted rounded-lg flex items-center justify-center flex-shrink-0">
                      <User className="w-4 h-4 text-muted-foreground" />
                    </div>
                  )}
                </div>
              ))}

              {isLoading && (
                <div className="flex gap-3 animate-fade-in">
                  <div className="w-8 h-8 bg-gradient-primary rounded-lg flex items-center justify-center flex-shrink-0">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                  <div className="bg-secondary text-secondary-foreground px-4 py-2 rounded-lg">
                    <span className="text-sm">Thinking...</span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Example Questions */}
            <div className="px-6 py-4 border-t border-border bg-secondary/50">
              <p className="text-sm text-muted-foreground mb-3 flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                Try these example questions:
              </p>
              <div className="flex flex-wrap gap-2">
                {exampleQuestions.map((question, index) => (
                  <Button
                    key={index}
                    variant="ghost"
                    size="sm"
                    onClick={() => handleQuestionClick(question)}
                    className="text-xs h-8 border border-border hover:bg-accent"
                  >
                    {question}
                  </Button>
                ))}
              </div>
            </div>

            {/* Input Area */}
            <div className="p-6 border-t border-border">
              <div className="flex gap-2">
                <Input
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Ask me about your Hedera blockchain data..."
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  className="flex-1"
                />
                <Button
                  variant="chat"
                  size="sm"
                  onClick={handleSendMessage}
                  disabled={!inputValue.trim() || isLoading}
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ChatInterface;
