// Mailbrus — screen components (palette modals, mail list, reader)
/* global React */

const { useState, useEffect, useRef, useMemo, useCallback } = React;

// ─────────────────────────────────────────────────────────────────────────
// Gravatar  —  SHA-256 of normalized email → https://gravatar.com/avatar/<hash>
// ─────────────────────────────────────────────────────────────────────────
const _avatarCache = new Map();
async function _resolveGravatar(email) {
  const norm = (email || "").trim().toLowerCase();
  if (!norm || !/@/.test(norm)) return null;
  try {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(norm));
    const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
    return `https://www.gravatar.com/avatar/${hex}?d=identicon&s=128`;
  } catch (e) {
    return null;
  }
}
function useGravatar(email) {
  const [url, setUrl] = useState(() => _avatarCache.get(email) || null);
  useEffect(() => {
    if (!email) { setUrl(null); return; }
    if (_avatarCache.has(email)) { setUrl(_avatarCache.get(email)); return; }
    let cancelled = false;
    _resolveGravatar(email).then((u) => {
      if (u) _avatarCache.set(email, u);
      if (!cancelled) setUrl(u);
    });
    return () => { cancelled = true; };
  }, [email]);
  return url;
}

// Time formatting — "2m" → "2 mins ago" + ISO for hover
const _NOW = new Date("2026-05-20T15:30:00");
const _MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const _WEEKDAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
function _fmtISO(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function expandTime(short) {
  if (!short) return { label: "", iso: "" };
  const s = short.trim();
  let m;
  if ((m = s.match(/^(\d+)m$/))) {
    const n = +m[1];
    const d = new Date(_NOW); d.setMinutes(d.getMinutes() - n);
    return { label: `${n} min${n === 1 ? "" : "s"} ago`, iso: _fmtISO(d) };
  }
  if ((m = s.match(/^(\d+)h$/))) {
    const n = +m[1];
    const d = new Date(_NOW); d.setHours(d.getHours() - n);
    return { label: `${n} hour${n === 1 ? "" : "s"} ago`, iso: _fmtISO(d) };
  }
  if (s === "now")       { return { label: "just now",  iso: _fmtISO(_NOW) }; }
  if (s === "today")     { const d = new Date(_NOW); d.setHours(9, 30, 0, 0);  return { label: "today",     iso: _fmtISO(d) }; }
  if (s === "yesterday") { const d = new Date(_NOW); d.setDate(d.getDate() - 1); d.setHours(16, 22, 0, 0); return { label: "yesterday", iso: _fmtISO(d) }; }
  if (_WEEKDAYS.includes(s)) {
    const target = _WEEKDAYS.indexOf(s);
    const d = new Date(_NOW);
    do { d.setDate(d.getDate() - 1); } while (d.getDay() !== target);
    d.setHours(14, 15, 0, 0);
    return { label: s, iso: _fmtISO(d) };
  }
  if ((m = s.match(/^(\w{3})\s+(\d{1,2})$/))) {
    const mo = _MONTHS.indexOf(m[1]);
    if (mo >= 0) {
      const year = mo > _NOW.getMonth() ? _NOW.getFullYear() - 1 : _NOW.getFullYear();
      const d = new Date(year, mo, +m[2], 10, 30);
      return { label: s, iso: _fmtISO(d) };
    }
  }
  return { label: s, iso: s };
}

function initials(name) {
  if (!name) return "";
  const clean = name.replace(/^(to|re|fwd):\s*/i, "").replace(/^\W+/, "");
  const parts = clean.split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase();
}

function Avatar({ email, name, size = 32 }) {
  const url = useGravatar(email);
  const [errored, setErrored] = useState(false);
  const showImg = url && !errored;
  return (
    <span
      className="mb-avatar"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      aria-hidden="true"
    >
      {showImg && (
        <img
          src={url}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          onError={() => setErrored(true)}
        />
      )}
      <span className="mb-avatar-fallback">{initials(name || email)}</span>
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Wordmark
// ─────────────────────────────────────────────────────────────────────────────
function Wordmark({ size = 18 }) {
  return (
    <span className="mb-wordmark" style={{ fontSize: size }}>
      mailbrus<span className="dot" aria-hidden="true" />
    </span>
  );
}

// Breadcrumb status line
//
// Click contract:
//   home    (wordmark) → return to list / scroll to top
//   account (address)  → open account picker
//   folder  (name)     → open folder picker
function Breadcrumbs({ account, folder, folderLabel, right, onHome, onAccount, onFolder }) {
  return (
    <div className="mb-statusline">
      <button type="button" className="crumb crumb-home" onClick={onHome} title="Back to top">
        <span className="wordmark-slot"><Wordmark size={13} /></span>
      </button>
      <span className="sep">/</span>
      <button type="button" className="crumb crumb-account" onClick={onAccount} title="Switch account">
        {account.address}
      </button>
      <span className="sep">/</span>
      <button type="button" className="crumb crumb-folder" onClick={onFolder} title="Switch folder">
        {folderLabel || folder.name}
      </button>
      <span className="right">{right}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Generic palette modal — fuzzy search + numbered list + keyboard nav
// ─────────────────────────────────────────────────────────────────────────────
function Palette({
  eyebrow,
  title,
  placeholder,
  items,           // [{ key, primary, secondary, meta }]
  onSelect,
  onCancel,
  showCancelHint = true,
  emptyText = "No matches.",
}) {
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((it) => {
      const hay = `${it.primary} ${it.secondary || ""}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [q, items]);

  useEffect(() => { setIdx(0); }, [q]);

  // scroll active into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${idx}"]`);
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [idx, filtered.length]);

  const select = useCallback((i) => {
    const it = filtered[i];
    if (it) onSelect(it);
  }, [filtered, onSelect]);

  const onKey = (e) => {
    if (e.key === "Escape") { e.preventDefault(); onCancel?.(); return; }
    if (e.key === "Enter") { e.preventDefault(); select(idx); return; }
    if (e.key === "ArrowDown" || (e.ctrlKey && e.key === "n")) {
      e.preventDefault(); setIdx((i) => Math.min(i + 1, filtered.length - 1)); return;
    }
    if (e.key === "ArrowUp" || (e.ctrlKey && e.key === "p")) {
      e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); return;
    }
    // vim j/k only when input is empty (so we don't trap typing)
    if (q === "" && (e.key === "j" || e.key === "k")) {
      e.preventDefault();
      setIdx((i) => {
        const next = e.key === "j" ? i + 1 : i - 1;
        return Math.max(0, Math.min(next, filtered.length - 1));
      });
      return;
    }
    // 1-9 quick pick (only when input empty)
    if (q === "" && /^[1-9]$/.test(e.key)) {
      e.preventDefault();
      const n = parseInt(e.key, 10) - 1;
      if (n < filtered.length) select(n);
      return;
    }
  };

  return (
    <div className="mb-curtain" role="dialog" aria-modal="true" onClick={(e) => {
      if (e.target.classList.contains("mb-curtain")) onCancel?.();
    }}>
      <div className="mb-palette">
        <div className="head">
          <div className="eyebrow">
            <span>{eyebrow}</span>
            <Wordmark size={11} />
          </div>
          <div className="title">{title}</div>
          <input
            ref={inputRef}
            className="input"
            placeholder={placeholder}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            spellCheck={false}
            autoComplete="off"
          />
        </div>
        <div className="list mb-scroll" ref={listRef}>
          {filtered.length === 0 ? (
            <div className="empty">{emptyText}</div>
          ) : (
            filtered.map((it, i) => (
              <div
                key={it.key}
                data-idx={i}
                className={"mb-row" + (i === idx ? " active" : "")}
                onMouseEnter={() => setIdx(i)}
                onClick={() => select(i)}
              >
                <div className="num">{i < 9 ? i + 1 : "·"}</div>
                <div className="body">
                  <div className="primary">{it.primary}</div>
                  {it.secondary && <div className="secondary">{it.secondary}</div>}
                </div>
                {it.meta && <div className="meta">{it.meta}</div>}
              </div>
            ))
          )}
        </div>
        <div className="foot">
          <span className="kbd-group"><span className="kbd">↑</span><span className="kbd">↓</span><span className="kbd-label">navigate</span></span>
          <span className="kbd-group"><span className="kbd">1</span><span className="kbd">–</span><span className="kbd">9</span><span className="kbd-label">jump</span></span>
          <span className="kbd-group"><span className="kbd">↵</span><span className="kbd-label">select</span></span>
          {showCancelHint && (
            <span className="kbd-group" style={{ marginLeft: "auto" }}>
              <span className="kbd">esc</span><span className="kbd-label">cancel</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Account picker — first thing on launch
// ─────────────────────────────────────────────────────────────────────────────
function AccountPicker({ accounts, onSelect, onCancel, returning }) {
  const items = accounts.map((a) => ({
    key: a.id,
    primary: a.address,
    secondary: `${a.maildir}   ${a.host}`,
    meta: a.unread > 0 ? `${a.unread} unread` : `${a.total}`,
    raw: a,
  }));
  return (
    <Palette
      eyebrow="select account"
      title="Open a maildir"
      placeholder="Filter accounts…"
      items={items}
      onSelect={(it) => onSelect(it.raw)}
      onCancel={onCancel}
      showCancelHint={returning}
      emptyText="No accounts match."
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Folder picker
// ─────────────────────────────────────────────────────────────────────────────
function FolderPicker({ account, folders, onSelect, onCancel }) {
  const items = folders.map((f) => ({
    key: f.id,
    primary: f.name,
    secondary: `${account.maildir}/${f.id}`,
    meta: f.unread > 0 ? `${f.unread} / ${f.total}` : `${f.total}`,
    raw: f,
  }));
  return (
    <Palette
      eyebrow={`${account.address}  ·  select folder`}
      title="Open a folder"
      placeholder="Filter folders…"
      items={items}
      onSelect={(it) => onSelect(it.raw)}
      onCancel={onCancel}
      emptyText="No folders match."
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Command palette (⌘K) — quick actions
// ─────────────────────────────────────────────────────────────────────────────
function CommandPalette({ account, folder, onAction, onCancel }) {
  const items = [
    { key: "switch-account", primary: "Switch account…", secondary: "Choose a different maildir", meta: "g a" },
    { key: "switch-folder",  primary: "Switch folder…",  secondary: `Within ${account.address}`,   meta: "g f" },
    { key: "go-inbox",       primary: "Go to inbox",     secondary: "Jump to INBOX",               meta: "g i" },
    { key: "go-archive",     primary: "Go to archive",   secondary: "Jump to Archive",             meta: "g A" },
    { key: "compose",        primary: "Compose new message", secondary: `From ${account.address}`, meta: "c" },
    { key: "mark-read",      primary: "Mark all as read", secondary: `In ${folder?.name || "current folder"}`, meta: "" },
    { key: "search",         primary: "Search this folder", secondary: "Filter messages by sender / subject", meta: "/" },
    { key: "keyboard-help",  primary: "Keyboard shortcuts\u2026", secondary: "Show all hotkeys",         meta: "?" },
    { key: "about",          primary: "About Mailbrus\u2026", secondary: "Philosophy, source, license", meta: "" },
    { key: "toggle-dark",    primary: "Toggle dark mode", secondary: "", meta: "" },
  ];
  return (
    <Palette
      eyebrow="command"
      title="Commands"
      placeholder="Type a command…"
      items={items}
      onSelect={(it) => onAction(it.key)}
      onCancel={onCancel}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Mail list screen
// ─────────────────────────────────────────────────────────────────────────────
function Paperclip() {
  return (
    <svg className="mb-attach-icon" width="12" height="12" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.5 11.5l-8.4 8.4a5 5 0 0 1-7.07-7.07l8.4-8.4a3.5 3.5 0 0 1 4.95 4.95l-8.4 8.4a2 2 0 0 1-2.83-2.83l7.7-7.7" />
    </svg>
  );
}

function MailList({
  account, folder, messages, density,
  selectedIdx, onSelectIdx,
  searchOpen, searchQuery, onSearchChange, onSearchSubmit, onSearchClose,
  onOpen,
  onHome, onAccount, onFolder,
}) {
  const listRef = useRef(null);
  const searchInputRef = useRef(null);

  // scroll selected into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-msg-idx="${selectedIdx}"]`);
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [selectedIdx]);

  useEffect(() => {
    if (searchOpen) setTimeout(() => searchInputRef.current?.focus(), 30);
  }, [searchOpen]);

  const filtered = useMemo(() => {
    const q = (searchQuery || "").trim().toLowerCase();
    if (!q) return messages;
    return messages.filter((m) =>
      `${m.from} ${m.addr} ${m.subject} ${m.preview}`.toLowerCase().includes(q),
    );
  }, [messages, searchQuery]);

  const unread = messages.filter((m) => m.unread).length;

  return (
    <div className="mb-list-screen">
      <Breadcrumbs
        account={account}
        folder={folder}
        onHome={onHome}
        onAccount={onAccount}
        onFolder={onFolder}
        right={
          <>
            <span className="count"><strong>{unread}</strong> unread</span>
            <span>·</span>
            <span className="count"><strong>{filtered.length}</strong> / {messages.length}</span>
          </>
        }
      />

      {searchOpen && (
        <div className="mb-search">
          <span className="prompt">/</span>
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") { e.preventDefault(); onSearchClose(); }
              if (e.key === "Enter") { e.preventDefault(); onSearchSubmit(); }
            }}
            placeholder="filter sender, subject, body…"
            spellCheck={false}
          />
          <span className="hint">esc clears · enter applies</span>
        </div>
      )}

      <div className={`mb-mail-list mb-scroll dens-${density}`} ref={listRef}>
        {filtered.length === 0 ? (
          <div className="mb-empty">
            <div className="big">You're all caught up.</div>
            <div>Nothing left to read in {folder.name}.</div>
          </div>
        ) : filtered.map((m, i) => (
          <div
            key={i}
            data-msg-idx={i}
            className={"mb-msg" + (m.unread ? " unread" : "") + (i === selectedIdx ? " active" : "")}
            onMouseEnter={() => onSelectIdx(i)}
            onClick={() => onOpen(m)}
          >
            {density === "spacious" ? (
              <div className="flag"><Avatar email={m.addr} name={m.from} size={32} /></div>
            ) : (
              <div className="flag">{m.unread ? "" : (m.flags || "")}</div>
            )}
            {density === "twoline" ? (
              <>
                <div className="head">
                  <span className="from">{m.from}</span>
                  <span className="time">
                    {m.attachments && m.attachments.length > 0 && <Paperclip />}
                    {m.time}
                  </span>
                </div>
                <div className="body-row">
                  <span className="subject">{m.subject}</span>
                  <span className="preview">{m.preview}</span>
                </div>
              </>
            ) : density === "spacious" ? (
              <>
                <div className="head"><span className="from">{m.from}</span></div>
                <div className="subject">{m.subject}</div>
                <div className="preview">{m.preview}</div>
                <div className="time">
                  {m.attachments && m.attachments.length > 0 && <Paperclip />}
                  {m.time}
                </div>
              </>
            ) : (
              <>
                <div className="from">{m.from}</div>
                <div className="subject">{m.subject}</div>
                <div className="time">
                  {m.attachments && m.attachments.length > 0 && <Paperclip />}
                  {m.time}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// About dialog
// ─────────────────────────────────────────────────────────────────────────────
function About({ onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="mb-curtain" onClick={(e) => {
      if (e.target.classList.contains("mb-curtain")) onClose();
    }}>
      <div className="mb-about" role="dialog" aria-modal="true" aria-label="About Mailbrus">
        <button type="button" className="mb-about-close" onClick={onClose} aria-label="Close">×</button>
        <div className="mb-about-logo" aria-hidden="true">
          {/* Placeholder logo — TBD. A square brand chip with the wordmark dot at scale. */}
          <span className="mb-about-logo-chip">
            <span className="mb-about-logo-dot" />
          </span>
          <span className="mb-about-logo-tbd">logo · tbd</span>
        </div>
        <div className="mb-about-wordmark">
          <Wordmark size={36} />
        </div>
        <p className="mb-about-tag">
          A keyboard-oriented, no-bullshit,<br />
          text-only email client.
        </p>
        <div className="mb-about-divider" aria-hidden="true" />
        <dl className="mb-about-meta">
          <div className="mb-about-meta-row">
            <dt>source</dt>
            <dd>
              <a
                href="https://github.com/antono/mailbrus"
                target="_blank"
                rel="noopener noreferrer"
                className="mb-about-link"
              >
                github.com/antono/mailbrus
                <span className="mb-about-link-arrow" aria-hidden="true">↗</span>
              </a>
              <span className="mb-about-meta-tbd">tbd</span>
            </dd>
          </div>
          <div className="mb-about-meta-row">
            <dt>license</dt>
            <dd>MIT</dd>
          </div>
          <div className="mb-about-meta-row">
            <dt>version</dt>
            <dd>0.4.2 <span className="mb-about-meta-mute">(prototype)</span></dd>
          </div>
        </dl>
        <div className="mb-about-foot">
          <span className="kbd-group">
            <span className="kbd">esc</span>
            <span className="kbd-label">close</span>
          </span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Keyboard help overlay
// ─────────────────────────────────────────────────────────────────────────────
const KEY_HELP_SECTIONS = [
  {
    label: "Navigation",
    items: [
      { keys: [["j"], ["↓"]],            desc: "Next message" },
      { keys: [["k"], ["↑"]],            desc: "Previous message" },
      { keys: [["g", "g"]],              desc: "Top of list" },
      { keys: [["G"]],                   desc: "Bottom of list" },
    ],
  },
  {
    label: "Actions",
    items: [
      { keys: [["↵"]],                   desc: "Open selected message" },
      { keys: [["/"]],                   desc: "Search this folder" },
      { keys: [["c"]],                   desc: "Compose new message" },
      { keys: [["Esc"]],                 desc: "Go back / close" },
    ],
  },
  {
    label: "Go to",
    items: [
      { keys: [["g", "i"]],              desc: "Inbox" },
      { keys: [["g", "a"]],              desc: "Archive" },
      { keys: [["g", "s"]],              desc: "Sent" },
      { keys: [["g", "d"]],              desc: "Drafts" },
      { keys: [["g", "f"]],              desc: "Folder picker" },
      { keys: [["g", "A"]],              desc: "Account picker" },
    ],
  },
  {
    label: "App",
    items: [
      { keys: [["⌘", "K"]],              desc: "Command palette" },
      { keys: [["?"]],                   desc: "This help" },
    ],
  },
  {
    label: "Inside palettes",
    items: [
      { keys: [["1"], ["–"], ["9"]],     desc: "Jump to row" },
      { keys: [["↑"], ["↓"]],            desc: "Move selection" },
      { keys: [["↵"]],                   desc: "Confirm" },
      { keys: [["Esc"]],                 desc: "Cancel" },
    ],
  },
  {
    label: "Reader",
    items: [
      { keys: [["j"], ["k"]],            desc: "Next / previous message" },
      { keys: [["Esc"]],                 desc: "Close reader" },
    ],
  },
  {
    label: "Compose",
    items: [
      { keys: [["⌘", "↵"]],              desc: "Send" },
      { keys: [["⌘", "S"]],              desc: "Save draft" },
      { keys: [["Esc"]],                 desc: "Discard" },
    ],
  },
];

function KeyboardHelp({ onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" || e.key === "?") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <div className="mb-curtain" onClick={(e) => {
      if (e.target.classList.contains("mb-curtain")) onClose();
    }}>
      <div className="mb-help" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
        <div className="head">
          <div className="eyebrow">
            <span>keyboard shortcuts</span>
            <Wordmark size={11} />
          </div>
          <div className="title">All hotkeys</div>
        </div>
        <div className="mb-help-grid mb-scroll">
          {KEY_HELP_SECTIONS.map((section, si) => (
            <div key={si} className="mb-help-sect">
              <div className="mb-help-sect-label">{section.label}</div>
              <div className="mb-help-rows">
                {section.items.map((it, ii) => (
                  <div key={ii} className="mb-help-row">
                    <div className="mb-help-keys">
                      {it.keys.map((grp, gi) => (
                        <span key={gi} className="mb-help-keygroup">
                          {grp.map((k, ki) => (
                            <span key={ki} className="kbd">{k}</span>
                          ))}
                        </span>
                      ))}
                    </div>
                    <div className="mb-help-desc">{it.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="foot">
          <span className="kbd-group"><span className="kbd">?</span><span className="kbd-label">toggle</span></span>
          <span className="kbd-group" style={{ marginLeft: "auto" }}>
            <span className="kbd">esc</span><span className="kbd-label">close</span>
          </span>
        </div>
      </div>
    </div>
  );
}

// Build a contacts directory from sample data — used for recipient autocomplete.
function _buildContacts() {
  if (!window.MAILBRUS_DATA) return [];
  const seen = new Map();
  const add = (name, addr) => {
    if (!addr || !/@/.test(addr)) return;
    const key = addr.toLowerCase();
    const cleanName = (name || "").replace(/^(To:|Re:|Fwd:)\s*/i, "").trim();
    const existing = seen.get(key);
    if (!existing || (cleanName && cleanName !== addr && existing.name === addr)) {
      seen.set(key, { name: cleanName && cleanName !== addr ? cleanName : addr, addr });
    }
  };
  for (const a of window.MAILBRUS_DATA.accounts) add(a.address, a.address);
  for (const key of Object.keys(window.MAILBRUS_DATA.messages)) {
    for (const m of window.MAILBRUS_DATA.messages[key]) add(m.from, m.addr);
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function RecipientInput({ id, value, onChange, placeholder, autoFocus }) {
  const ref = useRef(null);
  const [openSugg, setOpenSugg] = useState(false);
  const [sIdx, setSIdx] = useState(0);
  const contacts = useMemo(_buildContacts, []);

  useEffect(() => {
    if (autoFocus) {
      const t = setTimeout(() => ref.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [autoFocus]);

  // Parse the current token (text after the last comma/semicolon).
  const caret = ref.current?.selectionStart ?? value.length;
  const tokens = useMemo(() => {
    const before = value.slice(0, caret);
    const after = value.slice(caret);
    // Find last separator before caret
    const lastSep = Math.max(before.lastIndexOf(","), before.lastIndexOf(";"));
    const start = lastSep + 1;
    // Find next separator at or after caret
    const nextCommaRel = after.search(/[,;]/);
    const end = nextCommaRel === -1 ? value.length : caret + nextCommaRel;
    const current = value.slice(start, end);
    return { start, end, current };
  }, [value, caret]);

  const trimmed = tokens.current.trim().toLowerCase();
  const suggestions = useMemo(() => {
    if (!trimmed) return contacts.slice(0, 8);
    // Exclude addresses already present in value
    const already = new Set(
      value.split(/[,;]/).map((s) => s.trim().toLowerCase()).filter(Boolean)
        .map((s) => {
          const m = s.match(/<([^>]+)>/);
          return (m ? m[1] : s).toLowerCase();
        })
    );
    return contacts.filter((c) => {
      if (already.has(c.addr.toLowerCase()) && !c.addr.toLowerCase().includes(trimmed) && !c.name.toLowerCase().includes(trimmed)) return false;
      if (already.has(c.addr.toLowerCase())) return false;
      const hay = `${c.name} ${c.addr}`.toLowerCase();
      return hay.includes(trimmed);
    }).slice(0, 8);
  }, [contacts, trimmed, value]);

  useEffect(() => { setSIdx(0); }, [trimmed, openSugg]);

  const acceptSuggestion = (contact) => {
    const formatted = contact.name && contact.name !== contact.addr
      ? `${contact.name} <${contact.addr}>`
      : contact.addr;
    const before = value.slice(0, tokens.start);
    const after = value.slice(tokens.end);
    // Add ", " separator if there is more content after, or if user
    // likely wants to add another recipient.
    const next = (before + formatted + ", " + after.replace(/^[\s,;]+/, "")).replace(/^[\s,;]+/, "");
    const newCaret = (before + formatted + ", ").length;
    onChange(next);
    setOpenSugg(false);
    requestAnimationFrame(() => {
      if (ref.current) {
        ref.current.focus();
        ref.current.setSelectionRange(newCaret, newCaret);
      }
    });
  };

  const onKey = (e) => {
    if (openSugg && suggestions.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setSIdx((i) => Math.min(i + 1, suggestions.length - 1)); return; }
      if (e.key === "ArrowUp")   { e.preventDefault(); setSIdx((i) => Math.max(i - 1, 0)); return; }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        acceptSuggestion(suggestions[sIdx]);
        return;
      }
      if (e.key === "Escape") { e.preventDefault(); setOpenSugg(false); return; }
    }
    // Comma/semicolon as a separator — also opens next suggestion round.
    if (e.key === "," || e.key === ";") {
      // let it through, but make sure suggestions stay open
      setOpenSugg(true);
    }
  };

  return (
    <div className="cf-autocomplete">
      <input
        id={id}
        ref={ref}
        className="cf-input"
        type="text"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpenSugg(true); }}
        onFocus={() => setOpenSugg(true)}
        onBlur={() => setTimeout(() => setOpenSugg(false), 120)}
        onKeyDown={onKey}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
      />
      {openSugg && suggestions.length > 0 && (
        <div className="cf-sugg mb-scroll" role="listbox">
          {suggestions.map((c, i) => (
            <div
              key={c.addr}
              role="option"
              aria-selected={i === sIdx}
              className={"cf-sugg-row" + (i === sIdx ? " active" : "")}
              onMouseDown={(e) => { e.preventDefault(); acceptSuggestion(c); }}
              onMouseEnter={() => setSIdx(i)}
            >
              <span className="cf-sugg-name">{c.name === c.addr ? c.addr : c.name}</span>
              {c.name !== c.addr && (
                <span className="cf-sugg-addr">{c.addr}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Compose
// ─────────────────────────────────────────────────────────────────────────────
function Compose({ account, folder, onClose, onSent, onHome, onAccount, onFolder }) {
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const toRef = useRef(null);
  const bodyRef = useRef(null);

  // Auto-focus the To field on mount.
  useEffect(() => {
    const t = setTimeout(() => toRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, []);

  // Global compose shortcuts. Esc discards (with confirm if dirty);
  // ⌘↵ sends. We don't listen for these on the textareas themselves so
  // ↵ inside the body just makes a newline.
  const isDirty = !!(to || cc || bcc || subject || body);

  useEffect(() => {
    const onKey = (e) => {
      // ⌘↵ / Ctrl+↵ — send
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        onSent?.({ to, cc, bcc, subject, body });
        return;
      }
      // ⌘S — save draft (stub)
      if ((e.metaKey || e.ctrlKey) && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        onSent?.({ to, cc, bcc, subject, body, draft: true });
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        if (isDirty) {
          if (window.confirm("Discard this draft?")) onClose();
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [to, cc, bcc, subject, body, isDirty, onClose, onSent]);

  const charCount = body.length;
  const wordCount = body.trim() ? body.trim().split(/\s+/).length : 0;

  return (
    <div className="mb-compose">
      <Breadcrumbs
        account={account}
        folder={folder}
        folderLabel="Compose"
        onHome={onHome}
        onAccount={onAccount}
        onFolder={onFolder}
        right={
          <>
            <span className="count">{wordCount} words · {charCount} chars</span>
            <span>·</span>
            <span><span className="kbd">esc</span> discard</span>
            <span>·</span>
            <span><span className="kbd">⌘</span><span className="kbd">↵</span> send</span>
          </>
        }
      />
      <div className="mb-compose-scroll mb-scroll">
        <div className="mb-compose-fields">
          <div className="cf-row">
            <label className="cf-label" htmlFor="cf-from">From</label>
            <div className="cf-value cf-static">{account.address}</div>
          </div>
          <div className="cf-row">
            <label className="cf-label" htmlFor="cf-to">To</label>
            <RecipientInput
              id="cf-to"
              value={to}
              onChange={setTo}
              placeholder="someone@example.com, another@example.com"
              autoFocus
            />
            <div className="cf-aux">
              {!showCc && (
                <button type="button" className="cf-aux-btn" onClick={() => setShowCc(true)}>+ Cc</button>
              )}
              {!showBcc && (
                <button type="button" className="cf-aux-btn" onClick={() => setShowBcc(true)}>+ Bcc</button>
              )}
            </div>
          </div>
          {showCc && (
            <div className="cf-row">
              <label className="cf-label" htmlFor="cf-cc">Cc</label>
              <RecipientInput
                id="cf-cc"
                value={cc}
                onChange={setCc}
                placeholder=""
              />
            </div>
          )}
          {showBcc && (
            <div className="cf-row">
              <label className="cf-label" htmlFor="cf-bcc">Bcc</label>
              <RecipientInput
                id="cf-bcc"
                value={bcc}
                onChange={setBcc}
                placeholder=""
              />
            </div>
          )}
          <div className="cf-row">
            <label className="cf-label" htmlFor="cf-subject">Subject</label>
            <input
              id="cf-subject"
              className="cf-input cf-input-subject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder=""
              spellCheck={true}
              autoComplete="off"
            />
          </div>
        </div>
        <div className="mb-compose-divider" aria-hidden="true" />
        <textarea
          ref={bodyRef}
          className="mb-compose-body mb-scroll"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write your message…"
          spellCheck={true}
        />
      </div>
    </div>
  );
}
// Split a message body on the standard signature separator (a line of
// exactly "-- " — dash dash space). Per RFC 3676 §4.3.
function splitSignature(text) {
  if (!text) return { main: "", sig: "" };
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i].replace(/\r$/, "");
    if (ln === "-- ") {
      return {
        main: lines.slice(0, i).join("\n"),
        sig:  lines.slice(i).join("\n"),
      };
    }
  }
  return { main: text, sig: "" };
}

// Synthesize plausible RFC 5322 headers from a message + account context.
function buildHeaders(message, account, folder) {
  const ago = expandTime(message.time);
  const iso = ago.iso || message.time;
  // Convert "2026-05-20 15:28" → RFC 5322 "Wed, 20 May 2026 15:28:00 +0300"
  let rfc = message.time;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);
  if (m) {
    const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    const dn = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()];
    const mn = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()];
    rfc = `${dn}, ${d.getDate()} ${mn} ${d.getFullYear()} ${m[4]}:${m[5]}:00 +0300`;
  }
  const localPart = (account.address.split("@")[0] || "user");
  const domain = (account.address.split("@")[1] || "example.com");
  const msgId = `<${Math.abs([...message.subject].reduce((a,c)=>a*31+c.charCodeAt(0),0)).toString(36)}.${Date.now().toString(36)}@${(message.addr.split("@")[1] || "mail.local")}>`;
  const senderDomain = (message.addr.split("@")[1] || "mail.local");
  return [
    ["Return-Path", `<${message.addr}>`],
    ["Delivered-To", account.address],
    ["Received", `from mx.${senderDomain} (mx.${senderDomain} [203.0.113.${(message.subject.length*7) % 250}])\n        by mx.${domain} with ESMTPS id 4XqL${Math.abs(message.subject.length*991).toString(36)}\n        for <${account.address}>; ${rfc}`],
    ["Received", `from [10.0.0.${(message.subject.length*3) % 250}] (helo=${senderDomain})\n        by mx.${senderDomain} with ESMTPSA; ${rfc}`],
    ["Authentication-Results", `mx.${domain};\n        dkim=pass header.d=${senderDomain} header.s=mail header.b="a8/Fv3qZ";\n        spf=pass (sender IP is 203.0.113.${(message.subject.length*7) % 250}) smtp.mailfrom=${senderDomain};\n        dmarc=pass (p=quarantine sp=quarantine dis=none) header.from=${senderDomain}`],
    ["DKIM-Signature", `v=1; a=rsa-sha256; c=relaxed/relaxed; d=${senderDomain}; s=mail;\n        t=${Math.floor(Date.now()/1000)}; bh=H7${msgId.slice(1,28)}=;\n        h=From:To:Subject:Date:Message-ID:MIME-Version:Content-Type;\n        b=Sk0bF9zL/N6q4dC+vP8mLrYxJ2pK5wT3...`],
    ["From", message.from === message.addr ? message.addr : `${message.from} <${message.addr}>`],
    ["To", account.address],
    ["Subject", message.subject],
    ["Date", rfc],
    ["Message-ID", msgId],
    ["MIME-Version", "1.0"],
    ["Content-Type", "text/plain; charset=UTF-8; format=flowed"],
    ["Content-Transfer-Encoding", "8bit"],
    ["X-Mailer", "Mailbrus 0.4.2 (maildir)"],
    ["X-Mailbrus-Folder", `${account.maildir}/${folder.id}`],
    ["X-Mailbrus-Flags", message.unread ? "" : (message.flags || "R")],
    ["List-Unsubscribe", `<mailto:unsubscribe@${senderDomain}?subject=unsubscribe>`].filter(() => /noreply|notifications|newsletter|lists|no-reply|digest/i.test(message.addr) || /digest|newsletter/i.test(message.subject)).length ? ["List-Unsubscribe", `<mailto:unsubscribe@${senderDomain}?subject=unsubscribe>`] : null,
  ].filter(Boolean);
}

function HeadersPopover({ headers, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);
  return (
    <div className="mb-headers-pop" ref={ref} role="dialog" aria-label="Message headers">
      <div className="mb-headers-pop-head">
        <span className="eyebrow">message headers</span>
        <button type="button" className="mb-headers-close" onClick={onClose} aria-label="Close headers">
          ×
        </button>
      </div>
      <div className="mb-headers-pop-body mb-scroll">
        {headers.map(([k, v], i) => (
          <div key={i} className="mb-header-row">
            <span className="mb-header-k">{k}:</span>
            <span className="mb-header-v">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function _fmtBytes(n) {
  if (n == null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
function _attExt(name) {
  const m = (name || "").match(/\.([a-z0-9]{1,5})$/i);
  return m ? m[1].toUpperCase() : "FILE";
}

function Attachments({ items }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mb-att-row mb-scroll" aria-label="Attachments">
      {items.map((a, i) => (
        <button
          key={i}
          type="button"
          className="mb-att"
          title={`${a.name} — ${_fmtBytes(a.size)}`}
          onClick={(e) => e.preventDefault()}
        >
          <span className="mb-att-ext">{_attExt(a.name)}</span>
          <span className="mb-att-name">{a.name}</span>
          <span className="mb-att-size">{_fmtBytes(a.size)}</span>
        </button>
      ))}
    </div>
  );
}

function Reader({ message, account, folder, body, onClose, onHome, onAccount, onFolder }) {
  const bodyRef = useRef(null);
  const ago = useMemo(() => expandTime(message.time), [message.time]);
  const parts = useMemo(() => splitSignature(body), [body]);
  const [showHeaders, setShowHeaders] = useState(false);
  const headers = useMemo(
    () => buildHeaders(message, account, folder),
    [message, account, folder],
  );
  const unsubHeader = useMemo(() => {
    const row = headers.find(([k]) => k === "List-Unsubscribe");
    return row ? row[1] : null;
  }, [headers]);
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="mb-reader">
      <Breadcrumbs
        account={account}
        folder={folder}
        onHome={onHome}
        onAccount={onAccount}
        onFolder={onFolder}
        right={
          <>
            <span className="count">reading</span>
            <span>·</span>
            <span><span className="kbd">esc</span> back</span>
          </>
        }
      />
      <div className="mb-reader-scroll mb-scroll" ref={bodyRef}>
        <div className="mb-reader-head">
          <div className="sub">
            <div className="sub-line">
              <span className="sub-text">
                {message.subject}
                <span className="sub-ago" title={ago.iso}> [{ago.label}]</span>
              </span>
              <span className="sub-icons">
                <span
                  className={"sub-icon sub-icon-static" + (parts.sig ? "" : " is-unsigned")}
                  title={parts.sig ? "Signed message (has signature block)" : "Unsigned"}
                  aria-label={parts.sig ? "Signed message" : "Unsigned"}
                >
                  {parts.sig ? (
                    /* locked padlock */
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="4" y="11" width="16" height="10" rx="2" />
                      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                    </svg>
                  ) : (
                    /* unlocked padlock */
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="4" y="11" width="16" height="10" rx="2" />
                      <path d="M8 11V8a4 4 0 0 1 7-2.6" />
                    </svg>
                  )}
                </span>
                {unsubHeader && (
                  <button
                    type="button"
                    className="sub-icon sub-icon-btn"
                    onClick={(e) => { e.preventDefault(); /* stub */ }}
                    title={`Unsubscribe — ${unsubHeader}`}
                    aria-label="Unsubscribe from this mailing list"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 6.5l8 6 8-6" />
                      <rect x="3.25" y="5" width="17.5" height="14" rx="2" />
                      <path d="M7.5 14.5l5 -5" />
                      <path d="M7.5 9.5l5 5" />
                    </svg>
                  </button>
                )}
                <button
                  type="button"
                  className={"sub-icon sub-icon-btn" + (showHeaders ? " is-active" : "")}
                  onClick={() => setShowHeaders((v) => !v)}
                  title="View raw message headers"
                  aria-label="View raw message headers"
                  aria-expanded={showHeaders}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                       stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 6h16" />
                    <path d="M4 11h16" />
                    <path d="M4 16h10" />
                  </svg>
                </button>
              </span>
            </div>
            {showHeaders && (
              <HeadersPopover
                headers={headers}
                onClose={() => setShowHeaders(false)}
              />
            )}
          </div>
          <div className="meta">
            {(() => {
              // In sent/drafts, the data model stores "To: <Name>" or "Draft" in
              // the `from` field. Detect that and swap From/To accordingly.
              const sentMatch = (message.from || "").match(/^To:\s*(.+)$/);
              const isDraft = message.from === "Draft" || message.from === "Drafts";

              if (sentMatch) {
                const recipientName = sentMatch[1];
                const recipientAddr = message.addr;
                return (
                  <>
                    <div><span className="meta-label">From</span> {account.address}</div>
                    <div>
                      <span className="meta-label">To</span>{"   "}
                      {recipientName === recipientAddr
                        ? recipientAddr
                        : <>{recipientName} &lt;{recipientAddr}&gt;</>}
                    </div>
                  </>
                );
              }
              if (isDraft) {
                return (
                  <>
                    <div><span className="meta-label">From</span> {account.address}</div>
                    <div><span className="meta-label">To</span>{"   "}<span style={{ opacity: 0.5 }}>(no recipient)</span></div>
                  </>
                );
              }
              return (
                <>
                  <div>
                    <span className="meta-label">From</span> {message.from}
                    {message.addr && message.addr !== message.from && (
                      <> &lt;{message.addr}&gt;</>
                    )}
                  </div>
                  <div><span className="meta-label">To</span>{"   "}{account.address}</div>
                </>
              );
            })()}
          </div>
        </div>
        <Attachments items={message.attachments} />
        <div className="mb-reader-body">
          {parts.main}
          {parts.sig && (
            <>
              {"\n"}
              <span className="mb-sig">{parts.sig}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function HintBar({ onShowHelp, children }) {
  const innerRef = useRef(null);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const check = () => {
      // a few-pixel tolerance avoids flicker at the threshold
      setOverflowing(el.scrollWidth > el.clientWidth + 2);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    // observe children too, in case font metrics resolve late
    [...el.children].forEach((c) => ro.observe(c));
    return () => ro.disconnect();
  }, [children]);

  return (
    <div className="mb-hints">
      <div className="mb-hints-left" ref={innerRef}>
        {children}
      </div>
      {overflowing && (
        <button
          type="button"
          className="mb-hints-overflow"
          onClick={onShowHelp}
          title="Show all keyboard shortcuts (?)"
          aria-label="Show all keyboard shortcuts"
        >
          ?
        </button>
      )}
      <div className="mb-hints-right">
        <span className="hint"><span className="kbd">⌘</span><span className="kbd">k</span> commands</span>
      </div>
    </div>
  );
}

// Export to window for the other Babel script
Object.assign(window, {
  Wordmark, Avatar, Breadcrumbs, Palette, AccountPicker, FolderPicker, CommandPalette, MailList, Reader, HeadersPopover, Compose, KeyboardHelp, HintBar, RecipientInput, Attachments, About,
});
