// src/components/chat/FloatingChat.tsx
// Floating chat bubble — available on every page, minimizable, saves history.
// Smart prompts read from the user's actual flagged labs and symptoms so the
// quick suggestions are always relevant ("Why is my ALT 97?" not "Why am I tired?").
// Conversations persist to chat_messages so chats survive page refresh and
// switching devices.
import { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '../../store/authStore';
import { useSubscription } from '../../lib/subscription';
import { useLatestLabValues } from '../../hooks/useLabData';
import { useSymptoms } from '../../hooks/useSymptoms';
import { supabase } from '../../lib/supabase';


interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  chips?: string[];
}

// Static fallback prompts — used when user has no labs / symptoms uploaded yet.
const FALLBACK_PROMPTS = [
  { label: 'Why am I tired?', prompt: 'Why am I tired? Use my labs to explain.' },
  { label: 'Explain my labs', prompt: 'Explain my lab results in plain English in 1 minute.' },
  { label: "Today's 3 things", prompt: 'What 3 things should I do today?' },
  { label: 'Top priorities', prompt: 'What are my top 3 health priorities right now?' },
];

// Build personalized quick prompts from the user's actual data.
// Pulls top out-of-range markers + their highest-severity symptoms.
// Always includes "Explain my labs" as a universal anchor.
function useSmartPrompts() {
  const { data: labValues } = useLatestLabValues();
  const { data: symptoms } = useSymptoms();

  return useMemo(() => {
    const out: { label: string; prompt: string }[] = [];

    // Out-of-range labs — most jarring values first
    const outOfRange = (labValues ?? [])
      .filter((v: any) => ['low', 'high', 'critical_low', 'critical_high', 'deficient', 'elevated'].includes(v.optimal_flag ?? ''))
      .slice(0, 2);
    for (const v of outOfRange) {
      const label = `Why is my ${v.marker_name} ${v.value}?`;
      const prompt = `My ${v.marker_name} is ${v.value}${v.unit ? ' ' + v.unit : ''}. Why? What does it mean for me and what's the next step?`;
      out.push({ label: label.length > 36 ? label.slice(0, 33) + '…' : label, prompt });
    }

    // Top symptom by severity
    const topSymptom = (symptoms ?? [])
      .filter((s: any) => typeof s.severity === 'number')
      .sort((a: any, b: any) => b.severity - a.severity)[0];
    if (topSymptom) {
      out.push({
        label: `Help with ${topSymptom.symptom.toLowerCase()}`,
        prompt: `My ${topSymptom.symptom.toLowerCase()} is ${topSymptom.severity}/10. What's the most likely cause based on my labs and meds — and what should I do?`,
      });
    }

    // Always add the universal "explain my labs" anchor
    out.push({ label: 'Explain my labs', prompt: 'Explain my lab results in plain English in 1 minute.' });

    // Top up to 4 with fallbacks if we're under
    const used = new Set(out.map(p => p.label));
    for (const f of FALLBACK_PROMPTS) {
      if (out.length >= 4) break;
      if (!used.has(f.label)) out.push(f);
    }

    return out.slice(0, 4);
  }, [labValues, symptoms]);
}

// Floating "Coach" pill button. Replaces the old 14×14 icon-only circle that
// users couldn't identify as an AI chat. Always shows the word "Coach" so
// users know what it is. First-time users see a subtle pulse + a tooltip
// pointing at it ("Ask anything about your labs"); both dismiss on first
// click and never show again (localStorage flag).
const COACH_TOOLTIP_FLAG = 'coach_tooltip_seen_v1';

