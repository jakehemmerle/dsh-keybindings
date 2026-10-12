# dsh-TUI 0.14.0 built the way jakehemmerle/nix-config pkgs/dsh-tui.nix builds it
# (same tarball hash, same lockfile, same npmDepsHash), with a caller-chosen
# patch list. Copied from nix-config 6a7e613; package-lock.json and
# launchpad-word-edit.patch are byte copies of nix-config's.
{ lib, buildNpmPackage, fetchurl, jq, runCommand, nodejs, patches ? [ ], pname ? "dsh-tui", version ? "0.14.0", installCheck ? "" }:
let
  tuiVersion = "0.14.0";
  tarball = fetchurl {
    url = "https://registry.npmjs.org/@deepseek-harness-tui/dsh-tui/-/dsh-tui-${tuiVersion}.tgz";
    hash = "sha512-syU0CLbAoxA97URyhnPFiLbWm3dXrmCR5NCO6mFovRi7mebX2HeEYdhpugEoT9vZ1vpUfE/+uX7xrs6zOGUJ1g==";
  };
  unlistedPeers = [
    "@deepseek-ai/cordis-plugin-include"
    "@deepseek-ai/dsh-agent-preset"
    "@deepseek-ai/dsh-attachment-local"
    "@deepseek-ai/dsh-mcp-client"
    "@deepseek-ai/dsh-session-persistence"
    "@deepseek-ai/dsh-session-persistence-jsonl"
  ];
  src = runCommand "dsh-tui-source-${tuiVersion}" { nativeBuildInputs = [ jq ]; } ''
    mkdir -p $out
    tar -xzf ${tarball} -C $out --strip-components=1
    jq --argjson names '${builtins.toJSON unlistedPeers}' '
      .peerDependencies += ($names | map({ key: ., value: "*" }) | from_entries)
      | .peerDependenciesMeta += ($names | map({ key: ., value: { optional: true } }) | from_entries)' \
      $out/package.json > $out/package.json.runtime
    jq 'del(.devDependencies, .scripts, .bundledDependencies, .peerDependencies, .peerDependenciesMeta)
      | .optionalDependencies |= with_entries(select(.key | startswith("@dsh-") | not))' \
      $out/package.json.runtime > $out/package.json
    mv $out/node_modules $out/bundled
    cp ${./dsh-tui-package-lock.json} $out/package-lock.json
  '';
in
buildNpmPackage {
  inherit pname version src patches;

  npmDepsFetcherVersion = 2;
  npmDepsHash = "sha256-EMVmgJJ3sc0iqN+vmW/t6vWtrQWANc50biq6h15XfpA=";
  npmFlags = [ "--legacy-peer-deps" "--ignore-scripts" ];
  dontNpmBuild = true;

  postInstall = ''
    pkg=$out/lib/node_modules/@deepseek-harness-tui/dsh-tui
    cp -r bundled/. $pkg/node_modules/
    cp package.json.runtime $pkg/package.json
    rm -r $out/bin
  '';

  doInstallCheck = installCheck != "";
  nativeInstallCheckInputs = [ nodejs ];
  installCheckPhase = ''
    runHook preInstallCheck
    export HOME=$TMPDIR DSH_TUI_TYPES=$out/lib/node_modules/@deepseek-harness-tui/dsh-tui/lib/types
    ${installCheck}
    runHook postInstallCheck
  '';

  passthru.tuiDir = "lib/node_modules/@deepseek-harness-tui/dsh-tui";

  meta = {
    description = "dsh-TUI ${tuiVersion} (terminal UI for DeepSeek Harness)";
    homepage = "https://github.com/ccch1mneyyy/dsh-TUI";
    license = lib.licenses.mit;
  };
}
