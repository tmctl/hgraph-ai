'use client';

import { useState } from 'react';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
  ChatBubbleLeftIcon,
  Cog6ToothIcon,
  UserCircleIcon,
  ArrowRightOnRectangleIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

interface ChatHistory {
  id: string;
  title: string;
  timestamp: string;
}

export default function Sidebar({ isOpen, onToggle }: SidebarProps) {
  const [chatHistory] = useState<ChatHistory[]>([
    { id: '1', title: 'Blockchain Integration', timestamp: 'Today' },
    { id: '2', title: 'Token Economics', timestamp: 'Yesterday' },
    { id: '3', title: 'AI Model Training', timestamp: '2 days ago' },
  ]);

  return (
    <div
      className={`${isOpen ? 'w-72' : 'w-20'} bg-gradient-to-b from-slate-900 to-slate-950 text-white transition-all duration-300 flex flex-col border-r border-slate-800/50 shadow-xl`}
    >
      <div className="h-16 px-4 sm:px-6 flex items-center justify-between border-b border-slate-800/50">
        <div className={`flex items-center ${!isOpen && 'justify-center w-full'}`}>
          {isOpen ? (
            <div className="flex items-center space-x-3">
              <div className="h-8 w-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center shadow-lg">
                <SparklesIcon className="h-5 w-5 text-white" />
              </div>
              <div>
                <span className="text-base font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                  hgraph.ai
                </span>
                <p className="text-[10px] text-slate-400">Blockchain AI</p>
              </div>
            </div>
          ) : (
            <div className="h-8 w-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center shadow-lg">
              <SparklesIcon className="h-5 w-5 text-white" />
            </div>
          )}
        </div>
        {isOpen && (
          <button
            onClick={onToggle}
            className="p-1.5 hover:bg-slate-800/50 rounded-lg transition-all duration-200 hover:scale-105"
          >
            <ChevronLeftIcon className="h-4 w-4 text-slate-400" />
          </button>
        )}
      </div>

      <div className="p-3">
        <button className="w-full flex items-center justify-center space-x-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 py-2.5 px-4 rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-[1.02] group">
          <PlusIcon className="h-4 w-4 group-hover:rotate-90 transition-transform duration-200" />
          {isOpen && <span className="text-sm font-semibold">New Chat</span>}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2">
        {isOpen ? (
          <div className="space-y-1">
            {chatHistory.map((chat, index) => (
              <button
                key={chat.id}
                className="w-full text-left p-3 hover:bg-slate-800/30 rounded-lg transition-all duration-200 group hover:scale-[1.01] relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-blue-600/0 to-purple-600/0 group-hover:from-blue-600/10 group-hover:to-purple-600/10 transition-all duration-300"></div>
                <div className="flex items-center space-x-3 relative">
                  <div className="h-8 w-8 bg-slate-800/50 rounded-lg flex items-center justify-center group-hover:bg-slate-700/50 transition-colors">
                    <ChatBubbleLeftIcon className="h-4 w-4 text-slate-400 group-hover:text-slate-300" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-200 truncate group-hover:text-white transition-colors">
                      {chat.title}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">{chat.timestamp}</p>
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <ChevronRightIcon className="h-3 w-3 text-slate-400" />
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {chatHistory.slice(0, 3).map((_, index) => (
              <button
                key={index}
                className="w-full p-3 hover:bg-slate-800/30 rounded-lg transition-all duration-200 group"
              >
                <ChatBubbleLeftIcon className="h-5 w-5 text-slate-500 mx-auto group-hover:text-slate-400 transition-colors" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-slate-800/50 p-3 space-y-1">
        <button
          className={`w-full flex items-center ${isOpen ? 'space-x-3 px-3' : 'justify-center'} py-2.5 hover:bg-slate-800/30 rounded-lg transition-all duration-200 group`}
        >
          <div className="relative">
            <SparklesIcon className="h-4 w-4 text-purple-400 group-hover:text-purple-300 transition-colors" />
            <div className="absolute inset-0 bg-purple-400/20 blur-md group-hover:bg-purple-400/30 transition-all"></div>
          </div>
          {isOpen && (
            <span className="text-sm text-slate-300 group-hover:text-white transition-colors font-medium">
              Upgrade to Pro
            </span>
          )}
        </button>

        <button
          className={`w-full flex items-center ${isOpen ? 'space-x-3 px-3' : 'justify-center'} py-2.5 hover:bg-slate-800/30 rounded-lg transition-all duration-200 group`}
        >
          <UserCircleIcon className="h-4 w-4 text-slate-400 group-hover:text-slate-300 transition-colors" />
          {isOpen && (
            <span className="text-sm text-slate-400 group-hover:text-slate-300 transition-colors">
              Profile
            </span>
          )}
        </button>

        <button
          className={`w-full flex items-center ${isOpen ? 'space-x-3 px-3' : 'justify-center'} py-2.5 hover:bg-slate-800/30 rounded-lg transition-all duration-200 group`}
        >
          <Cog6ToothIcon className="h-4 w-4 text-slate-400 group-hover:text-slate-300 transition-colors" />
          {isOpen && (
            <span className="text-sm text-slate-400 group-hover:text-slate-300 transition-colors">
              Settings
            </span>
          )}
        </button>

        <div className="pt-2 mt-2 border-t border-slate-800/30">
          <button
            className={`w-full flex items-center ${isOpen ? 'space-x-3 px-3' : 'justify-center'} py-2.5 hover:bg-red-500/10 rounded-lg transition-all duration-200 group`}
          >
            <ArrowRightOnRectangleIcon className="h-4 w-4 text-red-400 group-hover:text-red-300 transition-colors" />
            {isOpen && (
              <span className="text-sm text-red-400 group-hover:text-red-300 transition-colors">
                Disconnect
              </span>
            )}
          </button>
        </div>
      </div>

      {!isOpen && (
        <div className="p-3 border-t border-slate-800/50">
          <button
            onClick={onToggle}
            className="w-full p-2.5 hover:bg-slate-800/30 rounded-lg transition-all duration-200 group hover:scale-105"
          >
            <ChevronRightIcon className="h-4 w-4 text-slate-400 mx-auto group-hover:text-slate-300 transition-colors" />
          </button>
        </div>
      )}
    </div>
  );
}
