"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useConvex, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { GalleryContent, Locale } from "@/content";
import { mutes, useMutes } from "@/lib/multiplayer/local";
import { MP, type MPStrings } from "@/lib/multiplayer/strings";
import type { ChatRequest, ConversationSummary } from "./MultiplayerLayer";

export type ChatTab = "room" | "gallery" | "messages" | "settings";
type Me = { id: string; name: string; color: string; allowDMs: boolean };

interface Props {
  token: string;
  me: Me;
  setMe: (m: Me) => void;
  locale: Locale;
  roomId: string;
  roomTitle: string;
  content: GalleryContent;
  conversations: ConversationSummary[];
  blocks: { id: Id<"visitors">; name: string }[];
  request: ChatRequest | null;
  onViewing: (conversationId: string | null) => void;
  onClose: () => void;
}

export function ChatPanel(p: Props) {
  const t = MP[p.locale];
  const [tab, setTab] = useState<ChatTab>(p.request?.tab ?? "room");
  const [withId, setWithId] = useState<string | null>(p.request?.with ?? null);
  const panel = useRef<HTMLDivElement>(null);

  // A 💬 click or a notification asks to open a particular conversation.
  useEffect(() => {
    if (!p.request) return;
    setTab(p.request.tab);
    setWithId(p.request.with ?? null);
  }, [p.request]);
  useEffect(() => { if (tab !== "messages" || !withId) p.onViewing(null); }, [tab, withId, p]);

  // Esc closes the panel (when not typing a message).
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape" && !(e.target instanceof HTMLTextAreaElement && e.target.value)) { e.stopPropagation(); p.onClose(); } };
    const el = panel.current;
    el?.addEventListener("keydown", key);
    return () => el?.removeEventListener("keydown", key);
  }, [p]);

  const unread = p.conversations.filter((c) => !mutes.has(c.with)).reduce((n, c) => n + c.unread, 0);
  const tabs: [ChatTab, string][] = [["room", t.roomTab], ["gallery", t.galleryTab], ["messages", t.messagesTab], ["settings", t.settingsTab]];
  const blocked = useMemo(() => new Set<string>(p.blocks.map((b) => b.id)), [p.blocks]);

  return (
    <aside ref={panel} className="chat-panel" aria-label={t.chat}>
      <div className="chat-head">
        <div className="chat-tabs" role="tablist">
          {tabs.map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "is-on" : ""} onClick={() => { setTab(id); if (id !== "messages") setWithId(null); }}>
              {label}
              {id === "messages" && unread > 0 && <span className="live-badge">{unread > 9 ? "9+" : unread}</span>}
            </button>
          ))}
        </div>
        <button type="button" className="card-close" onClick={p.onClose} aria-label={t.close}>×</button>
      </div>
      {tab === "room" && <ChannelView key={`room:${p.roomId}`} channel={`room:${p.roomId}`} intro={t.roomIntro(p.roomTitle)} {...p} t={t} blocked={blocked} onPrivate={(id) => { setTab("messages"); setWithId(id); }} />}
      {tab === "gallery" && <ChannelView key="gallery" channel="gallery" intro={t.galleryIntro} {...p} t={t} blocked={blocked} onPrivate={(id) => { setTab("messages"); setWithId(id); }} />}
      {tab === "messages" && !withId && <ConversationList {...p} t={t} onOpen={setWithId} />}
      {tab === "messages" && withId && <Thread key={withId} {...p} t={t} other={withId as Id<"visitors">} onBack={() => setWithId(null)} />}
      {tab === "settings" && <Settings {...p} t={t} />}
    </aside>
  );
}

function timeOf(at: number, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", { hour: "numeric", minute: "2-digit" }).format(at);
}

function errorText(err: unknown, t: MPStrings) {
  const m = err instanceof Error ? err.message : String(err);
  return /Slow down/.test(m) ? t.slowDown : t.sendFailed;
}

/** Keeps a message list pinned to the newest message unless you've scrolled up. */
function useStickToBottom(dep: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);
  useEffect(() => {
    const el = ref.current;
    if (el && stuck.current) el.scrollTop = el.scrollHeight;
  }, [dep]);
  const onScroll = () => {
    const el = ref.current;
    if (el) stuck.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  };
  return { ref, onScroll };
}

