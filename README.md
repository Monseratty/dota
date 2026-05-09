# Dota Replay Dashboard

Local Dota 2 `.dem` parser and dashboard. The MVP watches a local folder, parses new replays with vendored `skadistats/clarity`, stores parsed data in SQLite/JSON, and renders a Dota2ProTracker-style web UI.

## Requirements

- Node.js 22+
- npm
- JDK 17
- Windows PowerShell, macOS Terminal, or a similar shell

On Windows, install JDK 17 and make sure `JAVA_HOME` points to it. Example:

```powershell
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17"
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
```

## First Run

```bash
npm install
cp config.example.json config.json
npm run typecheck
```

On Windows PowerShell, copy the config like this:

```powershell
Copy-Item config.example.json config.json
```

Then run the three processes in three terminals:

```bash
npm run dev:api
```

```bash
npm run dev:worker
```

```bash
npm --workspace apps/web run dev -- --host 0.0.0.0
```

Open:

```text
http://localhost:5173
```

Or use the single-command dev runner:

```bash
npm run dev:local
```

For LAN access from another computer:

```bash
npm run dev:lan
```

Before debugging a new machine, run:

```bash
npm run doctor
```

## Change Local Paths

Edit `config.json`.

Default local storage:

```json
{
  "inboxPath": "./storage/inbox",
  "rawDemoPath": "./storage/demos/raw",
  "parsedPath": "./storage/parsed",
  "failedPath": "./storage/failed",
  "databasePath": "./data/app.db"
}
```

Windows absolute path example:

```json
{
  "storagePath": "D:/DotaReplayStorage",
  "inboxPath": "D:/DotaReplayStorage/inbox",
  "rawDemoPath": "D:/DotaReplayStorage/demos/raw",
  "parsedPath": "D:/DotaReplayStorage/parsed",
  "failedPath": "D:/DotaReplayStorage/failed",
  "parserLogPath": "D:/DotaReplayStorage/logs/parser",
  "databasePath": "D:/DotaReplayStorage/data/app.db",
  "scanIntervalSeconds": 10,
  "fileStableCheckSeconds": 5,
  "parserConcurrency": 1,
  "keepRawDemos": true,
  "autoDeleteRawAfterDays": null,
  "apiPort": 4300,
  "webPort": 5173
}
```

Put `.dem` files into the configured `inboxPath`, then click `Rescan folder` in the UI or wait for the scanner.

## Local Network Access

If you want to open the site from another computer on the same network, run the web app with an API base that points to the host machine.

PowerShell example if you run the web process manually:

```powershell
$env:VITE_API_BASE = "http://192.168.0.12:4300"
npm --workspace apps/web run dev -- --host 0.0.0.0
```

The easier option is:

```powershell
npm run dev:lan
```

Then open:

```text
http://192.168.0.12:5173
```

Replace `192.168.0.12` with the IP address of the machine running the API.

## Useful URLs

- Matches: `http://localhost:5173/matches`
- Parser jobs: `http://localhost:5173/jobs`
- API health: `http://localhost:4300/api/health`

## Project Structure

```text
apps/api       Fastify API, SQLite schema, watch-folder scanner
apps/worker    parser worker, clarity runner, dashboard builder
apps/web       React/Vite frontend
data           local SQLite DB and pro player cache
storage        local replay/parsed/log folders
vendor/clarity vendored clarity parser with custom dump tools
```

## Notes

- Raw `.dem` files, parsed JSON, logs, and SQLite database files are ignored by git.
- `vendor/clarity` is included so the project can run after a normal `git clone` without git submodules.
- Full combat log is parsed for internal extraction but is not shown in the MVP UI.
