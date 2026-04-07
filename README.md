# pi-session-history-viewer

A Pi extension for browsing saved session history in a fast, browser-based viewer.

## Command

This extension installs one command:

- `/session-history-html` — open a friendly HTML viewer for the current or selected saved session

## Features

- searchable session picker
- open the current session, a session from the current workspace, or any saved session
- clear viewing modes:
  - **All entries** — the full saved conversation, including side branches
  - **Current branch** — only the active/latest path through the conversation tree
- jump-list navigation for large sessions
- user-friendly transcript presentation with optional advanced technical details
- standalone HTML snapshot export for the current filtered view
- lightweight session discovery to keep picker startup responsive

## Install locally

From a local checkout:

```bash
pi install /path/to/pi-session-history-viewer
```

For one-off testing without installing permanently:

```bash
pi -e /path/to/pi-session-history-viewer
```

## Install from git

```bash
pi install git:github.com/jianbinwei0-blip/pi-session-history-viewer
```

## Usage

```text
/reload
/session-history-html
```

Useful variants:

```text
/session-history-html current
/session-history-html cwd
/session-history-html pick
/session-history-html /absolute/path/to/session.jsonl
```

## Notes

- The viewer reads your existing saved Pi session files locally.
- The generated HTML viewer is intended for browsing and sharing snapshots, not editing session data.

## Development

- extension source: `extensions/session-history-viewer.js`
- tests: `test/session-history-viewer.test.js`

Run tests with:

```bash
npm test
```
