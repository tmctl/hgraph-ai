'use client';

import { useState, useRef, useEffect } from 'react';
import {
  PaperAirplaneIcon,
  StopIcon,
  PhotoIcon,
  DocumentIcon,
  SparklesIcon,
  UserIcon,
  CheckCircleIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import { PaperAirplaneIcon as PaperAirplaneIconSolid } from '@heroicons/react/24/solid';

interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
  txHash?: string;
  status?: 'sending' | 'sent' | 'verified';
}

interface ChatInterfaceProps {
  isSidebarOpen: boolean;
}

export default function ChatInterface({ isSidebarOpen }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      content:
        "Welcome to hgraph.ai! I'm your blockchain-powered AI assistant. I can help you with data analysis, smart contract interactions, and more. What would you like to explore today?",
      role: 'assistant',
      timestamp: new Date(),
      status: 'verified',
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
    }
  }, [inputValue]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: inputValue,
      role: 'user',
      timestamp: new Date(),
      status: 'sending',
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    // Simulate message being sent
    setTimeout(() => {
      setMessages((prev) =>
        prev.map((msg) => (msg.id === userMessage.id ? { ...msg, status: 'sent' } : msg)),
      );
    }, 300);

    // Simulate AI response
    setTimeout(() => {
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: `I understand you're asking about: "${userMessage.content}". Let me process this through our verified AI system and provide you with a comprehensive response.\n\nThis would include blockchain-verified data and smart contract interactions in production.`,
        role: 'assistant',
        timestamp: new Date(),
        txHash: '0x' + Math.random().toString(36).substring(2, 15),
        status: 'verified',
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setIsLoading(false);
    }, 1500);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as any);
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  return (
    <div className="flex-1 flex flex-col bg-gradient-to-b from-slate-50 to-white">
      {/* Enhanced Header */}
      <div className="h-16 border-b border-slate-200/80 px-4 sm:px-6 lg:px-8 flex items-center justify-between bg-white/80 backdrop-blur-sm">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-3">
            <div className="relative">
              <div className="h-8 w-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center shadow-sm">
                <SparklesIcon className="h-4 w-4 text-white" />
              </div>
              <span className="absolute -bottom-1 -right-1 h-3 w-3 bg-green-500 rounded-full border-2 border-white"></span>
            </div>
            <div>
              <h1 className="text-sm font-semibold text-slate-900">AI Assistant</h1>
              <p className="text-xs text-slate-500">Blockchain Verified</p>
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-3 sm:space-x-4">
          <div className="hidden sm:flex items-center space-x-2 px-3 py-1.5 bg-slate-50 rounded-lg">
            <CheckCircleIcon className="h-4 w-4 text-green-500" />
            <span className="text-xs font-medium text-slate-600">Hedera Network</span>
          </div>
          <div className="flex items-center space-x-2 px-3 py-1.5 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-blue-200/50">
            <span className="text-xs font-semibold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              1,000 HGR
            </span>
          </div>
        </div>
      </div>

      {/* Enhanced Messages Container */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
          {messages.map((message, index) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} animate-fadeIn`}
            >
              <div
                className={`group flex gap-3 max-w-[85%] sm:max-w-[75%] lg:max-w-[70%] ${
                  message.role === 'user' ? 'flex-row-reverse' : ''
                }`}
              >
                {/* Avatar */}
                <div className="flex-shrink-0 mt-1">
                  {message.role === 'assistant' ? (
                    <div className="h-8 w-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center shadow-md">
                      <SparklesIcon className="h-4 w-4 text-white" />
                    </div>
                  ) : (
                    <div className="h-8 w-8 bg-gradient-to-br from-slate-600 to-slate-700 rounded-lg flex items-center justify-center shadow-md">
                      <UserIcon className="h-4 w-4 text-white" />
                    </div>
                  )}
                </div>

                {/* Message Content */}
                <div className="flex-1 space-y-1">
                  <div
                    className={`px-4 py-3 rounded-2xl shadow-sm transition-all duration-200 ${
                      message.role === 'user'
                        ? 'bg-gradient-to-br from-slate-700 to-slate-800 text-white rounded-tr-sm'
                        : 'bg-white border border-slate-200/80 text-slate-800 rounded-tl-sm hover:shadow-md'
                    }`}
                  >
                    <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                      {message.content}
                    </p>
                  </div>

                  {/* Message Meta */}
                  <div
                    className={`flex items-center gap-2 px-1 text-xs text-slate-400 ${
                      message.role === 'user' ? 'justify-end' : ''
                    }`}
                  >
                    <span className="flex items-center gap-1">
                      <ClockIcon className="h-3 w-3" />
                      {formatTime(message.timestamp)}
                    </span>

                    {message.status === 'verified' && (
                      <span className="flex items-center gap-1 text-green-500">
                        <CheckCircleIcon className="h-3 w-3" />
                        Verified
                      </span>
                    )}

                    {message.status === 'sending' && (
                      <span className="text-slate-400">Sending...</span>
                    )}

                    {message.txHash && (
                      <a
                        href="#"
                        className="flex items-center gap-1 hover:text-slate-600 transition-colors group"
                        title={`Transaction: ${message.txHash}`}
                      >
                        <span className="font-mono text-[10px]">
                          {message.txHash.substring(0, 6)}...
                        </span>
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start animate-fadeIn">
              <div className="flex gap-3 max-w-[70%]">
                <div className="flex-shrink-0 mt-1">
                  <div className="h-8 w-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center shadow-md animate-pulse">
                    <SparklesIcon className="h-4 w-4 text-white" />
                  </div>
                </div>
                <div className="px-4 py-3 bg-white border border-slate-200/80 rounded-2xl rounded-tl-sm shadow-sm">
                  <div className="flex items-center space-x-2">
                    <div className="flex space-x-1">
                      <div
                        className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"
                        style={{ animationDelay: '0ms' }}
                      ></div>
                      <div
                        className="w-2 h-2 bg-purple-500 rounded-full animate-bounce"
                        style={{ animationDelay: '150ms' }}
                      ></div>
                      <div
                        className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"
                        style={{ animationDelay: '300ms' }}
                      ></div>
                    </div>
                    <span className="text-xs text-slate-500 ml-2">AI is thinking...</span>
                  </div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Enhanced Input Area */}
      <div className="border-t border-slate-200/80 bg-white/95 backdrop-blur-sm">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-end gap-2 sm:gap-3">
            {/* Attachment Buttons */}
            <div className="flex gap-1">
              <button
                type="button"
                className="p-2 sm:p-2.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all duration-200 hover:scale-105"
                title="Attach file"
              >
                <DocumentIcon className="h-4 w-4 sm:h-5 sm:w-5" />
              </button>
              <button
                type="button"
                className="p-2 sm:p-2.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all duration-200 hover:scale-105"
                title="Upload image"
              >
                <PhotoIcon className="h-4 w-4 sm:h-5 sm:w-5" />
              </button>
            </div>

            {/* Input Field */}
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask me anything..."
                className="w-full px-4 py-3 pr-12 bg-slate-50/50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white resize-none text-sm transition-all duration-200 placeholder:text-slate-400"
                rows={1}
                disabled={isLoading}
              />

              {/* Character Count */}
              {inputValue.length > 0 && (
                <span className="absolute left-4 bottom-[-20px] text-[10px] text-slate-400">
                  {inputValue.length} characters
                </span>
              )}

              {/* Send Button */}
              <button
                type="submit"
                disabled={!inputValue.trim() || isLoading}
                className={`absolute right-2 bottom-2 p-2 rounded-xl transition-all duration-200 transform ${
                  inputValue.trim() && !isLoading
                    ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white hover:scale-105 hover:shadow-lg'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                {isLoading ? (
                  <StopIcon className="h-4 w-4" />
                ) : (
                  <PaperAirplaneIconSolid className="h-4 w-4 -rotate-45" />
                )}
              </button>
            </div>
          </div>

          {/* Helper Text */}
          <div className="mt-2 px-2 flex items-center justify-between">
            <p className="text-[10px] text-slate-400">
              Press{' '}
              <kbd className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-600 font-mono">
                Enter
              </kbd>{' '}
              to send,{' '}
              <kbd className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-600 font-mono">
                Shift+Enter
              </kbd>{' '}
              for new line
            </p>
            {!isLoading && (
              <p className="text-[10px] text-slate-400">Powered by blockchain-verified AI</p>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