const FloatingCoachButton = ({
  isOpen, onOpen, unreadCount,
}: {
  isOpen: boolean; onOpen: () => void; unreadCount: number;
}) => {
  const [showTooltip, setShowTooltip] = useState(() => {
    try { return localStorage.getItem(COACH_TOOLTIP_FLAG) !== 'true'; }
    catch { return false; }
  });

  const handleClick = () => {
    onOpen();
    if (showTooltip) {
      try { localStorage.setItem(COACH_TOOLTIP_FLAG, 'true'); } catch {}
      setShowTooltip(false);
    }
  };

  return (
    <AnimatePresence>
      {!isOpen && (
        <div
          className="fixed right-4 md:right-6 z-50 flex flex-col items-end gap-2"
          style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom))' }}
        >
          {/* First-time tooltip */}
          <AnimatePresence>
            {showTooltip && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                transition={{ duration: 0.3, delay: 0.5 }}
                className="bg-[#131313] text-white rounded-[10px] px-4 py-2.5 shadow-lg max-w-[240px] relative"
              >
                <p className="text-body text-xs leading-snug">
                  👋 <span className="font-semibold">Ask me anything</span> about your labs, plan, or supplements.
                </p>
                {/* Arrow pointing to button */}
                <div
                  className="absolute -bottom-1.5 right-6 w-3 h-3 bg-[#131313] transform rotate-45"
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* The pill button itself */}
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            onClick={handleClick}
            className="relative bg-primary-container hover:bg-[#2D6A4F] text-white rounded-full shadow-lg pl-3.5 pr-5 py-3 flex items-center gap-2 transition-colors"
            aria-label="Open AI Coach chat"
          >
            {/* Pulse ring on first visit */}
            {showTooltip && (
              <span className="absolute inset-0 rounded-full bg-primary-container animate-ping opacity-40" />
            )}
            <div className="relative w-7 h-7 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-white text-[18px]">auto_awesome</span>
            </div>
            <span className="relative text-precision text-[0.75rem] font-bold tracking-wider uppercase">Coach</span>
            {unreadCount > 0 && (
              <div className="relative w-5 h-5 bg-[#D4A574] rounded-full flex items-center justify-center -mr-1">
                <span className="text-clinical-charcoal text-[0.7rem] font-bold">{unreadCount}</span>
              </div>
            )}
          </motion.button>
        </div>
      )}
    </AnimatePresence>
  );
};

export const FloatingChat = () => {
  const userId = useAuthStore(s => s.user?.id);
  const firstName = useAuthStore(s => s.profile?.firstName) ?? '';
  const { isPro } = useSubscription();
  const smartPrompts = useSmartPrompts();
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

  // Load persisted chat history once when the user signs in.
  // Last 50 messages — enough context for the user to scroll back, capped
  // so the initial render isn't sluggish for chatty users. Chronological
  // order so newest messages appear at the bottom of the panel.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('role, content, chips, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (cancelled || error || !data) return;
      const restored: ChatMessage[] = data.reverse().map((m: any) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
        timestamp: m.created_at,
        chips: Array.isArray(m.chips) ? m.chips : undefined,
      }));
      setMessages(restored);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || !userId || loading) return;
    const userMsg: ChatMessage = { role: 'user', content: text.trim(), timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    // Persist user message immediately — fire-and-forget, no UI block on save.
    supabase.from('chat_messages').insert({
      user_id: userId, role: 'user', content: userMsg.content,
    }).then(({ error }) => { if (error) console.warn('[chat] user msg save failed:', error.message); });

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

      // Persist assistant reply
      supabase.from('chat_messages').insert({
        user_id: userId, role: 'assistant', content: reply, chips: chips.length > 0 ? chips : null,
      }).then(({ error }) => { if (error) console.warn('[chat] assistant msg save failed:', error.message); });
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
      {/* Floating button — labeled pill with first-time pulse + tooltip.
          Was a 14×14 icon-only circle that users mistook for a generic
          action button. Now: bigger pill with "Coach" label always visible,
          a subtle pulse + one-time tooltip for new users. */}
      <FloatingCoachButton
        isOpen={isOpen}
        onOpen={() => setIsOpen(true)}
        unreadCount={messages.filter(m => m.role === 'assistant').length}
      />

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
                  <p className="text-precision text-[0.7rem] text-on-surface-variant tracking-wide">Knows your labs, meds & symptoms</p>
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
                    {smartPrompts.map(qp => (
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
