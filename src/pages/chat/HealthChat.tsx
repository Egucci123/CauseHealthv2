// src/pages/chat/HealthChat.tsx
import { useState, useRef, useEffect } from 'react';
import { AppShell } from '../../components/layout/AppShell';
import { Button } from '../../components/ui/Button';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../lib/supabase';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const QUICK_PROMPTS = [
  { label: 'Top 5 priorities', prompt: 'What are my top 5 health priorities right now based on my labs?' },
  { label: 'Explain my labs', prompt: 'Give me a simple summary of my lab results — what should I be concerned about?' },
  { label: 'Today\'s plan', prompt: 'What should I focus on today based on my wellness plan and labs?' },
  { label: 'Supplement timing', prompt: 'When should I take each of my supplements today and why?' },
];

export const HealthChat = () => {
  const userId = useAuthStore(s => s.user?.id);
  const firstName = useAuthStore(s => s.profile?.firstName) ?? '';
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || !userId || loading) return;
    const userMsg: ChatMessage = { role: 'user', content: text.trim(), timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/health-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token ?? ''}`, 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY },
        body: JSON.stringify({
          userId,
          message: text.trim(),
          history: messages.slice(-10).map(m => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      const reply = data.reply ?? data.error ?? 'Something went wrong. Please try again.';
      setMessages(prev => [...prev, { role: 'assistant', content: reply, timestamp: new Date() }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Connection error. Please try again.', timestamp: new Date() }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  return (
    <AppShell pageTitle="Health Chat">
      <div className="max-w-2xl mx-auto flex flex-col" style={{ height: 'calc(100vh - 200px)' }}>
        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-4 pb-4">
          {messages.length === 0 && (
            <div className="text-center py-12">
              <span className="material-symbols-outlined text-primary-container text-5xl mb-4 block">chat</span>
              <p className="text-authority text-2xl text-clinical-charcoal font-bold mb-2">Hi{firstName ? `, ${firstName}` : ''}.</p>
              <p className="text-body text-clinical-stone mb-8 max-w-sm mx-auto">Ask me anything about your labs, wellness plan, supplements, or health. I know your data.</p>
              <div className="flex flex-wrap justify-center gap-2">
                {QUICK_PROMPTS.map(qp => (
                  <button key={qp.label} onClick={() => sendMessage(qp.prompt)}
                    className="text-precision text-[0.65rem] font-bold tracking-wider uppercase px-4 py-2 bg-clinical-white border border-outline-variant/20 text-primary-container hover:bg-primary-container/5 transition-colors" style={{ borderRadius: '20px' }}>
                    {qp.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] px-4 py-3 ${msg.role === 'user'
                ? 'bg-primary-container text-white rounded-[16px] rounded-br-[4px]'
                : 'bg-clinical-white border border-outline-variant/15 text-clinical-charcoal rounded-[16px] rounded-bl-[4px]'
              }`}>
                <p className="text-body text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                <p className={`text-precision text-[0.5rem] mt-1 ${msg.role === 'user' ? 'text-white/50' : 'text-clinical-stone/50'}`}>
                  {msg.timestamp.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </p>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-clinical-white border border-outline-variant/15 rounded-[16px] rounded-bl-[4px] px-4 py-3">
                <div className="flex gap-1.5">
                  {[0,1,2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-primary-container/40 animate-pulse" style={{ animationDelay: `${i * 0.2}s` }} />)}
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t border-outline-variant/10 pt-3 pb-2">
          <div className="flex gap-2">
            <input ref={inputRef} type="text" value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
              placeholder="Ask about your labs, supplements, health..."
              className="flex-1 bg-clinical-white border border-outline-variant/20 rounded-full px-5 py-3 text-body text-sm text-clinical-charcoal placeholder-clinical-stone/50 focus:border-primary-container focus:ring-1 focus:ring-primary-container focus:outline-none"
            />
            <Button variant="primary" size="md" onClick={() => sendMessage(input)} loading={loading} disabled={!input.trim()} icon="send"
              className="rounded-full w-12 h-12 flex items-center justify-center p-0" />
          </div>
          <p className="text-precision text-[0.5rem] text-clinical-stone/40 text-center mt-2">Educational only — not medical advice. Discuss all findings with your doctor.</p>
        </div>
      </div>
    </AppShell>
  );
};
