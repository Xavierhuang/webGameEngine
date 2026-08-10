'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Send, Sparkles, Check, Wand2, Mic } from 'lucide-react';

interface AIAssistantProps {
  projectId: string;
  onClose: () => void;
  onApplyUpdate: (update: any) => void;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  update?: any;
  suggestions?: string[];
}

export default function AIAssistant({
  projectId,
  onClose,
  onApplyUpdate,
}: AIAssistantProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "Hi! I'm your AI game building assistant! 🎮\n\nJust tell me what you want to create and I'll build it for you. You can keep asking me to add things, change things, or make improvements - I'll keep building your game step by step!",
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [applyingUpdate, setApplyingUpdate] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          message: userMessage,
          history: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      const assistantMessage: Message = {
        role: 'assistant',
        content: data.message,
        update: data.update,
        suggestions: data.suggestions,
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // Automatically apply update if provided
      if (data.update) {
        setApplyingUpdate(true);
        try {
          await onApplyUpdate(data.update);
          // Show success message
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: '✅ Done! I&apos;ve updated your game. What would you like to add or change next?',
            },
          ]);
        } catch (error) {
          console.error('Error applying update:', error);
      setMessages((prev) => [
        ...prev,
            {
              role: 'assistant',
              content: 'I tried to update your game, but something went wrong. Can you try again?',
            },
      ]);
        } finally {
          setApplyingUpdate(false);
        }
      }
    } catch (error: any) {
      console.error('AI error:', error);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: error.message || "Oops! I had trouble with that. Can you try asking in a different way?",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInput(suggestion);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl h-[600px] flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-500 to-pink-500 p-4 rounded-t-2xl flex items-center justify-between">
          <div className="flex items-center gap-2 text-white">
            <Sparkles className="w-6 h-6" />
            <h2 className="text-xl font-bold">AI Game Helper</h2>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white hover:bg-opacity-20 rounded-full p-2"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.map((message, index) => (
            <div key={index} className="space-y-2">
            <div
              className={`flex ${
                message.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              <div
                className={`max-w-[80%] p-4 rounded-2xl ${
                  message.role === 'user'
                    ? 'bg-purple-500 text-white'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                  <div className="whitespace-pre-wrap">{message.content}</div>
                </div>
              </div>
              
              {/* Show suggestions from AI */}
              {message.suggestions && message.suggestions.length > 0 && (
                <div className="flex justify-start">
                  <div className="max-w-[80%] space-y-2">
                    <p className="text-xs text-gray-500 px-2">Try asking:</p>
                    <div className="flex flex-wrap gap-2">
                      {message.suggestions.map((suggestion, i) => (
                        <button
                          key={i}
                          onClick={() => handleSuggestionClick(suggestion)}
                          className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-full text-sm font-medium border border-purple-200 transition-colors"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
          
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-gray-100 p-4 rounded-2xl">
                <div className="flex items-center gap-2">
                  <Wand2 className="w-4 h-4 text-purple-500 animate-pulse" />
                  <span className="text-sm text-gray-600">Building your game...</span>
                </div>
              </div>
            </div>
          )}
          
          {applyingUpdate && (
            <div className="flex justify-start">
              <div className="bg-green-50 border border-green-200 p-4 rounded-2xl">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-green-600" />
                  <span className="text-sm text-green-700">Applying changes to your game...</span>
                </div>
              </div>
        </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t">
          <div className="flex gap-2">
            <button className="bg-gray-100 hover:bg-gray-200 p-3 rounded-full">
              <Mic className="w-5 h-5 text-gray-600" />
            </button>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Keep building... tell me what to add or change..."
              className="flex-1 px-4 py-3 border border-gray-300 rounded-full focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              disabled={isLoading || applyingUpdate}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading || applyingUpdate}
              className="bg-purple-500 hover:bg-purple-600 disabled:bg-gray-300 text-white p-3 rounded-full transition-colors"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


