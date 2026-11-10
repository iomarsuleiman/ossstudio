"use client";

import { useEffect, useRef, useState } from "react";
import { useConvex, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Locale } from "@/content";
import { mutes, useMutes } from "@/lib/multiplayer/local";
import { MP, type MPStrings } from "@/lib/multiplayer/strings";

type ChatTab = "room" | "gallery" | "settings";
type Me = { id: string; name: string; color: string; allowDMs: boolean };

interface Props {
  token: string;
  me: Me;
  setMe: (me: Me) => void;
  locale: Locale;
  roomId: string;
  roomTitle: string;
  onClose: () => void;
}

export function ChatPanel(p: Props) {
  const t = MP[p.locale];
  const [tab, setTab] = useState<ChatTab>("room");
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    panel.current?.querySelector<HTMLElement>(".chat-head .card-close")?.focus();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !(e.target instanceof HTMLTextAreaElement && e.target.value)) {
        e.stopPropagation();
        p.onClose();
        return;
      }
      if (e.key !== "Tab" || !window.matchMedia("(max-width: 760px)").matches) return;
      const buttons = [...(panel.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), a[href]',
      ) ?? [])];
      if (!buttons.length) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    const el = panel.current;
    el?.addEventListener("keydown", onKey);
    return () => el?.removeEventListener("keydown", onKey);
  }, [p.onClose]);
  const tabs: [ChatTab, string][] = [
    ["room", t.roomTab], ["gallery", t.galleryTab], ["settings", t.settingsTab],
  ];
  return (
    <>
      <button className="chat-scrim" type="button" aria-label={t.close} onClick={p.onClose} />
      <aside ref={panel} className="chat-panel" role="dialog" aria-label={t.chat}>
      <div className="chat-head">
        <div className="chat-tabs" role="tablist">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={tab === id ? "is-on" : ""}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <button type="button" className="card-close" onClick={p.onClose} aria-label={t.close}>×</button>
      </div>
      {tab === "room" && <ChannelView key={p.roomId} {...p} channel={`room:${p.roomId}`} intro={t.roomIntro(p.roomTitle)} t={t} />}
      {tab === "gallery" && <ChannelView key="gallery" {...p} channel="gallery" intro={t.galleryIntro} t={t} />}
      {tab === "settings" && <Settings {...p} t={t} />}
      </aside>
    </>
  );
}

