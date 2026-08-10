'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Send, Bot, Check, Wand2, ArrowUp } from 'lucide-react';
import { PALETTE } from '../common/design';

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

const WELCOME_MESSAGE =
  "Hi! Tell me what you want to build and I'll write the blocks for you. Small change or full game — I can do both.";

const STARTER_PROMPTS = [
  'Make a hero that jumps with space',
  'Add 3 coins that spin and get collected',
  'Enemy chases me when I get close',
  'Play a jump sound when I press space',
];

export default function AIAssistant({
  projectId,
  onClose,
  onApplyUpdate,
}: AIAssistantProps) {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: WELCOME_MESSAGE },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [applyingUpdate, setApplyingUpdate] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSend = async (override?: string) => {
    const text = (override ?? input).trim();
    if (!text || isLoading) return;

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setIsLoading(true);

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          message: text,
          history: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error);

      const assistantMessage: Message = {
        role: 'assistant',
        content: data.message,
        update: data.update,
        suggestions: data.suggestions,
      };
      setMessages((prev) => [...prev, assistantMessage]);

      if (data.update) {
        setApplyingUpdate(true);
        try {
          await onApplyUpdate(data.update);
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: 'Done — your game just got updated. What next?',
            },
          ]);
        } catch (error) {
          console.error('Error applying update:', error);
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: 'I tried to update your game but something went wrong. Try rephrasing?',
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
          content: error.message || 'Something went wrong. Try rephrasing your request?',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const disabled = isLoading || applyingUpdate;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl h-[640px] flex flex-col overflow-hidden border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <span
              className="inline-flex items-center justify-center w-10 h-10 rounded-xl text-white"
              style={{
                background: `linear-gradient(135deg, ${PALETTE.ai}, ${PALETTE.motion})`,
              }}
            >
              <Bot className="w-5 h-5" />
            </span>
            <div>
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider leading-none mb-0.5">
                Beta
              </div>
              <h2 className="text-lg font-black tracking-tight text-slate-900">
                AI game helper
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="inline-flex items-center justify-center w-9 h-9 rounded-full text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 bg-gradient-to-b from-slate-50 to-white">
          {messages.map((message, i) => (
            <div key={i} className="space-y-2">
              <ChatRow role={message.role}>{message.content}</ChatRow>
              {message.suggestions && message.suggestions.length > 0 && (
                <SuggestionRow
                  suggestions={message.suggestions}
                  onClick={(s) => handleSend(s)}
                  disabled={disabled}
                />
              )}
            </div>
          ))}

          {/* Starter prompts (only shown on the very first turn) */}
          {messages.length === 1 && !isLoading && (
            <SuggestionRow
              suggestions={STARTER_PROMPTS}
              onClick={(s) => handleSend(s)}
              disabled={disabled}
              label="Try one of these"
            />
          )}

          {isLoading && (
            <StatusRow icon={<Wand2 className="w-4 h-4 animate-pulse" />}>
              Thinking…
            </StatusRow>
          )}
          {applyingUpdate && (
            <StatusRow tone="success" icon={<Check className="w-4 h-4" />}>
              Applying changes to your game…
            </StatusRow>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-slate-200 bg-white">
          <div className="flex items-end gap-2 rounded-2xl border border-slate-200 focus-within:border-slate-400 bg-white p-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={1}
              placeholder="Describe what to add or change…"
              className="flex-1 resize-none border-0 focus:outline-none px-2 py-1.5 text-sm max-h-32 text-slate-900 placeholder:text-slate-400 bg-transparent"
              disabled={disabled}
            />
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || disabled}
              aria-label="Send"
              className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-900 hover:bg-slate-800 text-white disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition"
            >
              <ArrowUp className="w-4 h-4" />
            </button>
          </div>
          <div className="mt-2 text-[10px] text-slate-400 px-1">
            Enter to send · Shift + Enter for a new line · Esc to close
          </div>
        </div>
      </div>
    </div>
  );
}

function ChatRow({
  role,
  children,
}: {
  role: 'user' | 'assistant';
  children: React.ReactNode;
}) {
  const isUser = role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm shadow-sm whitespace-pre-wrap ${
          isUser
            ? 'bg-slate-900 text-white'
            : 'bg-white text-slate-800 border border-slate-200'
        }`}
      >
        {children}
      </div>
    </div>
  );
}

function SuggestionRow({
  suggestions,
  onClick,
  disabled,
  label,
}: {
  suggestions: string[];
  onClick: (suggestion: string) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <div className="flex justify-start">
      <div className="max-w-full space-y-1.5">
        {label && (
          <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider px-1">
            {label}
          </p>
        )}
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((s, i) => (
            <button
              key={i}
              disabled={disabled}
              onClick={() => onClick(s)}
              className="text-[12px] font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-full px-3 py-1.5 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatusRow({
  icon,
  children,
  tone,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  tone?: 'success';
}) {
  const styles =
    tone === 'success'
      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
      : 'bg-white border-slate-200 text-slate-600';
  return (
    <div className="flex justify-start">
      <div
        className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm border shadow-sm ${styles}`}
      >
        {icon}
        {children}
      </div>
    </div>
  );
}
