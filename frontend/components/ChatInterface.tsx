'use client';

import { useState, useRef, useEffect } from 'react';
import {
  PaperAirplaneIcon,
  StopIcon,
  PhotoIcon,
  DocumentIcon,
  MicrophoneIcon,
  CubeIcon,
  UserCircleIcon,
} from '@heroicons/react/24/outline';

interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
  txHash?: string;
}

interface ChatInterfaceProps {
  isSidebarOpen: boolean;
}

export default function ChatInterface({ isSidebarOpen }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      content:
        "Hello! I'm hgraph.ai, your blockchain-powered AI assistant. How can I help you today?",
      role: 'assistant',
      timestamp: new Date(),
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
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    setTimeout(() => {
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: `This is a simulated response to: "${userMessage.content}". In production, this would be processed through our blockchain-verified AI system.`,
        role: 'assistant',
        timestamp: new Date(),
        txHash: '0x' + Math.random().toString(36).substring(2, 15),
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

  return (
    <div className="flex-1 flex flex-col bg-slate-50">
      <div className="h-16 border-b border-slate-200 px-8 flex items-center justify-between bg-white">
        <div className="flex items-center space-x-4">
          <h1 className="text-lg font-medium text-slate-800">New Chat</h1>
          <div className="flex items-center space-x-2">
            <span className="h-2 w-2 bg-green-500 rounded-full"></span>
            <span className="text-xs text-slate-500">Connected</span>
          </div>
        </div>
        <div className="flex items-center space-x-6 text-xs text-slate-500">
          <span>GPT-4</span>
          <span>Hedera</span>
          <span>1,000 HGR</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-12 space-y-8">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`flex gap-4 max-w-2xl ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
              >
                <div className="flex-shrink-0">
                  {message.role === 'assistant' ? (
                    <div className="h-7 w-7 bg-slate-800 rounded-md flex items-center justify-center">
                      <CubeIcon className="h-4 w-4 text-white" />
                    </div>
                  ) : (
                    <div className="h-7 w-7 bg-slate-600 rounded-md flex items-center justify-center">
                      <UserCircleIcon className="h-4 w-4 text-white" />
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <div
                    className={`px-4 py-2.5 rounded-xl ${
                      message.role === 'user'
                        ? 'bg-slate-600 text-white'
                        : 'bg-white border border-slate-200 text-slate-800'
                    }`}
                  >
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
                  </div>
                  {message.txHash && (
                    <div className="mt-2 flex items-center space-x-2 text-xs text-slate-400">
                      <a
                        href="#"
                        className="hover:text-slate-600 transition-colors"
                        title={message.txHash}
                      >
                        {message.txHash.substring(0, 8)}...
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="flex gap-4 max-w-2xl">
                <div className="flex-shrink-0">
                  <div className="h-7 w-7 bg-slate-800 rounded-md flex items-center justify-center">
                    <CubeIcon className="h-4 w-4 text-white" />
                  </div>
                </div>
                <div className="px-4 py-3 bg-white border border-slate-200 rounded-xl">
                  <div className="flex space-x-1.5">
                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-pulse"></div>
                    <div
                      className="w-2 h-2 bg-slate-400 rounded-full animate-pulse"
                      style={{ animationDelay: '200ms' }}
                    ></div>
                    <div
                      className="w-2 h-2 bg-slate-400 rounded-full animate-pulse"
                      style={{ animationDelay: '400ms' }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="border-t border-slate-200 bg-white">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto px-4 py-6">
          <div className="flex items-end gap-4">
            <div className="flex gap-1">
              <button
                type="button"
                className="p-2.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
                title="Attach file"
              >
                <DocumentIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="p-2.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
                title="Upload image"
              >
                <PhotoIcon className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Message hgraph.ai..."
                className="w-full px-4 py-3 pr-12 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-transparent resize-none text-sm"
                rows={1}
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={!inputValue.trim() || isLoading}
                className={`absolute right-2 bottom-2.5 p-1.5 rounded-lg transition-colors ${
                  inputValue.trim() && !isLoading
                    ? 'bg-slate-800 text-white hover:bg-slate-700'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                {isLoading ? (
                  <StopIcon className="h-4 w-4" />
                ) : (
                  <PaperAirplaneIcon className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
