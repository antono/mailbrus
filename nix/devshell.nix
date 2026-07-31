{ pkgs, tauri-deps, dev-deps }:
let
  gtk3 = pkgs.gtk3;
  gschema = pkgs.gsettings-desktop-schemas;
  dev = pkgs.writeShellScriptBin "dev" ''
    exec ${pkgs.deno}/bin/deno task watch "$@"
  '';

  # Patch script: rewrites revision numbers in Playwright browsers.json to match
  # the directories available in $PLAYWRIGHT_BROWSERS_PATH from nixpkgs.
  fixBrowsersJson = pkgs.writeText "fix-playwright-browsers.py" ''
    import json, os, re, sys

    browsers_path = os.environ.get("PLAYWRIGHT_BROWSERS_PATH", "")
    if not browsers_path:
        sys.exit(0)

    # Build mapping: browser name -> actual revision from nix store listing
    actual = {}
    for d in os.listdir(browsers_path):
        m = re.match(r"^(.+)-(\d+)$", d)
        if m:
            name = m.group(1).replace("_", "-")
            rev = m.group(2)
            actual.setdefault(name, rev)

    # Find browsers.json files under node_modules
    import subprocess
    result = subprocess.run(
        ["find", "node_modules",
         "-path", "*/playwright-core/browsers.json",
         "-o", "-path", "*/@playwright/test/browsers.json"],
        capture_output=True, text=True, check=False
    )
    for json_path in result.stdout.strip().splitlines():
        if not json_path:
            continue
        with open(json_path) as f:
            data = json.load(f)
        changed = False
        for b in data.get("browsers", []):
            name = b.get("name", "")
            expected = b.get("revision", "")
            if name in actual and actual[name] != expected:
                print(f"  PW: {name}: {expected} -> {actual[name]}")
                b["revision"] = actual[name]
                changed = True
        if changed:
            with open(json_path, "w") as f:
                json.dump(data, f, indent=2)
            print(f"  PW: patched {json_path}")
  '';
in
pkgs.mkShell {
  buildInputs = tauri-deps ++ dev-deps ++ [ gtk3 pkgs.gtk4 gschema pkgs.adwaita-icon-theme pkgs.glib dev ];

  shellHook = ''
    echo "mailbrus dev environment"
    echo "  rustc $(rustc --version)"
    echo "  deno  $(deno --version | head -1)"
    cargo tauri --version 2>/dev/null || echo "  cargo-tauri: available"

    # GTK file chooser requires gsettings-schemas path (per Tauri docs)
    export XDG_DATA_DIRS="${gschema}/share/gsettings-schemas/${gschema.name}:${gtk3}/share/gsettings-schemas/${gtk3.name}:$XDG_DATA_DIRS"

    # The nixpkgs playwright-driver may ship newer chromium/firefox revisions
    # than what the pinned @playwright/test npm package expects. Patch every
    # browsers.json under node_modules so the expected revision matches the
    # directory name in $PLAYWRIGHT_BROWSERS_PATH.
    if [ -n "$PLAYWRIGHT_BROWSERS_PATH" ] && [ -d node_modules ]; then
      ${pkgs.python3}/bin/python3 ${fixBrowsersJson}
    fi
  '';

  env = {
    PKG_CONFIG_PATH = "${pkgs.openssl.dev}/lib/pkgconfig";
    WEBKIT_DISABLE_COMPOSITING_MODE = "1";
    WEBKIT_DISABLE_DMABUF_RENDERER = "1";
    GDK_BACKEND = "x11";

    # Playwright E2E: use the Nix-provided browsers, never download at runtime.
    # Host-requirement validation is left ON: the nixpkgs browsers resolve their
    # libraries via RPATH and pass it silently, so skipping it only added a noisy
    # "Skipping host requirements validation…" line to every run.
    PLAYWRIGHT_BROWSERS_PATH = "${pkgs.playwright-driver.browsers}";
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
  };
}