function Composer({ t, onSend, onTyping, disabled }: { t: MPStrings; onSend: (body: string) => Promise<void>; onTyping: (on: boolean) => void; disabled?: string }) {
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lastPing = useRef(0);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { input.current?.focus({ preventScroll: true }); }, []);

  const submit = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await onSend(body);
      setText("");
      lastPing.current = 0;
    } catch (e) {
      setErr(errorText(e, t));
    } finally {
      setBusy(false);
      input.current?.focus({ preventScroll: true });
    }
  };

  if (disabled) return <p className="chat-note">{disabled}</p>;
  return (
    <form className="chat-compose" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      {err && <p className="chat-error" role="alert">{err}</p>}
      <div className="chat-compose-row">
        <textarea
          ref={input}
          rows={1}
          maxLength={500}
          value={text}
          placeholder={t.placeholder}
          aria-label={t.placeholder}
          onChange={(e) => {
            setText(e.target.value);
            const now = Date.now();
            if (e.target.value && now - lastPing.current > 3000) { lastPing.current = now; onTyping(true); }
          }}
          onBlur={() => { if (lastPing.current) { lastPing.current = 0; onTyping(false); } }}
          onKeyDown={(e) => {
            // Keep walking keys and shortcuts from reaching the gallery while typing.
            e.stopPropagation();
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void submit(); }
          }}
        />
        <button type="submit" className="btn btn-primary btn-small" disabled={!text.trim() || busy}>{t.send}</button>
      </div>
    </form>
  );
}

function TypingLine({ rows, meId, t }: { rows: { id: string; name: string; until: number }[] | undefined; meId: string; t: MPStrings }) {
  const [, tick] = useState(0);
  useEffect(() => { const id = window.setInterval(() => tick((n) => n + 1), 1500); return () => clearInterval(id); }, []);
  const now = Date.now();
  const others = (rows ?? []).filter((r) => r.id !== meId && r.until > now - 1000 && !mutes.has(r.id));
  return <p className="chat-typing" aria-live="polite">{others.length === 1 ? t.typingOne(others[0].name) : others.length > 1 ? t.typingMany(others.length) : " "}</p>;
}

