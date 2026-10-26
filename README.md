# Hermes Dynamic Sidebar

Codes inspired standalone dynamic sidebar plugin for Hermes Desktop.
The Inbox uses the active Hermes theme's colors and remains available when you switch themes.

This plugin is heavily inspired by [hermes-codex-skin](https://github.com/FPSUnleashed/hermes-codex-skin).

> [!IMPORTANT]
> This project is an independent community plugin. It is not affiliated with or endorsed by Nous Research or OpenAI.

## Current release

**0.1.0** is the version declared by the current source and plugin manifest.
No tagged GitHub release is published yet.
The installation commands below use the bundled files from a downloaded repository checkout, not an unpublished release URL.

See the [repository](https://github.com/pyxlr/hermes-dynamic-sidebar) for published source and the [releases page](https://github.com/pyxlr/hermes-dynamic-sidebar/releases) for tagged releases when available.
Repository-based installation becomes available once the source has been published.

## Features

- Inbox with working sessions and subagent activity.
- Settle removes a session only from the Inbox and briefly offers Undo.
- Snooze hides a session for 15 minutes, 30 minutes, one hour, three hours, or one day.
- Pinned and Sessions retain their native elements, actions, and scroll containers.
- Floating sidebar aligns both groups at the bottom when both are collapsed.
As soon as either group is expanded, they align at the top directly below the Inbox.
- When Inbox, Pinned, and Sessions are all expanded, the gap is two native spacing units.

The plugin does not stop work or delete sessions.
It reads session metadata and activity through the existing Desktop bridge and uses the host's QueryClient.

## Installation

Requires Hermes Desktop with the [Desktop Plugin SDK](https://hermes-agent.nousresearch.com/docs/developer-guide/desktop-plugin-sdk) and a writable local plugin directory.
Install on the computer running Desktop, not only on a WSL or remote backend.
Node.js, npm, and a separate backend service are not required to run the bundled plugin.

### Installation in Hermes Desktop

On Desktop builds that offer **Capabilities → Plugins → Install plugin**, paste this exact repository subdirectory once the source is published:

```text
pyxlr/hermes-dynamic-sidebar/hermes-dynamic-sidebar
```

Keep the final `/hermes-dynamic-sidebar` component.
Do not paste a GitHub `/blob/.../plugin.js` HTML page as the plugin file.
This installation follows the repository's default branch rather than a tagged release.
If repository installation is unavailable, use one of the manual methods below.

After installation, enable **Dynamic Sidebar** under **Capabilities → Plugins**.
The plugin is disabled by default and appears in the plugin list, not in the skin or theme picker.
If it has not appeared, run **Reload desktop plugins** from the command palette.

### Installation on macOS / Linux

Download or clone the published repository, then open a terminal in its root directory.
Use the Desktop app's local Hermes home for `HERMES_HOME` if it differs from the default.
The folder name must remain `hermes-dynamic-sidebar`.

```sh
set -eu
PLUGIN_DIR="${HERMES_HOME:-$HOME/.hermes}/desktop-plugins/hermes-dynamic-sidebar"
test -f hermes-dynamic-sidebar/plugin.js
test -f hermes-dynamic-sidebar/plugin.yaml
mkdir -p "$PLUGIN_DIR"
cp hermes-dynamic-sidebar/plugin.yaml "$PLUGIN_DIR/plugin.yaml"
cp hermes-dynamic-sidebar/plugin.js "$PLUGIN_DIR/plugin.js"
cmp hermes-dynamic-sidebar/plugin.js "$PLUGIN_DIR/plugin.js"
```

Run **Reload desktop plugins**, then enable **Dynamic Sidebar** under **Capabilities → Plugins**.

### Installation on Windows PowerShell

Download or clone the published repository, then open PowerShell in its root directory.
The default Windows installation uses `%LOCALAPPDATA%\hermes`.
If Desktop uses a custom Hermes home, set `HERMES_HOME` to that local directory before running these commands.

```powershell
$ErrorActionPreference = "Stop"
$hermesHome = if ($env:HERMES_HOME) {
    $env:HERMES_HOME
} else {
    Join-Path $env:LOCALAPPDATA "hermes"
}
$pluginDir = Join-Path $hermesHome "desktop-plugins\hermes-dynamic-sidebar"
$sourceDir = Join-Path (Get-Location).Path "hermes-dynamic-sidebar"
if (-not (Test-Path -LiteralPath (Join-Path $sourceDir "plugin.js") -PathType Leaf) -or
    -not (Test-Path -LiteralPath (Join-Path $sourceDir "plugin.yaml") -PathType Leaf)) {
    throw "Run these commands from the downloaded repository root."
}
New-Item -ItemType Directory -Force -Path $pluginDir | Out-Null
Copy-Item -LiteralPath (Join-Path $sourceDir "plugin.yaml") -Destination (Join-Path $pluginDir "plugin.yaml") -Force
Copy-Item -LiteralPath (Join-Path $sourceDir "plugin.js") -Destination (Join-Path $pluginDir "plugin.js") -Force
if ((Get-FileHash -LiteralPath (Join-Path $sourceDir "plugin.js") -Algorithm SHA256).Hash -ne
    (Get-FileHash -LiteralPath (Join-Path $pluginDir "plugin.js") -Algorithm SHA256).Hash) {
    throw "Installed plugin does not match the source file."
}
```

Run **Reload desktop plugins**, then enable **Dynamic Sidebar** under **Capabilities → Plugins**.
For older or custom installations, verify the actual local plugin directory rather than assuming the default path.

### Verify a downloaded package

Compare the bundled file against `CHECKSUMS.sha256` from the same checkout or release.
On Linux, run `sha256sum -c CHECKSUMS.sha256` from the repository root.
On macOS, run `shasum -a 256 -c CHECKSUMS.sha256`.
A checksum from a moving branch is not independent proof of a release's authenticity.
The copy checks in the installation commands verify that the installed file matches your downloaded file.

## Settings

The command palette provides two toggles that take effect immediately:

| Command | Default after activation | Effect |
|---|---|---|
| `Dynamic Sidebar: Inbox` | On | Shows the Inbox or removes it together with its layout rules. |
| `Dynamic Sidebar: Floating sidebar` | On | Enables dynamic alignment. Off uses the original Inbox layout with a growing Inbox and bottom-aligned groups. |

Hermes stores settings and Inbox state under this plugin's own ID.
Settings from other plugins are neither imported nor changed.
Switching color themes does not affect these settings.

Before each Inbox change, the plugin rereads the stored state.
Read errors or invalid stored JSON block changes until the state becomes readable again.
If the plugin detects a change between reading and writing, it rejects the update rather than overwriting another window's state.
The storage API provides no atomic compare-and-swap operation, so fully simultaneous writes from multiple windows are not guaranteed to be transaction-safe.

## Inbox philosophy and design

Treat each thread as a task that needs attention, rather than treating the Inbox as another history list.
A useful goal is an empty Inbox when you have finished reviewing your work.
Keep Pinned and Sessions collapsed to focus on current tasks, and expand them whenever you need older or pinned conversations.

### What enters the Inbox

Verified non-cron work can add a thread, including an older conversation that becomes active again.
Creating an empty chat, opening a conversation, reading history, or seeing an unread mark does not add it by itself.
Admitted threads remain after their work completes until you settle or snooze them.

Admission and attention state are scoped to each connection and profile.
Unknown provenance, conflicting owners, and disconnected or failed activity reads cannot authorize new admissions.
Cron sessions are excluded.
Cron-triggered work delivered into a regular chat may still appear as that chat's activity if Hermes does not expose its origin.

### Settle, Snooze, and attention

Click the checkmark to settle a task.
This removes it only from the Inbox; it does not stop work, archive, delete, or unpin the session.
The latest successful settlement offers **Undo** for three seconds.
New verified work can bring a manually settled thread back, but passive polling or reading does not reverse the decision.

Use the clock button to snooze a thread for 15 minutes, 30 minutes, one hour, three hours, or one day.
The deadline survives reloads, and ongoing work does not shorten it.
Expiry restores an otherwise unsettled admitted thread without navigating away from the current conversation.
Verified native rows can offer **Un-settle** and **Wake now**; these badges remain hidden when the row's owner cannot be established safely.

Settling or snoozing the current thread opens the next Inbox thread, or a new chat if none remains in the loaded list.
Acting on a different thread does not navigate.
Turning the Inbox off hides its UI without erasing saved decisions.

### Layout and activity indicators

The Inbox sits above the native Pinned and Sessions groups and inherits the active theme's colors.
With Floating sidebar On, both collapsed native groups stay at the bottom.
Expanding either group moves them directly below the Inbox, independently of the Inbox's own disclosure state.
When all three groups are expanded, the gap below Inbox doubles to two native spacing units.
Long lists retain their scroll containers, including native virtualized Sessions lists.

A working thread shows an activity dot and a row contour.
Successful completion shows a green indicator; unknown, idle, or reading states do not imply completion.
Active subagents keep the task marked as working after the parent hands off.
Viewing the latest completed reply clears its completion indicator without settling the thread.
Reduced-motion settings retain a static working contour.

## Update

Dynamic Sidebar has no built-in release checker or automatic updater.
Update by downloading the desired published source or release and repeating the manual installation into the same plugin directory.
If your Desktop build provides an update action for repository-installed plugins, use that host-provided action.
Do not create a second plugin folder with a different name.

For a reversible manual update, disable the plugin and copy its current directory to a backup outside `desktop-plugins/` before replacing the files.
Run **Reload desktop plugins** after the update and re-enable the plugin if needed.
Keeping the same plugin ID preserves its stored settings and Inbox state.
Updating only a remote Hermes Agent does not update the local Desktop plugin.

## Uninstall

Disable **Dynamic Sidebar** under **Capabilities → Plugins** to remove the Inbox and restore the native sidebar layout immediately.
The selected color theme remains unchanged.

To remove the installed files, use the plugin's **Uninstall** action on Desktop builds that provide it.
For a manual installation, disable the plugin first, then remove only its `hermes-dynamic-sidebar/` directory from the local `desktop-plugins/` folder.
Run **Reload desktop plugins** afterward if the entry remains visible.
Do not delete the whole plugin directory root or the Hermes home.

Removing the plugin files does not explicitly clear its local settings, settlement records, or snooze deadlines.
Sessions and conversation history remain owned by Hermes and are not deleted by the plugin.

## Compatibility

You can use Dynamic Sidebar with a different color theme.
If you also use Codex Skin, turn off its Inbox using `Codex Skin: Inbox`.
Disable any other plugin that overrides the same sidebar layout to avoid conflicting rules.

If the original Codex Inbox is still visible, Dynamic Sidebar pauses its own Inbox and displays a notice.
It does not remove or disable the other plugin.
Once the original Inbox is turned off, Dynamic Sidebar resumes rendering its own Inbox.

Disabling Dynamic Sidebar removes its DOM elements, styles, timers, event subscriptions, and layout attributes.
Native sidebar nodes and the selected theme remain unchanged.

## Development and testing

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm test
sha256sum -c CHECKSUMS.sha256
```

Browser tests require Chromium or Chrome.
If no supported system path exists, set `CHROME_BIN` to the installed browser executable.
Some additional native integration probes also require `CODEX_INBOX_QUERY_CORE_ROOT` pointing to a compatible Hermes source checkout with its test dependencies.
For Codex coexistence probes, set `CODEX_SIDEBAR_COMPAT_CSS` to a file containing the Codex plugin's actual `CSS` export.
These optional probes test both stylesheet load orders with the Codex Inbox disabled.
The regular runtime and layout tests do not require a running Hermes Desktop.

`src/plugin.js` contains the standalone SDK entry point and command palette toggles.
The other `src/inbox-*.js` modules handle data access, admission, status, the DOM adapter, and row rendering.

`scripts/build.mjs` bundles the sources into a single ESM file and generates `CHECKSUMS.sha256`.
Do not edit generated files by hand.

The automated browser tests execute the bundled plugin with SDK contract fixtures and native sidebar fixtures.
They do not verify installation or activation in a running Hermes app.

## License

MIT license, see [LICENSE](LICENSE).
The build also embeds the complete license text in the installable `plugin.js`.
The embedded TanStack QueryObserver includes its own MIT license notice.
