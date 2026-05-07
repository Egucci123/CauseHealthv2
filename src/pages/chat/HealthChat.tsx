// src/pages/chat/HealthChat.tsx
import { useState, useRef, useEffect } from 'react';
import { AppShell } from '../../components/layout/AppShell';
import { Button } from '../../components/ui/Button';
import { useAuthStore } from '../../store/authStore';
import { useSubscription } from '../../lib/subscription';
import { PaywallGate } from '../../components/paywall/PaywallGate';


interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  chips?: string[];
}

const QUICK_PROMPTS = [
  { label: 'Why am I tired?', prompt: 'Why am I tired? Use my labs to explain.' },
  { label: 'Explain my labs', prompt: 'Explain my lab results in plain English in 1 minute.' },
  { label: "Today's 3 things", prompt: 'What 3 things should I do today based on my plan?' },
  { label: 'Top priorities', prompt: 'What are my top 3 health priorities right now?' },
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
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/health-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY },
        body: JSON.stringify({
          userId,
          message: text.trim(),
          history: messages.slice(-10).map(m => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      // Soft-block when chat cap is reached. The server returns 429 +
      // CHAT_LIMIT_REACHED — render the message as a system note rather
      // than a normal assistant reply so the user understands it's a
      // budget signal, not a content answer.
      if (res.status === 429 && data?.code === 'CHAT_LIMIT_REACHED') {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: data.error ?? 'You\'ve used all your chat messages for this lab dataset. Upload new labs to keep chatting.',
          timestamp: new Date(),
          chips: ['Upload new labs ($5)'],
        }]);
        return;
      }
      const reply = data.reply ?? data.error ?? 'Something went wrong. Please try again.';
      const chips: string[] = Array.isArray(data.chips) ? data.chips : [];
      setMessages(prev => [...prev, { role: 'assistant', content: reply, timestamp: new Date(), chips }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Connection error. Please try again.', timestamp: new Date() }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const { isPro } = useSubscription();

  if (!isPro) {
    return (
      <AppShell pageTitle="Health Chat" showDisclaimer>
        <PaywallGate
          feature="Health Chat"
          description="Ask anything about your labs, symptoms, supplements, or what to do next. The AI knows your data — labs, meds, conditions, goals — and answers like a smart friend who's read your file."
        >
          {/* never rendered — gate blocks free users */}
          <div />
        </PaywallGate>
      </AppShell>
    );
  }

  return (
    <AppShell pageTitle="Health Chat" showDisclaimer>
      {/* Dark hero card */}
      <div className="bg-[#131313] rounded-[14px] p-6 shadow-card">
        <p className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-[#D4A574] mb-2">Ask Anything</p>
        <h1 className="text-authority text-3xl md:text-4xl text-on-surface font-bold leading-tight">Hi{firstName ? `, ${firstName}` : ''}.</h1>
        <p className="text-body text-on-surface-variant text-sm mt-2 max-w-md">I know your labs, meds, supplements, and goals. Ask me anything about your health like you'd text a smart friend.</p>
      </div>

      <div className="max-w-2xl mx-auto flex flex-col w-full" style={{ height: 'calc(100vh - 360px)' }}>
        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-4 pb-4">
          {messages.length === 0 && (
            <div className="text-center py-8">
              <p className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-clinical-stone mb-4">Try one of these</p>
              <div className="flex flex-wrap justify-center gap-2">
                {QUICK_PROMPTS.map(qp => (
                  <button
                    key={qp.label}
                    onClick={() => sendMessage(qp.prompt)}
                    className="text-precision text-[0.65rem] font-bold tracking-wider uppercase px-4 py-2 bg-clinical-white border border-outline-variant/20 text-primary-container hover:bg-primary-container/5 hover:border-primary-container/30 transition-colors rounded-full"
                  >
                    {qp.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => {
            const isLastAssistant = msg.role === 'assistant' && i === messages.length - 1;
            return (
              <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div className={`max-w-[85%] px-4 py-3 ${msg.role === 'user'
                  ? 'bg-primary-container text-white rounded-[16px] rounded-br-[4px]'
                  : 'bg-clinical-white border border-outline-variant/15 text-clinical-charcoal rounded-[16px] rounded-bl-[4px]'
                }`}>
                  <p className="text-body text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                  <p className={`text-precision text-[0.7rem] mt-1 ${msg.role === 'user' ? 'text-white/50' : 'text-clinical-stone/50'}`}>
                    {msg.timestamp.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  </p>
                </div>
                {/* Suggested follow-up chips — only on the most recent assistant reply */}
                {isLastAssistant && msg.chips && msg.chips.length > 0 && !loading && (
                  <div className="flex flex-wrap gap-2 mt-2 max-w-[85%]">
                    {msg.chips.map((chip, ci) => (
                      <button
                        key={ci}
                        onClick={() => sendMessage(chip)}
                        className="text-precision text-[0.65rem] font-bold tracking-wide px-3 py-1.5 bg-clinical-white border border-primary-container/30 text-primary-container hover:bg-primary-container/5 transition-colors rounded-full"
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

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
          <p className="text-precision text-[0.7rem] text-clinical-stone/40 text-center mt-2">Educational only — not medical advice. Discuss all findings with your doctor.</p>
        </div>
      </div>
    </AppShell>
  );
};