function useStickToBottom(dep: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);
  useEffect(() => {
    if (ref.current && stuck.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [dep]);
  const onScroll = () => {
    const el = ref.current;
    if (el) stuck.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  };
  return { ref, onScroll };
}

function Composer({ t, onSend, onTyping }: {
  t: MPStrings;
  onSend: (body: string) => Promise<void>;
  onTyping: (typing: boolean) => void;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const lastTyping = useRef(0);
  const send = async () => {
    const body = value.trim();
    if (!body || sending) return;
    setSending(true);
    setError("");
    try {
      await onSend(body);
      setValue("");
      lastTyping.current = 0;
    } catch (e) {
      setError(e instanceof Error && /Slow down/.test(e.message) ? t.slowDown : t.sendFailed);
    } finally {
      setSending(false);
      input.current?.focus({ preventScroll: true });
    }
  };
  return (
    <form className="chat-compose" onSubmit={(e) => { e.preventDefault(); void send(); }}>
      {error && <p className="chat-error" role="alert">{error}</p>}
      <div className="chat-compose-row">
        <textarea
          ref={input} rows={1} maxLength={500} value={value} aria-label={t.placeholder}
          placeholder={t.placeholder}
          onChange={(e) => {
            setValue(e.target.value);
            const now = Date.now();
            if (e.target.value && now - lastTyping.current >= 3000) {
              lastTyping.current = now;
              onTyping(true);
            }
          }}
          onBlur={() => { if (lastTyping.current) { lastTyping.current = 0; onTyping(false); } }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button type="submit" className="btn btn-primary btn-small" disabled={!value.trim() || sending}>{t.send}</button>
      </div>
    </form>
  );
}

function TypingLine({ rows, me, t }: {
  rows: { id: string; name: string; until: number }[] | undefined;
  me: string; t: MPStrings;
}) {
  const [, update] = useState(0);
  useEffect(() => {
    const interval = window.setInterval(() => update((v) => v + 1), 1500);
    return () => clearInterval(interval);
  }, []);
  const now = Date.now();
  const names = (rows ?? []).filter((r) => r.id !== me && r.until > now && !mutes.has(r.id));
  return (
    <p className="chat-typing" aria-live="polite">
      {names.length === 1 ? t.typingOne(names[0].name) : names.length > 1 ? t.typingMany(names.length) : " "}
    </p>
  );
}

function ChannelView({ channel, intro, token, me, locale, t }: Props & {
  channel: string; intro: string; t: MPStrings;
}) {
  const convex = useConvex();
  const [limit, setLimit] = useState(50);
  const result = useQuery(api.chat.list, { channel, limit });
  const typing = useQuery(api.chat.whoIsTyping, { channel });
  const muted = useMutes();
  const [menu, setMenu] = useState<string | null>(null);
  const messages = (result?.messages ?? []).filter((m) => !(m.from in muted));
  const scroll = useStickToBottom(messages[messages.length - 1]?.id ?? 0);
  return (
    <>
      <div className="chat-list" ref={scroll.ref} onScroll={scroll.onScroll}>
        <p className="chat-intro">{intro}</p>
        {result?.more && <button type="button" className="link small chat-more" onClick={() => setLimit((n) => n + 50)}>{t.loadEarlier}</button>}
        {result && !messages.length && <p className="chat-empty">{t.empty}</p>}
        <ol>
          {messages.map((m) => {
            const own = m.from === me.id;
            return (
              <li key={m.id} className={`chat-msg${own ? " is-mine" : ""}`}>
                <div className="chat-meta">
                  <span className="chat-swatch" style={{ background: m.color }} aria-hidden="true" />
                  {own ? <b>{t.you}</b> : (
                    <button type="button" className="chat-name" aria-expanded={menu === m.id} onClick={() => setMenu(menu === m.id ? null : m.id)}>
                      <bdi>{m.name}</bdi>
                    </button>
                  )}
                  <time dateTime={new Date(m.at).toISOString()}>
                    {new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", { hour: "numeric", minute: "2-digit" }).format(m.at)}
                  </time>
                </div>
                <p className="chat-body" dir="auto">{m.body}</p>
                {menu === m.id && !own && (
                  <div className="chat-menu">
                    <button type="button" className="btn btn-small" onClick={() => { mutes.toggle(m.from, m.name); setMenu(null); }}>
                      {t.mute}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </div>
      <TypingLine rows={typing} me={me.id} t={t} />
      <Composer
        t={t}
        onSend={async (body) => { await convex.mutation(api.chat.send, { token, channel, body }); }}
        onTyping={(typing) => { void convex.mutation(api.chat.setTyping, { token, channel, typing }).catch(() => {}); }}
      />
    </>
  );
}

function Settings({ token, me, setMe, t }: Props & { t: MPStrings }) {
  const convex = useConvex();
  const [name, setName] = useState(me.name);
  const [state, setState] = useState<"idle" | "saved" | "error">("idle");
  const muted = useMutes();
  return (
    <div className="chat-list chat-settings">
      <form onSubmit={async (e) => {
        e.preventDefault();
        try {
          const response = await convex.mutation(api.presence.setProfile, { token, name });
          setMe({ ...me, name: response.name });
          setState("saved");
        } catch {
          setState("error");
        }
      }}>
        <label className="field">
          <span>{t.yourName}</span>
          <span className="chat-compose-row">
            <input value={name} maxLength={24} onChange={(e) => { setName(e.target.value); setState("idle"); }} onKeyDown={(e) => e.stopPropagation()} />
            <button type="submit" className="btn btn-small btn-primary" disabled={name.trim().length < 2 || name.trim() === me.name}>{t.save}</button>
          </span>
          {state === "saved" && <small role="status">{t.saved}</small>}
          {state === "error" && <small role="alert">{t.sendFailed}</small>}
        </label>
      </form>
      <h3 className="chat-subhead">{t.muted}</h3>
      <p className="small muted">{t.mutedHelp}</p>
      <ul className="people-list">
        {Object.entries(muted).map(([id, n]) => (
          <li key={id}><bdi>{n}</bdi> <button type="button" className="btn btn-small" onClick={() => mutes.toggle(id, n)}>{t.unmute}</button></li>
        ))}
        {!Object.keys(muted).length && <li className="muted">{t.nobody}</li>}
      </ul>
    </div>
  );
}
