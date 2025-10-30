import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { WalletConnectButton } from '@/components/WalletConnectButton';
import { useWallet } from '@/contexts/WalletContextHedera';
import { useNavigate } from 'react-router-dom';
import {
  Send,
  Bot,
  User,
  Sparkles,
  Zap,
  Maximize2,
  Minimize2,
  AlertCircle,
  Info,
  Code2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import cosmicBg from '@/assets/cosmic-bg.jpg';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useClaude } from '@/hooks/useClaude';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  timestamp: Date;
  sqlQuery?: string | null;
  queryDescription?: string | null;
  queryResults?: string | null;
}

const ChatHero = () => {
  const { accountId, isConnected } = useWallet();
  const navigate = useNavigate();

  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: 'Welcome to Hgraph AI! Connect your wallet to analyze your personal Hedera blockchain data, or ask general questions about any Hedera account or transaction.',
      sender: 'bot',
      timestamp: new Date(),
    },
  ]);

  // Update welcome message when wallet connection changes
  useEffect(() => {
    if (isConnected && accountId) {
      setMessages([
        {
          id: '1',
          text: `Welcome to Hgraph AI! Your wallet (${accountId}) is connected. I can now help you analyze your Hedera blockchain data. Try asking: "What's my account balance?" or "Show me my recent transactions"`,
          sender: 'bot',
          timestamp: new Date(),
        },
      ]);
    } else {
      setMessages([
        {
          id: '1',
          text: 'Welcome to Hgraph AI! Connect your wallet to analyze your personal Hedera blockchain data, or ask general questions about any Hedera account or transaction.',
          sender: 'bot',
          timestamp: new Date(),
        },
      ]);
    }
  }, [isConnected, accountId]);
  const [inputValue, setInputValue] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { sendMessageWithMetadata, isLoading, error, clearError } = useClaude();
  const [selectedQueryInfo, setSelectedQueryInfo] = useState<{
    query: string;
    description: string;
    results?: string | null;
  } | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const exampleQuestions = [
    'How many NFTs do I have?',
    'What is my account balance?',
    'Show me recent transactions',
    'Analyze this smart contract',
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

    // Build system prompt with connected account context
    let systemPrompt = `You are an AI assistant specialized in analyzing Hedera blockchain data. You help users understand their Hedera accounts, tokens, NFTs, smart contracts, and transaction history.`;

    if (isConnected && accountId) {
      systemPrompt += `\n\nThe user has connected their Hedera wallet with account ID: ${accountId}. When they ask questions using personal pronouns like "my", "I", or "me", use this account ID (${accountId}) in your SQL queries and analysis. For example:
- "my balance" refers to the balance of account ${accountId}
- "my NFTs" refers to NFTs owned by account ${accountId}
- "transactions I sent" refers to transactions from account ${accountId}`;
    } else {
      systemPrompt += `\n\nThe user has not connected a wallet yet. If they ask personal questions, remind them to connect their wallet first using the "Connect Wallet" button.`;
    }

    systemPrompt += `\n\nProvide clear, informative responses about Hedera blockchain queries. Keep responses concise but informative, and use markdown formatting when helpful for readability.`;

    try {
      const { response: responseText, metadata } = await sendMessageWithMetadata(
        currentQuestion,
        systemPrompt,
        accountId || undefined,
      );

      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: responseText,
        sender: 'bot',
        timestamp: new Date(),
        sqlQuery: metadata?.sqlQuery,
        queryDescription: metadata?.queryDescription,
        queryResults: metadata?.queryResults,
      };

      setMessages((prev) => [...prev, botMessage]);
    } catch (error) {
      console.error('Error querying Claude:', error);

      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        text:
          error instanceof Error
            ? error.message
            : 'Sorry, I encountered an error while processing your query. Please try again.',
        sender: 'bot',
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, errorMessage]);
    }
  };

  const handleQuestionClick = (question: string) => {
    setInputValue(question);
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col">
        {/* Query Info Modal */}
        {selectedQueryInfo && (
          <div
            className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4"
            onClick={() => setSelectedQueryInfo(null)}
          >
            <div
              className="bg-card rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b border-border">
                <div className="flex items-center gap-2">
                  <Code2 className="w-5 h-5 text-primary" />
                  <h3 className="font-semibold">SQL Query Details</h3>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedQueryInfo(null)}
                  className="hover:bg-muted"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <div className="p-4 space-y-4 overflow-y-auto max-h-[70vh]">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Description</h4>
                  <p className="text-sm">{selectedQueryInfo.description}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">
                    Generated SQL Query
                  </h4>
                  <pre className="bg-muted p-3 rounded-lg overflow-x-auto">
                    <code className="text-xs font-mono">{selectedQueryInfo.query}</code>
                  </pre>
                </div>
                {selectedQueryInfo.results && (
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-2">
                      Execution Results
                    </h4>
                    <div className="bg-muted p-3 rounded-lg overflow-x-auto">
                      <pre className="text-xs font-mono whitespace-pre-wrap">
                        {(() => {
                          try {
                            const parsed = JSON.parse(selectedQueryInfo.results);
                            if (parsed.fullResults) {
                              return parsed.fullResults;
                            }
                          } catch (e) {
                            // If not JSON, return as is
                          }
                          return selectedQueryInfo.results;
                        })()}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Fullscreen Header */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-card/50 backdrop-blur-sm">
          <h2 className="text-lg font-semibold text-foreground">Hgraph AI Chat</h2>
          <div className="flex items-center gap-2">
            <WalletConnectButton />
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleFullscreen}
              className="text-muted-foreground hover:text-foreground"
            >
              <Minimize2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mx-6 mb-4 p-4 bg-destructive/10 border border-destructive/20 rounded-xl flex items-center gap-3 animate-fade-in">
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

        {/* Fullscreen Chat */}
        <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full min-h-0">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4 min-h-0">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  'flex gap-3 animate-fade-in',
                  message.sender === 'user' ? 'justify-end' : 'justify-start',
                )}
              >
                {message.sender === 'bot' && (
                  <div className="w-8 h-8 bg-gradient-primary rounded-lg flex items-center justify-center flex-shrink-0 shadow-soft">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <div
                    className={cn(
                      'max-w-xs lg:max-w-md px-4 py-3 rounded-xl',
                      message.sender === 'user'
                        ? 'bg-primary text-primary-foreground shadow-soft'
                        : 'bg-muted text-muted-foreground border border-border',
                    )}
                  >
                    <div className="text-sm leading-relaxed prose prose-invert max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown>
                    </div>
                  </div>
                  {message.sender === 'bot' && message.sqlQuery && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setSelectedQueryInfo({
                          query: message.sqlQuery!,
                          description: message.queryDescription || 'No description available',
                          results: message.queryResults,
                        })
                      }
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground self-start"
                    >
                      <Info className="w-3 h-3" />
                      View SQL Query
                    </Button>
                  )}
                </div>

                {message.sender === 'user' && (
                  <div className="w-8 h-8 bg-secondary rounded-lg flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-secondary-foreground" />
                  </div>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="flex gap-3 animate-fade-in">
                <div className="w-8 h-8 bg-gradient-primary rounded-lg flex items-center justify-center flex-shrink-0 shadow-soft">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <div className="bg-muted text-muted-foreground px-4 py-3 rounded-xl border border-border">
                  <span className="text-sm">Thinking...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-6 border-t border-border bg-card/50">
            <div className="flex gap-3">
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Ask me about Hedera blockchain data..."
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                className="flex-1"
              />
              <Button
                variant="default"
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
    );
  }

  return (
    <section className="relative min-h-screen bg-gradient-cosmic overflow-hidden">
      {/* Query Info Modal */}
      {selectedQueryInfo && (
        <div
          className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4"
          onClick={() => setSelectedQueryInfo(null)}
        >
          <div
            className="bg-card rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Code2 className="w-5 h-5 text-primary" />
                <h3 className="font-semibold">SQL Query Details</h3>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedQueryInfo(null)}
                className="hover:bg-muted"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="p-4 space-y-4 overflow-y-auto max-h-[70vh]">
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-2">Description</h4>
                <p className="text-sm">{selectedQueryInfo.description}</p>
              </div>
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-2">
                  Generated SQL Query
                </h4>
                <pre className="bg-muted p-3 rounded-lg overflow-x-auto">
                  <code className="text-xs font-mono">{selectedQueryInfo.query}</code>
                </pre>
              </div>
              {selectedQueryInfo.results && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">
                    Execution Results
                  </h4>
                  <div className="bg-muted p-3 rounded-lg overflow-x-auto">
                    <pre className="text-xs font-mono whitespace-pre-wrap">
                      {(() => {
                        try {
                          const parsed = JSON.parse(selectedQueryInfo.results);
                          if (parsed.fullResults) {
                            return parsed.fullResults;
                          }
                        } catch (e) {
                          // If not JSON, return as is
                        }
                        return selectedQueryInfo.results;
                      })()}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cosmic Background */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-40"
        style={{ backgroundImage: `url(${cosmicBg})` }}
      />

      {/* Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-hero/60" />

      <div className="container mx-auto px-4 py-32 relative z-10">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8 animate-fade-in">
            <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight">
              Ask Questions,
              <span className="bg-gradient-primary bg-clip-text text-transparent">
                {' '}
                Get Insights
              </span>
            </h1>

            <p className="text-xl md:text-2xl text-white/80 mb-8 max-w-3xl mx-auto leading-relaxed">
              Transform natural language questions about Hedera blockchain into beautiful
              visualizations and actionable insights.
            </p>

            <div className="flex items-center justify-center gap-2 mb-8">
              <button
                onClick={() => navigate('/mcp-dashboard')}
                className="flex items-center gap-2 text-accent hover:text-accent/80 transition-colors group"
              >
                <Zap className="w-5 h-5 group-hover:animate-pulse" />
                <span className="font-medium underline underline-offset-2">Powered by Hgraph's MCP Server</span>
              </button>
            </div>
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

          {/* Chat Interface */}
          <div className="bg-card/10 backdrop-blur-xl border border-white/20 rounded-2xl shadow-large overflow-hidden animate-slide-up">
            {/* Chat Header with Fullscreen and Wallet Connect Button */}
            <div className="flex items-center justify-between p-4 border-b border-white/20 bg-white/5">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-accent" />
                <span className="text-white font-medium">Hgraph AI Chat</span>
              </div>
              <div className="flex items-center gap-2">
                <WalletConnectButton />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleFullscreen}
                  className="text-white/70 hover:text-white hover:bg-white/10 border border-white/20"
                >
                  <Maximize2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
            {/* Messages */}
            <div className="h-72 overflow-y-auto p-6 space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    'flex gap-3 animate-fade-in',
                    message.sender === 'user' ? 'justify-end' : 'justify-start',
                  )}
                >
                  {message.sender === 'bot' && (
                    <div className="w-8 h-8 bg-gradient-primary rounded-lg flex items-center justify-center flex-shrink-0 shadow-glow">
                      <Bot className="w-4 h-4 text-white" />
                    </div>
                  )}

                  <div className="flex flex-col gap-2">
                    <div
                      className={cn(
                        'max-w-xs lg:max-w-md px-4 py-3 rounded-xl backdrop-blur-sm',
                        message.sender === 'user'
                          ? 'bg-primary/90 text-white shadow-glow'
                          : 'bg-white/10 text-white border border-white/20',
                      )}
                    >
                      <div className="text-sm leading-relaxed prose prose-invert max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown>
                      </div>
                    </div>
                    {message.sender === 'bot' && message.sqlQuery && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setSelectedQueryInfo({
                            query: message.sqlQuery!,
                            description: message.queryDescription || 'No description available',
                            results: message.queryResults,
                          })
                        }
                        className="flex items-center gap-1 text-xs text-white/60 hover:text-white self-start hover:bg-white/10"
                      >
                        <Info className="w-3 h-3" />
                        View SQL Query
                      </Button>
                    )}
                  </div>

                  {message.sender === 'user' && (
                    <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0 backdrop-blur-sm">
                      <User className="w-4 h-4 text-white" />
                    </div>
                  )}
                </div>
              ))}

              {isLoading && (
                <div className="flex gap-3 animate-fade-in">
                  <div className="w-8 h-8 bg-gradient-primary rounded-lg flex items-center justify-center flex-shrink-0 shadow-glow">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                  <div className="bg-white/10 text-white px-4 py-3 rounded-xl backdrop-blur-sm border border-white/20">
                    <span className="text-sm">Thinking...</span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Example Questions */}
            <div className="px-6 py-4 border-t border-white/20 bg-white/5">
              <p className="text-sm text-white/70 mb-3 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-accent" />
                Try these example questions:
              </p>
              <div className="flex flex-wrap gap-2">
                {exampleQuestions.map((question, index) => (
                  <Button
                    key={index}
                    variant="ghost"
                    size="sm"
                    onClick={() => handleQuestionClick(question)}
                    className="text-xs h-8 border border-white/20 hover:bg-white/10 text-white/80 hover:text-white"
                  >
                    {question}
                  </Button>
                ))}
              </div>
            </div>

            {/* Input Area */}
            <div className="p-6 border-t border-white/20 bg-white/5">
              <div className="flex gap-3">
                <Input
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Ask me about Hedera blockchain data..."
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  className="flex-1 bg-white/10 border-white/20 text-white placeholder:text-white/50 focus:border-accent"
                />
                <Button
                  variant="hero"
                  size="sm"
                  onClick={handleSendMessage}
                  disabled={!inputValue.trim() || isLoading}
                  className="shadow-glow"
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

export default ChatHero;
