'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Send, Bot, User, FileText } from '@/components/icons';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { ragApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/utils/cn';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: { metadata?: { doc_type?: string; file_name?: string; version?: number }; score: number }[];
}

const SUGGESTED_QUESTIONS = [
  'What is the current conformity score for ISO 9001?',
  'Which clauses have open non-conformities?',
  'What corrective actions are due this month?',
  'Summarize the latest audit findings',
];

interface RagChatPanelProps {
  variant?: 'page' | 'modal';
  className?: string;
}

export function RagChatPanel({ variant = 'page', className }: RagChatPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (question?: string) => {
    const text = (question || input).trim();
    if (!text) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      const res = await ragApi.chat({ question: text, history });
      const { answer, sources } = (res.data as {
        answer: string;
        sources?: { metadata?: { doc_type?: string; file_name?: string; version?: number }; score: number }[];
      });

      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: answer,
        sources,
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string; message?: string } } })?.response?.data
          ?.detail ||
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      const friendly =
        typeof detail === 'string' && detail.length > 0
          ? detail
          : 'Sorry, I encountered an error. Please try again.';
      toast.error(detail || 'Failed to get response');
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: friendly,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={cn('flex h-full flex-1 flex-col overflow-hidden', className)}>
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {messages.length === 0 && (
          <div className="py-8 text-center">
            <Bot className="mx-auto mb-4 h-16 w-16 text-[var(--brand-primary)] opacity-50" />
            <p className="mb-1 font-semibold text-[var(--text-primary)]">
              How can I help you today?
            </p>
            <p className="mb-6 text-sm text-[var(--muted)]">
              Ask me anything about your quality management system
            </p>
            <div className="mx-auto max-w-lg space-y-2">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => sendMessage(q)}
                  className="w-full rounded-xl border border-[var(--brand-primary)]/25 bg-[var(--surface)] px-4 py-3 text-left text-sm text-[var(--muted)] transition-hover hover:border-[var(--brand-primary)] hover:bg-[var(--nav-hover)]"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        <AnimatePresence>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className={`mb-4 flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              <Avatar className="h-9 w-9 shrink-0">
                <AvatarFallback
                  className={
                    msg.role === 'user'
                      ? 'bg-[var(--brand-primary)] text-white'
                      : 'bg-[var(--page-bg)] text-[var(--brand-primary)]'
                  }
                >
                  {msg.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                </AvatarFallback>
              </Avatar>
              <div className={msg.role === 'user' ? 'max-w-[75%] text-right' : 'max-w-[75%]'}>
                <div
                  className={`rounded-xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-[var(--brand-primary)] text-white'
                      : 'bg-[var(--page-bg)] text-[var(--text-primary)]'
                  }`}
                  style={{ whiteSpace: 'pre-wrap' }}
                >
                  {msg.content}
                </div>
                {msg.sources && msg.sources.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {msg.sources.map((src, i) => (
                      <Badge
                        key={i}
                        variant="default"
                        className="border border-[var(--border)] bg-[var(--surface)] text-[10px] font-normal"
                      >
                        <FileText className="mr-1 h-3 w-3" />
                        {src.metadata?.file_name || src.metadata?.doc_type || 'Doc'}
                        {src.metadata?.version ? ` v${src.metadata.version}` : ''} ·{' '}
                        {(src.score * 100).toFixed(0)}%
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {loading && (
          <div className="mb-4 flex items-center gap-2">
            <Avatar className="h-9 w-9">
              <AvatarFallback className="bg-[var(--page-bg)]">
                <Bot className="h-4 w-4 text-[var(--brand-primary)]" />
              </AvatarFallback>
            </Avatar>
            <div className="flex gap-1 rounded-xl bg-[var(--page-bg)] px-3 py-2">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="h-2 w-2 rounded-full bg-[var(--brand-primary)]"
                  animate={{ scale: [1, 1.3, 1] }}
                  transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
                />
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div
        className={cn(
          'border-t border-[var(--border)] p-3 sm:p-4',
          variant === 'modal' && 'sm:p-3',
        )}
      >
        <div className="flex items-end gap-2">
          <Textarea
            placeholder="Ask about your quality documents, audits, non-conformities…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            rows={2}
            className="min-h-[44px] resize-none"
          />
          <Button
            size="icon"
            className="h-11 w-11 shrink-0 bg-[var(--brand-primary)] hover:bg-[#33c4f5]"
            disabled={!input.trim() || loading}
            onClick={() => sendMessage()}
            aria-label="Send"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
