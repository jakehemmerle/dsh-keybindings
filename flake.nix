{
  description = "dsh-keybindings: omp's effort and model keys for dsh-TUI 0.14.0, with its real-client test system";

  inputs = {
    # The same nixpkgs revisions jakehemmerle/nix-config pins (nixpkgs, nixpkgs-tools).
    nixpkgs.url = "github:NixOS/nixpkgs/7fc6f2c20af09cdcaf48b92ec3121860139ec668";
    nixpkgs-tools.url = "github:NixOS/nixpkgs/b6c8664de9b6cc07fe5666a29f91884ba81197c4";
    # dsh 0.2.1-alpha.2: the nix-dsh revision nix-config's flake.lock pins.
    nix-dsh = {
      url = "github:jakehemmerle/nix-dsh/f0ca0d745df8cbe99bad91d59153dbd690ae6660";
      flake = false;
    };
  };

  outputs = { self, nixpkgs, nixpkgs-tools, nix-dsh }:
    let
      lib = nixpkgs.lib;
      systems = [ "x86_64-linux" "aarch64-linux" "aarch64-darwin" "x86_64-darwin" ];
      forAll = f: lib.genAttrs systems (system: f system nixpkgs.legacyPackages.${system});
      manifest = builtins.fromJSON (builtins.readFile ./package.json);
      version = manifest.version;
      tuiDir = "lib/node_modules/@deepseek-harness-tui/dsh-tui";

      # Only the files the fast checks read, so docs edits do not rebuild them.
      testSrc = lib.fileset.toSource {
        root = ./.;
        fileset = lib.fileset.unions [ ./package.json ./package-lock.json ./test ./patches ];
      };

      build = system: pkgs:
        let
          nodejs = pkgs.nodejs_24;
          dsh = pkgs.callPackage "${nix-dsh}/package.nix" { };
          dshTui = args: pkgs.callPackage ./nix/dsh-tui.nix ({ inherit nodejs; } // args);
          nodeModules = pkgs.importNpmLock.buildNodeModules { npmRoot = testSrc; inherit nodejs; };
          unitCheck = "node --test ${testSrc}/test/omp-keys.test.mjs";
          # Upstream dsh-TUI plus nix-config's Launchpad word-edit patch: the
          # fleet's base under this patch, and the control build for e2e tests.
          base = dshTui { pname = "dsh-tui-base"; patches = [ ./nix/launchpad-word-edit.patch ]; };
          # The deployed stack order: launchpad-word-edit, then this patch.
          patched = dshTui {
            pname = "dsh-keybindings";
            inherit version;
            patches = [ ./nix/launchpad-word-edit.patch ./patches/dsh-tui-0.14.0-after-launchpad-word-edit.patch ];
            installCheck = unitCheck;
          };
          # The standalone variant on the untouched npm tarball.
          standalone = dshTui {
            pname = "dsh-keybindings-standalone";
            inherit version;
            patches = [ ./patches/dsh-tui-0.14.0.patch ];
            installCheck = unitCheck;
          };
          browsers = if pkgs.stdenv.isLinux then pkgs.playwright-driver.browsers else null;
          e2eEnv = {
            DSH_BIN = "${dsh}/bin/dsh";
            DSH_TUI_DIR = "${patched}/${tuiDir}";
            DSH_TUI_BASE_DIR = "${base}/${tuiDir}";
          } // lib.optionalAttrs (browsers != null) {
            PLAYWRIGHT_BROWSERS_PATH = "${browsers}";
            PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
          };
          exports = lib.concatStringsSep "\n" (lib.mapAttrsToList (k: v: "export ${k}=${lib.escapeShellArg v}") e2eEnv);
          e2e = pkgs.writeShellApplication {
            name = "dsh-keybindings-e2e";
            runtimeInputs = [ nodejs pkgs.tmux pkgs.coreutils pkgs.gnugrep ];
            text = ''
              # Real-client suites (dsh-TUI in a private tmux socket, dsh web in
              # Playwright) against the pinned dsh and the patched dsh-TUI.
              # Args: test files/dirs (default test/e2e/). Env passed through:
              # FC_SEED, NUM_RUNS, FC_PATH, KEYS_EVIDENCE_DIR (default ./test-results).
              evidence=''${KEYS_EVIDENCE_DIR:-$PWD/test-results}
              mkdir -p "$evidence"
              root=$(mktemp -d -t dsh-keybindings-e2e.XXXXXX)
              trap 'rm -rf "$root"' EXIT
              cp -r ${self}/. "$root/src"
              chmod -R u+w "$root/src"
              ln -s ${nodeModules}/node_modules "$root/src/node_modules"
              mkdir -p "$root/home"
              ${exports}
              cd "$root/src"
              if [ $# -eq 0 ]; then set -- test/e2e/; fi
              status=0
              env -i PATH="$PATH" HOME="$root/home" TMPDIR="$root" TERM=xterm-256color LANG=C.UTF-8 \
                DSH_BIN="$DSH_BIN" DSH_TUI_DIR="$DSH_TUI_DIR" DSH_TUI_BASE_DIR="$DSH_TUI_BASE_DIR" \
                ${lib.optionalString (browsers != null) ''PLAYWRIGHT_BROWSERS_PATH="$PLAYWRIGHT_BROWSERS_PATH" PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=true \''}
                KEYS_EVIDENCE_DIR="$evidence" FC_SEED="''${FC_SEED:-}" FC_PATH="''${FC_PATH:-}" NUM_RUNS="''${NUM_RUNS:-}" \
                node --test --test-concurrency=1 --test-reporter=spec "$@" || status=$?
              exit "$status"
            '';
          };
        in { inherit dsh base patched standalone nodeModules e2e e2eEnv nodejs browsers; };
    in
    {
      packages = forAll (system: pkgs:
        let b = build system pkgs; in {
          default = b.patched;
          dsh-keybindings = b.patched;
          standalone = b.standalone;
          dsh-tui-base = b.base;
          dsh = b.dsh;
          e2e = b.e2e;
        });

      apps = forAll (system: pkgs:
        let b = build system pkgs; in {
          e2e = { type = "app"; program = "${b.e2e}/bin/dsh-keybindings-e2e"; meta.description = "Real-client dsh-TUI/dsh web suites"; };
        });

      checks = forAll (system: pkgs:
        let b = build system pkgs; in {
          # Each package build runs the patch's unit suite as its install check.
          patched = b.patched;
          standalone = b.standalone;
          # Fast property and contract suites (fast-check, NUM_RUNS=1000) against the built package.
          fast = pkgs.runCommand "dsh-keybindings-fast-${version}" { nativeBuildInputs = [ b.nodejs ]; } ''
            cp -r ${testSrc} src && chmod -R u+w src && cd src
            ln -s ${b.nodeModules}/node_modules node_modules
            export HOME=$TMPDIR NUM_RUNS=${"$"}{NUM_RUNS:-1000}
            export DSH_TUI_TYPES=${b.patched}/${tuiDir}/lib/types DSH_TUI_BASE_TYPES=${b.base}/${tuiDir}/lib/types
            node --test test/omp-keys.test.mjs test/fast/ 2>&1 | tee $out
          '';
        });

      devShells = forAll (system: pkgs:
        let
          b = build system pkgs;
          beads = nixpkgs-tools.legacyPackages.${system}.beads;
        in {
          default = pkgs.mkShell ({
            packages = [ b.nodejs pkgs.tmux beads b.dsh b.e2e ];
            shellHook = ''
              echo "dsh-keybindings dev shell: dsh $(${b.dsh}/bin/dsh --version 2>/dev/null), dsh-TUI 0.14.0 (patched: $DSH_TUI_DIR)"
            '';
          } // b.e2eEnv);
        });
    };
}
