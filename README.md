# Local Dir

A browser app for manuals, firmware, reference files, and useful links. Your local directory is the source of truth; the app adds a quiet, functional interface inspired by Dieter Rams.

Built with React, Vite, TypeScript, Tailwind CSS, and local shadcn-style components using Radix primitives. There is no backend, account, or cloud storage service.

## Run locally

Use Node.js 22.x (22.12 or newer) or Node.js 24+.

```sh
npm install
npm run dev
```

Open the URL printed by Vite in desktop Chrome or Edge. Directory access requires the File System Access API and a secure context: localhost works; a hosted deployment needs HTTPS.

Click **Connect your directory**, choose a directory, and grant read/write permission. Local Dir scans it and creates `.localdir/index.json`. On a later visit, use **Reconnect** to reopen the remembered directory; the browser may ask for permission again.

The initial library is an illustrative demo. Its product entries, PDF illustrations, and firmware records are examples, not actual manuals or installable firmware. Demo metadata edits last only for the current session. Adding files, folders, and links requires a real directory.

## What the POC does

- Discovers files and empty folders recursively, with arbitrary nesting and your existing folder structure.
- Imports one or more files with optional title, manufacturer, model, tags, notes, and type. Nested destination folders are created as needed. Existing names receive a suffix, such as `manual (2).pdf`.
- Infers file types, display names, and versions from filenames. Files added through your file manager appear on the next scan.
- Saves editable metadata, favorites, and HTTP(S) links in local JSON. Search includes filenames, paths, versions, manufacturers, models, notes, and tags.
- Previews PDFs through the browser viewer, common images, Markdown, and highlighted code/text. Text previews are limited to the first 1 MiB. Unsupported files and binary firmware can be downloaded for another app. Markdown images are disabled; relative document links are not resolved.
- Rescans manually, every 30 seconds while the app is visible, and when the window receives focus. There is no background watcher when the app is closed.

Names such as `device_manual_v1.2.pdf`, `device_manual_v1.10.pdf`, `device_version_2_4_1.bin`, and `device_2.4.1.bin` are recognized. Matching versions in the same directory and format are grouped, with numeric ordering and prerelease support such as `v2.1-rc2`. Filename inference is a heuristic; it does not inspect firmware contents or verify compatibility.

Versions are separate files already present in the directory. Replacing a file's contents does not create a backup or historical snapshot.

## Storage and Dropbox

```text
Your directory/
├── Audio/
│   └── device_manual_v1.2.pdf
└── .localdir/
    └── index.json
```

The index has schema version `1`. File records use paths relative to the selected directory. `metadata` contains your edits; `cached` contains derived file facts and is refreshed by scans. Links are records keyed by generated UUIDs.

```json
{
  "schemaVersion": 1,
  "files": {
    "Audio/device_manual_v1.2.pdf": {
      "metadata": {
        "title": "Device manual",
        "manufacturer": "Example manufacturer",
        "model": "Device",
        "description": "English reference manual",
        "tags": ["audio", "reference"],
        "favorite": true,
        "kind": "manual"
      },
      "cached": {
        "name": "device_manual_v1.2.pdf",
        "kind": "manual",
        "extension": "pdf",
        "size": 123456,
        "modified": 1791244800000,
        "version": "1.2"
      }
    }
  },
  "links": {
    "747f68f4-1c43-4949-99eb-fceaa9a773bf": {
      "title": "Manufacturer support",
      "url": "https://example.com/support",
      "folder": "Audio",
      "kind": "link",
      "tags": ["support"],
      "createdAt": 1791244800000,
      "modifiedAt": 1791244800000
    }
  }
}
```

This example shows selected cache fields; the app also writes internal grouping information. Timestamps are milliseconds since the Unix epoch. Metadata fields are optional; a file record must contain a `metadata` object. Link records require a title, URL, folder (`""` for the root), and creation/modification timestamps.

The app preserves unknown JSON fields and retained records for missing files. Unchanged scans avoid rewriting the index. Invalid or unsupported indexes stop the operation with an error instead of replacing your metadata. The browser's IndexedDB stores only the directory handle; it is not the metadata database. Clearing browser storage does not remove library files or metadata.

For Dropbox, select a directory already synced by the Dropbox desktop app and make its files available locally. Dropbox syncs the files and JSON; Local Dir only reads and writes the local copy and has no Dropbox API integration.

Use one writer at a time. App operations are serialized within a page and, where supported, across tabs on the same origin using Web Locks. Index writes also check for external changes. These checks do not provide an atomic lock against desktop editors, other browser origins, or Dropbox devices. Avoid concurrent edits and allow Dropbox to finish syncing before switching devices.

Metadata identity is path-based. Renaming or moving a file externally creates a newly inferred entry; its old metadata remains under the old path and is not automatically transferred. The POC has no content identity matching, conflict merge interface, or automatic cleanup of stale metadata.

## Code map

| File | Responsibility |
| --- | --- |
| `src/App.tsx` | Library navigation, search, filters, version groups, details, and downloads |
| `src/hooks/useLibrary.ts` | Directory connection, permissions, mutations, state, and rescan scheduling |
| `src/lib/filesystem.ts` | File System Access operations, index validation/persistence, imports, and links |
| `src/lib/versioning.ts` | Filename/type inference and version comparison |
| `src/lib/types.ts` | Shared library and metadata types |
| `src/lib/demo.ts` | Illustrative sample library |
| `src/components/LibraryDialogs.tsx` | Import, link, folder, metadata, and About dialogs |
| `src/components/FilePreview.tsx` | Local file previews and sample illustrations |
| `src/components/ui/` | Button and dialog primitives using the shadcn component pattern |

## Verification

```sh
npm run build       # TypeScript checks and production assets in dist/
npm test            # Filesystem and filename/version unit tests
npm run test:e2e    # Playwright browser flows
```

The browser tests automatically use Google Chrome when it is installed in the standard macOS location. Otherwise, install Playwright's Chromium browser once with `npx playwright install chromium` before running them.

The unit tests exercise recursive discovery, metadata preservation and validation, collision handling, links, and version inference. Browser tests exercise the app against an isolated, browser-managed origin filesystem. They do not automate the operating system's directory picker or prove Dropbox synchronization.

Before using a working library, check the native directory flow with a small test directory:

1. Connect it through the real picker and confirm `.localdir/index.json` appears.
2. Add two versioned files and a nested folder through your file manager, then rescan.
3. Import a file with metadata, repeat the import, and confirm the original remains intact and the new copy has a suffix.
4. Save a link, edit tags/favorites, reload, and reconnect; confirm the JSON-backed details return.
5. Open a real PDF, Markdown file, and code file; download a binary file.
6. For Dropbox, close the app, let syncing finish, then reconnect on the other device and inspect the same library.
