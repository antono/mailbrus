// Mailbrus — main app. State machine: account → folder → list → reader.
/* global React, ReactDOM, MAILBRUS_DATA */
/* global AccountPicker, FolderPicker, CommandPalette, MailList, Reader */
/* global useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakToggle, TweakColor, TweakSelect */

const { useState, useEffect, useRef, useCallback } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "dark": false,
  "accent": "indigo",
  "font": "sans",
  "density": "twoline",
  "hintBar": true
}/*EDITMODE-END*/;

const FONT_STACKS = {
  sans:  'var(--font-sans)',
  mono:  'var(--font-mono)',
  serif: '"Iowan Old Style", "Charter", "Iowan", Georgia, "Times New Roman", serif',
};

const ACCENT_LABELS = {
  indigo: "Indigo",
  violet: "Violet",
  blue:   "Blue",
  green:  "Green",
  rose:   "Rose",
  amber:  "Amber",
  mono:   "Mono",
};

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  // apply theme on <html>
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", !!t.dark);
    root.setAttribute("data-accent", t.accent || "indigo");
    root.style.setProperty("--font-app", FONT_STACKS[t.font] || FONT_STACKS.sans);
  }, [t.dark, t.accent, t.font]);

  // ─── state machine ───────────────────────────────────────────────
  // phase: "account" | "folder" | "list"
  const [phase, setPhase] = useState("account");
  const [account, setAccount] = useState(null);
  const [folder, setFolder] = useState(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [openMessage, setOpenMessage] = useState(null);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [leader, setLeader] = useState(null); // "g" while waiting for second key
  const leaderTimeoutRef = useRef(null);

  const data = MAILBRUS_DATA;
  const messages = (account && folder)
    ? (data.messages[`${account.id}/${folder.id}`] || [])
    : [];

  // ─── helpers ────────────────────────────────────────────────────
  const goToFolder = useCallback((fId) => {
    if (!account) return;
    const f = data.folders[account.id].find((x) => x.id === fId);
    if (f) {
      setFolder(f);
      setSelectedIdx(0);
      setSearchOpen(false);
      setSearchQuery("");
      setOpenMessage(null);
      setPhase("list");
    }
  }, [account, data]);

  const startLeader = useCallback((key) => {
    setLeader(key);
    clearTimeout(leaderTimeoutRef.current);
    leaderTimeoutRef.current = setTimeout(() => setLeader(null), 1200);
  }, []);

  const clearLeader = useCallback(() => {
    setLeader(null);
    clearTimeout(leaderTimeoutRef.current);
  }, []);

  // ─── command palette actions ─────────────────────────────────────
  const handleCommand = (cmd) => {
    setCmdOpen(false);
    switch (cmd) {
      case "switch-account": setPhase("account"); break;
      case "switch-folder":  setPhase("folder"); break;
      case "go-inbox":       goToFolder("inbox"); break;
      case "go-archive":     goToFolder("archive"); break;
      case "compose":        setComposeOpen(true); break;
      case "keyboard-help":  setHelpOpen(true); break;
      case "about":          setAboutOpen(true); break;
      case "search":         setSearchOpen(true); break;
      case "toggle-dark":    setTweak("dark", !t.dark); break;
      case "mark-read":      break;
      default: break;
    }
  };

  // ─── global keyboard ─────────────────────────────────────────────
  useEffect(() => {
    const isTyping = (e) => {
      const tag = (e.target.tagName || "").toLowerCase();
      return tag === "input" || tag === "textarea" || e.target.isContentEditable;
    };

    const onKey = (e) => {
      // ⌘K / Ctrl+K always works
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        if (account && folder) setCmdOpen((v) => !v);
        return;
      }

      // ? toggles keyboard help (when not typing, no modal). Works in most contexts.
      if (e.key === "?" && !isTyping(e) && !cmdOpen && !composeOpen && phase === "list") {
        e.preventDefault();
        setHelpOpen((v) => !v);
        return;
      }

      // when modals are up, the modal owns the keyboard
      if (phase !== "list" || cmdOpen || composeOpen || helpOpen || aboutOpen) return;

      // when reader is open, Esc closes (handled inside Reader too)
      if (openMessage) {
        if (e.key === "Escape") { e.preventDefault(); setOpenMessage(null); }
        if (e.key === "j" || e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedIdx((i) => Math.min(i + 1, messages.length - 1));
          // jump reader content to next message
          setTimeout(() => {
            setOpenMessage(messages[Math.min(selectedIdx + 1, messages.length - 1)] || null);
          }, 0);
        }
        if (e.key === "k" || e.key === "ArrowUp") {
          e.preventDefault();
          const next = Math.max(selectedIdx - 1, 0);
          setSelectedIdx(next);
          setTimeout(() => setOpenMessage(messages[next] || null), 0);
        }
        return;
      }

      // search bar focused → handled by input
      if (isTyping(e)) return;

      // leader: g + i / g + a / g + f / g + A (capital)
      if (leader === "g") {
        if (e.key === "i") { e.preventDefault(); clearLeader(); goToFolder("inbox"); return; }
        if (e.key === "a") { e.preventDefault(); clearLeader(); goToFolder("archive"); return; }
        if (e.key === "A") { e.preventDefault(); clearLeader(); setPhase("account"); return; }
        if (e.key === "f") { e.preventDefault(); clearLeader(); setPhase("folder"); return; }
        if (e.key === "d") { e.preventDefault(); clearLeader(); goToFolder("drafts"); return; }
        if (e.key === "s") { e.preventDefault(); clearLeader(); goToFolder("sent"); return; }
        if (e.key === "g") { e.preventDefault(); clearLeader(); setSelectedIdx(0); return; }
        clearLeader();
        return;
      }

      if (e.key === "g") { e.preventDefault(); startLeader("g"); return; }
      if (e.key === "G") { e.preventDefault(); setSelectedIdx(messages.length - 1); return; }
      if (e.key === "c" && !e.metaKey && !e.ctrlKey && !leader) {
        e.preventDefault();
        setComposeOpen(true);
        return;
      }

      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, messages.length - 1));
        return;
      }
      if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (messages[selectedIdx]) setOpenMessage(messages[selectedIdx]);
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        if (searchOpen) { setSearchOpen(false); setSearchQuery(""); return; }
        // go back: list → folder picker
        setPhase("folder");
        return;
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, cmdOpen, composeOpen, helpOpen, aboutOpen, openMessage, leader, selectedIdx, messages, account, folder, searchOpen, goToFolder, startLeader, clearLeader, t.dark, setTweak]);

  // ─── handlers for pickers ────────────────────────────────────────
  const onAccountPick = (a) => {
    setAccount(a);
    setFolder(null);
    setPhase("folder");
  };
  const onFolderPick = (f) => {
    setFolder(f);
    setSelectedIdx(0);
    setSearchOpen(false);
    setSearchQuery("");
    setPhase("list");
  };

  // ─── render ─────────────────────────────────────────────────────
  return (
    <div className="mb-app" data-screen-label="Mailbrus">
      {/* Mail list (kept mounted under modals so the curtain blurs over it) */}
      {account && folder && (
        <MailList
          account={account}
          folder={folder}
          messages={messages}
          density={t.density}
          selectedIdx={selectedIdx}
          onSelectIdx={setSelectedIdx}
          searchOpen={searchOpen}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSearchSubmit={() => searchInputRef && searchInputRef.current && searchInputRef.current.blur()}
          onSearchClose={() => { setSearchOpen(false); setSearchQuery(""); }}
          onOpen={(m) => setOpenMessage(m)}
          onHome={() => setAboutOpen(true)}
          onAccount={() => setPhase("account")}
          onFolder={() => setPhase("folder")}
        />
      )}

      {/* hint bar */}
      {phase === "list" && t.hintBar && !openMessage && (
        <HintBar onShowHelp={() => setHelpOpen(true)}>
          <span className="hint"><span className="kbd">j</span><span className="kbd">k</span> move</span>
          <span className="hint"><span className="kbd">↵</span> open</span>
          <span className="hint"><span className="kbd">esc</span> back</span>
          <span className="hint"><span className="kbd">/</span> search</span>
          <span className="hint"><span className="kbd">c</span> compose</span>
          <span className="hint"><span className="kbd">g</span><span className="kbd">i</span> inbox</span>
          <span className="hint"><span className="kbd">g</span><span className="kbd">a</span> archive</span>
          <span className="hint"><span className="kbd">g</span><span className="kbd">f</span> folder</span>
          <span className="hint"><span className="kbd">g</span><span className="kbd" style={{ textTransform: 'none' }}>A</span> account</span>
        </HintBar>
      )}

      {/* Reader overlays list */}
      {openMessage && (
        <Reader
          message={openMessage}
          account={account}
          folder={folder}
          body={data.bodies.default}
          onClose={() => setOpenMessage(null)}
          onHome={() => setAboutOpen(true)}
          onAccount={() => { setOpenMessage(null); setPhase("account"); }}
          onFolder={() => { setOpenMessage(null); setPhase("folder"); }}
        />
      )}

      {aboutOpen && (
        <About onClose={() => setAboutOpen(false)} />
      )}

      {helpOpen && (
        <KeyboardHelp onClose={() => setHelpOpen(false)} />
      )}

      {/* Compose overlays everything when active */}
      {composeOpen && account && folder && (
        <Compose
          account={account}
          folder={folder}
          onClose={() => setComposeOpen(false)}
          onSent={() => setComposeOpen(false)}
          onHome={() => setAboutOpen(true)}
          onAccount={() => { setComposeOpen(false); setPhase("account"); }}
          onFolder={() => { setComposeOpen(false); setPhase("folder"); }}
        />
      )}

      {/* Modals */}
      {phase === "account" && (
        <AccountPicker
          accounts={data.accounts}
          returning={!!account}
          onSelect={onAccountPick}
          onCancel={() => { if (account && folder) setPhase("list"); }}
        />
      )}
      {phase === "folder" && account && (
        <FolderPicker
          account={account}
          folders={data.folders[account.id]}
          onSelect={onFolderPick}
          onCancel={() => {
            if (folder) setPhase("list");
            else setPhase("account");
          }}
        />
      )}
      {cmdOpen && account && folder && (
        <CommandPalette
          account={account}
          folder={folder}
          onAction={handleCommand}
          onCancel={() => setCmdOpen(false)}
        />
      )}

      {/* g-leader indicator */}
      {leader === "g" && phase === "list" && (
        <div className="mb-leader"><span className="key">g</span> — i inbox · a archive · s sent · d drafts · f folder · A account · g top</div>
      )}

      {/* Tweaks */}
      <TweaksPanel>
        <TweakSection label="Theme" />
        <TweakToggle
          label="Dark mode"
          value={t.dark}
          onChange={(v) => setTweak("dark", v)}
        />
        <TweakSelect
          label="Accent"
          value={t.accent}
          options={["indigo", "violet", "blue", "green", "rose", "amber", "mono"]}
          labels={ACCENT_LABELS}
          onChange={(v) => setTweak("accent", v)}
        />
        <TweakSection label="Typography" />
        <TweakRadio
          label="Font"
          value={t.font}
          options={["sans", "mono", "serif"]}
          onChange={(v) => setTweak("font", v)}
        />
        <TweakSection label="Layout" />
        <TweakRadio
          label="Density"
          value={t.density}
          options={["dense", "twoline", "spacious"]}
          onChange={(v) => setTweak("density", v)}
        />
        <TweakToggle
          label="Show key hints"
          value={t.hintBar}
          onChange={(v) => setTweak("hintBar", v)}
        />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