function ChannelView({ channel, intro, token, me, t, locale, blocked, onPrivate }: Props & { channel: string; intro: string; t: MPStrings; blocked: Set<string>; onPrivate: (id: string) => void }) {
  const convex = useConvex();
  const [limit, setLimit] = useState(50);
  const data = useQuery(api.chat.list, { channel, limit });
  const typing = useQuery(api.chat.whoIsTyping, { channel });
  const muted = useMutes();
  const [menu, setMenu] = useState<string | null>(null);
  const list = (data?.messages ?? []).filter((m) => !(m.from in muted) && !blocked.has(m.from));
  const scroll = useStickToBottom(list.length ? list[list.length - 1].id : 0);

  return (
    <>
      <div className="chat-list" ref={scroll.ref} onScroll={scroll.onScroll}>
        <p className="chat-intro">{intro}</p>
        {data?.more && <button type="button" className="link small chat-more" onClick={() => setLimit((n) => n + 50)}>{t.loadEarlier}</button>}
        {data && !list.length && <p className="chat-empty">{t.empty}</p>}
        <ol>
          {list.map((m) => {
            const mine = m.from === me.id;
            return (
              <li key={m.id} className={`chat-msg${mine ? " is-mine" : ""}`}>
                <div className="chat-meta">
                  <span className="chat-swatch" style={{ background: m.color }} aria-hidden="true" />
                  {mine ? <b>{t.you}</b> : (
                    <button type="button" className="chat-name" aria-expanded={menu === m.id} onClick={() => setMenu(menu === m.id ? null : m.id)}><bdi>{m.name}</bdi></button>
                  )}
                  <time dateTime={new Date(m.at).toISOString()}>{timeOf(m.at, locale)}</time>
                </div>
                <p className="chat-body" dir="auto">{m.body}</p>
                {menu === m.id && !mine && (
                  <div className="chat-menu">
                    <button type="button" className="btn btn-small" onClick={() => { setMenu(null); onPrivate(m.from); }}>{t.messagePrivately}</button>
                    <button type="button" className="btn btn-small" onClick={() => { mutes.toggle(m.from, m.name); setMenu(null); }}>{m.from in muted ? t.unmute : t.mute}</button>
                    <button type="button" className="btn btn-small" onClick={() => {
                      setMenu(null);
                      if (window.confirm(t.blockConfirm(m.name))) void convex.mutation(api.dms.block, { token, visitorId: m.from });
                    }}>{t.block}</button>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </div>
      <TypingLine rows={typing} meId={me.id} t={t} />
      <Composer
        t={t}
        onSend={async (body) => { await convex.mutation(api.chat.send, { token, channel, body }); }}
        onTyping={(on) => { void convex.mutation(api.chat.setTyping, { token, channel, typing: on }).catch(() => {}); }}
      />
    </>
  );
}

function roomName(content: GalleryContent, locale: Locale, id: string | null) {
  return content.rooms.find((r) => r.id === id)?.t[locale].title ?? "";
}

function ConversationList({ conversations, t, locale, content, onOpen }: Props & { t: MPStrings; onOpen: (id: string) => void }) {
  const muted = useMutes();
  return (
    <div className="chat-list">
      <h3 className="chat-subhead">{t.conversations}</h3>
      {!conversations.length && <p className="chat-empty">{t.noConversations}</p>}
      <ul className="conv-list">
        {conversations.map((c) => (
          <li key={c.id}>
            <button type="button" className="conv-row" onClick={() => onOpen(c.with)}>
              <span className="conv-avatar" style={{ background: c.color }} aria-hidden="true">
                <span className={`presence-dot${c.online ? " is-online" : ""}`} />
              </span>
              <span className="conv-text">
                <span className="conv-name"><bdi>{c.name}</bdi>{c.with in muted && <small> · {t.mute}</small>}</span>
                <span className="conv-status">{c.online ? (c.roomId ? t.onlineIn(roomName(content, locale, c.roomId)) : t.online) : t.offline}</span>
                <span className="conv-last" dir="auto">{c.lastFromMe ? `${t.you}: ` : ""}{c.lastBody}</span>
              </span>
              {c.unread > 0 && <span className="live-badge" aria-label={t.unread(c.unread)}>{c.unread > 9 ? "9+" : c.unread}</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Thread({ token, me, t, locale, other, onBack, onViewing }: Props & { t: MPStrings; other: Id<"visitors">; onBack: () => void }) {
  const convex = useConvex();
  const info = useQuery(api.dms.conversationWith, { token, other });
  const [convId, setConvId] = useState<Id<"conversations"> | null>(null);
  const id = convId ?? info?.conversationId ?? null;
  const [limit, setLimit] = useState(60);
  const thread = useQuery(api.dms.thread, id ? { token, conversationId: id, limit } : "skip");
  const typing = useQuery(api.chat.whoIsTyping, id ? { channel: `dm:${id}` } : "skip");
  const muted = useMutes();
  const [notice, setNotice] = useState<string | null>(null);
  const messages = thread?.messages ?? [];
  const scroll = useStickToBottom(messages.length ? messages[messages.length - 1].id : 0);

  useEffect(() => { onViewing(id); return () => onViewing(null); }, [id, onViewing]);
  // Reading the newest messages marks them read (only while the tab is visible).
  const newest = messages.length ? messages[messages.length - 1].at : 0;
  useEffect(() => {
    if (!id || !newest || document.hidden) return;
    void convex.mutation(api.dms.markRead, { token, conversationId: id }).catch(() => {});
  }, [id, newest, convex, token]);

  const name = info?.name ?? "…";
  const lastMine = [...messages].reverse().find((m) => m.mine);
  const seen = !!lastMine && !!thread && thread.otherReadAt >= lastMine.at && messages[messages.length - 1]?.id === lastMine.id;
  const disabled = info?.blockedByMe ? t.youBlocked(name) : info && !info.conversationId && !info.acceptsNew ? t.notAccepting(name) : undefined;

  return (
    <>
      <div className="thread-head">
        <button type="button" className="btn btn-small btn-quiet" onClick={onBack}><span className="flip-rtl" aria-hidden="true">←</span> {t.back}</button>
        <span className="conv-avatar" style={{ background: info?.color ?? "#999" }} aria-hidden="true">
          <span className={`presence-dot${info?.online ? " is-online" : ""}`} />
        </span>
        <span className="thread-who">
          <b><bdi>{name}</bdi></b>
          <small>{info?.online ? t.online : t.offline}</small>
        </span>
        <span className="thread-actions">
          <button type="button" className="btn btn-small" onClick={() => mutes.toggle(other, name)}>{other in muted ? t.unmute : t.mute}</button>
          <button type="button" className="btn btn-small" onClick={() => {
            if (info?.blockedByMe) void convex.mutation(api.dms.unblock, { token, visitorId: other });
            else if (window.confirm(t.blockConfirm(name))) void convex.mutation(api.dms.block, { token, visitorId: other });
          }}>{info?.blockedByMe ? t.unblock : t.block}</button>
        </span>
      </div>
      <div className="chat-list" ref={scroll.ref} onScroll={scroll.onScroll}>
        {thread?.more && <button type="button" className="link small chat-more" onClick={() => setLimit((n) => n + 60)}>{t.loadEarlier}</button>}
        <ol>
          {messages.map((m) => (
            <li key={m.id} className={`dm-msg${m.mine ? " is-mine" : ""}`}>
              <p className="chat-body" dir="auto">{m.body}</p>
              <time dateTime={new Date(m.at).toISOString()}>{timeOf(m.at, locale)}</time>
            </li>
          ))}
        </ol>
        {seen && <p className="dm-seen">{t.seen}</p>}
        {notice && <p className="chat-note" role="alert">{notice}</p>}
      </div>
      <TypingLine rows={typing} meId={me.id} t={t} />
      <Composer
        t={t}
        disabled={disabled}
        onSend={async (body) => {
          const r = await convex.mutation(api.dms.send, { token, to: other, body });
          if (!r.ok) { setNotice(r.reason === "closed" ? t.notAccepting(name) : r.reason === "blocked" ? t.youBlocked(name) : t.unavailable); return; }
          setNotice(null);
          setConvId(r.conversationId);
        }}
        onTyping={(on) => { if (id) void convex.mutation(api.chat.setTyping, { token, channel: `dm:${id}`, typing: on }).catch(() => {}); }}
      />
    </>
  );
}

function Settings({ token, me, setMe, t, blocks }: Props & { t: MPStrings }) {
  const convex = useConvex();
  const [name, setName] = useState(me.name);
  const [state, setState] = useState<"idle" | "saved" | "error">("idle");
  const muted = useMutes();
  return (
    <div className="chat-list chat-settings">
      <form onSubmit={async (e) => {
        e.preventDefault();
        try {
          const r = await convex.mutation(api.presence.setProfile, { token, name });
          setMe({ ...me, name: r.name });
          setState("saved");
        } catch { setState("error"); }
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
      <label className="toggle">
        <input type="checkbox" checked={me.allowDMs} onChange={async (e) => {
          const allowDMs = e.target.checked;
          setMe({ ...me, allowDMs });
          try { await convex.mutation(api.presence.setProfile, { token, allowDMs }); } catch { setMe({ ...me }); }
        }} />
        <span>{t.allowDMs}<small>{t.allowDMsHelp}</small></span>
      </label>
      <h3 className="chat-subhead">{t.muted}</h3>
      <p className="small muted">{t.mutedHelp}</p>
      <ul className="people-list">
        {Object.entries(muted).map(([id, n]) => (
          <li key={id}><bdi>{n}</bdi> <button type="button" className="btn btn-small" onClick={() => mutes.toggle(id, n)}>{t.unmute}</button></li>
        ))}
        {!Object.keys(muted).length && <li className="muted">{t.nobody}</li>}
      </ul>
      <h3 className="chat-subhead">{t.blocked}</h3>
      <p className="small muted">{t.blockedHelp}</p>
      <ul className="people-list">
        {blocks.map((b) => (
          <li key={b.id}><bdi>{b.name}</bdi> <button type="button" className="btn btn-small" onClick={() => void convex.mutation(api.dms.unblock, { token, visitorId: b.id })}>{t.unblock}</button></li>
        ))}
        {!blocks.length && <li className="muted">{t.nobody}</li>}
      </ul>
    </div>
  );
}
