import React, { useState, useRef, useEffect } from 'react';
import { Message } from '../types';
import { ChartRenderer } from './ChartRenderer';
import { Send, Bot, User, Loader2, Sparkles } from 'lucide-react';

interface ChatInterfaceProps {
  messages: Message[];
  onSendMessage: (text: string) => void;
  isLoading: boolean;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ messages, onSendMessage, isLoading }) => {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      onSendMessage(input);
      setInput('');
    }
  };

  return (
    <div className="flex flex-col h-[600px] bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl">
      {/* Header */}
      <div className="p-4 bg-zinc-900 border-b border-zinc-800 flex items-center space-x-2">
        <Sparkles className="w-5 h-5 text-blue-400" />
        <h2 className="text-lg font-semibold text-white">Analysis Chat</h2>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-zinc-500 space-y-4">
            <Bot className="w-12 h-12 opacity-50" />
            <p className="text-center max-w-xs">
              Upload data and ask questions like <br/>
              <span className="text-zinc-400 italic">"What are the top selling regions?"</span> or <br/>
              <span className="text-zinc-400 italic">"Graph the monthly profit trend"</span>
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl p-4 ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-none'
                  : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-bl-none'
              }`}
            >
              <div className="flex items-start space-x-2 mb-1">
                 {msg.role === 'model' ? <Bot className="w-4 h-4 mt-1 opacity-70"/> : <User className="w-4 h-4 mt-1 opacity-70"/>}
                 <span className="text-xs font-semibold opacity-70 uppercase tracking-wider">{msg.role === 'model' ? 'DataWhisperer' : 'You'}</span>
              </div>
              
              <div className="prose prose-invert prose-sm max-w-none whitespace-pre-wrap leading-relaxed">
                {msg.text}
              </div>
              
              {msg.chart && (
                <div className="mt-4">
                  <ChartRenderer config={msg.chart} />
                </div>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-slate-800 border border-slate-700 rounded-2xl rounded-bl-none p-4 flex items-center space-x-3">
              <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
              <span className="text-slate-400 text-sm">Analyzing data...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-slate-800 border-t border-slate-700">
        <form onSubmit={handleSubmit} className="flex space-x-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your data..."
            className="flex-1 bg-slate-900 border border-slate-600 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-slate-500 transition-all"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
};