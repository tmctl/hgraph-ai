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
  CubeIcon,
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
      className={`${isOpen ? 'w-72' : 'w-20'} bg-slate-950 text-white transition-all duration-300 flex flex-col border-r border-slate-800`}
    >
      <div className="h-16 px-6 flex items-center justify-between border-b border-slate-800">
        <div className={`flex items-center ${!isOpen && 'justify-center w-full'}`}>
          {isOpen ? (
            <div className="flex items-center space-x-3">
              <CubeIcon className="h-7 w-7 text-blue-500" />
              <span className="text-lg font-semibold">hgraph.ai</span>
            </div>
          ) : (
            <CubeIcon className="h-7 w-7 text-blue-500" />
          )}
        </div>
        {isOpen && (
          <button
            onClick={onToggle}
            className="p-1.5 hover:bg-slate-800 rounded-md transition-colors"
          >
            <ChevronLeftIcon className="h-4 w-4 text-slate-400" />
          </button>
        )}
      </div>

      <div className="p-4">
        <button className="w-full flex items-center justify-center space-x-2 bg-slate-800 hover:bg-slate-700 py-2.5 px-4 rounded-md transition-colors border border-slate-700">
          <PlusIcon className="h-4 w-4" />
          {isOpen && <span className="text-sm font-medium">New Chat</span>}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4">
        {isOpen ? (
          <div className="space-y-1">
            {chatHistory.map((chat) => (
              <button
                key={chat.id}
                className="w-full text-left p-3 hover:bg-slate-800/50 rounded-md transition-colors group"
              >
                <div className="flex items-center space-x-3">
                  <ChatBubbleLeftIcon className="h-4 w-4 text-slate-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-200 truncate">{chat.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{chat.timestamp}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {chatHistory.slice(0, 3).map((_, index) => (
              <button
                key={index}
                className="w-full p-3 hover:bg-slate-800/50 rounded-md transition-colors"
              >
                <ChatBubbleLeftIcon className="h-5 w-5 text-slate-500 mx-auto" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-slate-800 p-4 space-y-1">
        <button
          className={`w-full flex items-center ${isOpen ? 'space-x-3 px-3' : 'justify-center'} py-2.5 hover:bg-slate-800/50 rounded-md transition-colors`}
        >
          <SparklesIcon className="h-4 w-4 text-slate-400" />
          {isOpen && <span className="text-sm text-slate-300">Upgrade</span>}
        </button>

        <button
          className={`w-full flex items-center ${isOpen ? 'space-x-3 px-3' : 'justify-center'} py-2.5 hover:bg-slate-800/50 rounded-md transition-colors`}
        >
          <UserCircleIcon className="h-4 w-4 text-slate-400" />
          {isOpen && <span className="text-sm text-slate-300">Profile</span>}
        </button>

        <button
          className={`w-full flex items-center ${isOpen ? 'space-x-3 px-3' : 'justify-center'} py-2.5 hover:bg-slate-800/50 rounded-md transition-colors`}
        >
          <Cog6ToothIcon className="h-4 w-4 text-slate-400" />
          {isOpen && <span className="text-sm text-slate-300">Settings</span>}
        </button>

        <button
          className={`w-full flex items-center ${isOpen ? 'space-x-3 px-3' : 'justify-center'} py-2.5 hover:bg-slate-800/50 rounded-md transition-colors`}
        >
          <ArrowRightOnRectangleIcon className="h-4 w-4 text-red-400" />
          {isOpen && <span className="text-sm text-red-400">Disconnect</span>}
        </button>
      </div>

      {!isOpen && (
        <div className="p-4 border-t border-slate-800">
          <button
            onClick={onToggle}
            className="w-full p-2.5 hover:bg-slate-800 rounded-md transition-colors"
          >
            <ChevronRightIcon className="h-4 w-4 text-slate-400 mx-auto" />
          </button>
        </div>
      )}
    </div>
  );
}
