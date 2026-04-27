// src/components/chat/FloatingChat.tsx
// Floating chat bubble — available on every page, minimizable, saves history
import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '../../store/authStore';
import { useSubscription } from '../../lib/subscription';


interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  chips?: string[];
}

const QUICK_PROMPTS = [
  { label: 'Why am I tired?', prompt: 'Why am I tired? Use my labs to explain.' },
  { label: 'Explain my labs', prompt: 'Explain my lab results in plain English in 1 minute.' },
  { label: "Today's 3 things", prompt: 'What 3 things should I do today?' },
  { label: 'Top priorities', prompt: 'What are my top 3 health priorities right now?' },
];

export const FloatingChat = () => {
  const userId = useAuthStore(s => s.user?.id);
  const firstName = useAuthStore(s => s.profile?.firstName) ?? '';
  const { isPro } = useSubscription();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen, messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || !userId || loading) return;
    const userMsg: ChatMessage = { role: 'user', content: text.trim(), timestamp: new Date().toISOString() };
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
      const reply = data.reply ?? data.error ?? 'Something went wrong. Please try again.';
      const chips: string[] = Array.isArray(data.chips) ? data.chips : [];
      setMessages(prev => [...prev, { role: 'assistant', content: reply, timestamp: new Date().toISOString(), chips }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Connection error. Please try again.', timestamp: new Date().toISOString() }]);
    } finally {
      setLoading(false);
    }
  };

  // Free users don't see the floating chat at all — pure paywall, no teaser bubble
  // (full chat page handles its own paywall card)
  if (!userId || !isPro) return null;

  return (
    <>
      {/* Floating button */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            onClick={() => setIsOpen(true)}
            className="fixed right-4 md:right-6 z-50 w-14 h-14 bg-primary-container rounded-full shadow-lg flex items-center justify-center hover:bg-[#2D6A4F] transition-colors"
            style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom))' }}
          >
            <span className="material-symbols-outlined text-white text-2xl">chat</span>
            {messages.length > 0 && (
              <div className="absolute -top-1 -right-1 w-5 h-5 bg-[#D4A574] rounded-full flex items-center justify-center">
                <span className="text-white text-[0.5rem] font-bold">{messages.filter(m => m.role === 'assistant').length}</span>
              </div>
            )}
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-50 w-[calc(100vw-2rem)] max-w-md bg-clinical-cream rounded-[16px] shadow-2xl border border-outline-variant/20 overflow-hidden flex flex-col"
            style={{ maxHeight: 'calc(100vh - 120px)', height: '500px' }}
          >
            {/* Header */}
            <div className="bg-[#131313] px-4 py-3 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-primary-container rounded-full flex items-center justify-center">
                  <span className="material-symbols-outlined text-white text-[16px]">favorite</span>
                </div>
                <div>
                  <p className="text-precision text-[0.68rem] text-white font-bold tracking-wider">CauseHealth AI</p>
                  <p className="text-precision text-[0.5rem] text-on-surface-variant tracking-wide">Knows your labs, meds & symptoms</p>
                </div>
              </div>
              <button onClick={() => setIsOpen(false)} className="text-on-surface-variant hover:text-white transition-colors">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {messages.length === 0 && (
                <div className="text-center py-6">
                  <p className="text-body text-clinical-charcoal font-semibold mb-1">Hi{firstName ? `, ${firstName}` : ''}!</p>
                  <p className="text-body text-clinical-stone text-sm mb-4">Ask me anything about your health data.</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {QUICK_PROMPTS.map(qp => (
                      <button key={qp.label} onClick={() => sendMessage(qp.prompt)}
                        className="text-precision text-[0.6rem] font-bold tracking-wider px-3 py-1.5 bg-clinical-white border border-outline-variant/20 text-primary-container hover:bg-primary-container/5 transition-colors" style={{ borderRadius: '16px' }}>
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
                    <div className={`max-w-[85%] px-3 py-2 ${msg.role === 'user'
                      ? 'bg-primary-container text-white rounded-[12px] rounded-br-[4px]'
                      : 'bg-clinical-white border border-outline-variant/10 text-clinical-charcoal rounded-[12px] rounded-bl-[4px]'
                    }`}>
                      <p className="text-body text-[0.8rem] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                    </div>
                    {isLastAssistant && msg.chips && msg.chips.length > 0 && !loading && (
                      <div className="flex flex-wrap gap-1.5 mt-1.5 max-w-[85%]">
                        {msg.chips.map((chip, ci) => (
                          <button
                            key={ci}
                            onClick={() => sendMessage(chip)}
                            className="text-precision text-[0.6rem] font-bold px-2.5 py-1 bg-clinical-white border border-primary-container/30 text-primary-container hover:bg-primary-container/5 rounded-full"
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
                  <div className="bg-clinical-white border border-outline-variant/10 rounded-[12px] rounded-bl-[4px] px-3 py-2">
                    <div className="flex gap-1">
                      {[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-primary-container/40 animate-pulse" style={{ animationDelay: `${i * 0.2}s` }} />)}
                    </div>
                  </div>
                </div>
              )}

              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="border-t border-outline-variant/10 px-3 py-2 bg-clinical-white flex-shrink-0">
              <div className="flex gap-2">
                <input ref={inputRef} type="text" value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
                  placeholder="Ask anything..."
                  className="flex-1 bg-clinical-cream border border-outline-variant/15 rounded-full px-4 py-2 text-body text-sm text-clinical-charcoal placeholder-clinical-stone/50 focus:border-primary-container focus:outline-none"
                />
                <button onClick={() => sendMessage(input)} disabled={!input.trim() || loading}
                  className="w-9 h-9 bg-primary-container rounded-full flex items-center justify-center disabled:opacity-40 hover:bg-[#2D6A4F] transition-colors flex-shrink-0">
                  <span className="material-symbols-outlined text-white text-[16px]">send</span>
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
