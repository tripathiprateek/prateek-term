cask "prateek-term@rc" do
  version "1.5.0-rc.1"
  sha256 :no_check # replaced by CI on each release

  url "https://github.com/tripathiprateek/prateek-term/releases/download/v#{version}/Prateek-Term-#{version}-arm64.zip",
      verified: "github.com/tripathiprateek/prateek-term/"
  name "Prateek-Term (Release Candidate)"
  desc "Terminal emulator and SSH/serial connection manager"
  homepage "https://github.com/tripathiprateek/prateek-term"

  livecheck do
    url :url
    strategy :github_releases
    regex(/^v?(\d+(?:\.\d+)+-rc\.\d+)$/i)
  end

  # The build is arm64-only. Failing loudly here beats installing an app that
  # cannot launch on Intel.
  depends_on arch: :arm64
  depends_on macos: ">= :big_sur"

  # Both casks install the same Prateek-Term.app, so they genuinely collide.
  conflicts_with cask: "prateek-term"

  app "Prateek-Term.app"

  # The app is ad-hoc signed, not notarized, so Homebrew's default quarantine
  # produces a Gatekeeper block. Users must pass --no-quarantine.
  caveats do
    <<~EOS
      Prateek-Term is ad-hoc signed (not notarized). If macOS refuses to open it,
      reinstall with:
        brew reinstall --cask --no-quarantine prateek-term@rc
    EOS
  end

  zap trash: [
    "~/Library/Application Support/Prateek-Term",
    "~/Library/Caches/com.prateek.prateekterm",
    "~/Library/Preferences/com.prateek.prateekterm.plist",
    "~/Library/Saved Application State/com.prateek.prateekterm.savedState",
  ]
end
