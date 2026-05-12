# Полное ТЗ и описание проекта: Dota Replay Dashboard

Актуально на: 12.05.2026

## 1. Краткое описание

`Dota Replay Dashboard` - локальный веб-сервис для разбора Dota 2 replay-файлов `.dem`.

Проект работает без облака: пользователь кладет демки в локальную папку, backend сам находит новые файлы, переносит их в хранилище, создает задачи на парсинг, worker разбирает replay через `skadistats/clarity`, сохраняет parsed JSON и показывает результат на многостраничном сайте в стиле Dota2ProTracker.

Основной сценарий:

```text
storage/inbox/*.dem
  -> API scanner
  -> storage/demos/raw
  -> SQLite parse_jobs
  -> worker
  -> Java clarity tools
  -> storage/parsed/{match_db_id}/dashboard.json
  -> React frontend
```

## 2. Что уже сделано

### 2.1. Монорепозиторий

Проект оформлен как npm workspace:

```text
apps/api       Fastify API, SQLite, scanner, raw replay lifecycle
apps/worker    parser worker, запуск clarity, сборка dashboard.json
apps/web       React/Vite frontend
packages/shared общие типы
vendor/clarity vendored skadistats/clarity + кастомные Java dump tools
storage        локальные папки для inbox/raw/parsed/failed/logs
data           SQLite DB и pro player cache
scripts        dev runner и doctor
```

### 2.2. Локальное хранение

Реализована файловая схема:

```text
storage/
  inbox/
    новые .dem файлы

  demos/
    raw/
      принятые raw replay файлы

  parsed/
    {match_db_id}/
      summary.json
      scoreboard.json
      final_inventory.json
      skill_build.jsonl
      combat_log.jsonl
      dashboard.json

  failed/
    reserved for failed demos

  logs/
    parser/
      job-{id}.log
```

Файлы raw replay можно скачать через UI, удалить отдельно от parsed data или удалить весь матч.

### 2.3. Config

Есть `config.example.json` и локальный `config.json`.

Основные настройки:

```json
{
  "storagePath": "./storage",
  "inboxPath": "./storage/inbox",
  "rawDemoPath": "./storage/demos/raw",
  "parsedPath": "./storage/parsed",
  "failedPath": "./storage/failed",
  "parserLogPath": "./storage/logs/parser",
  "databasePath": "./data/app.db",
  "scanIntervalSeconds": 10,
  "fileStableCheckSeconds": 5,
  "parserConcurrency": 1,
  "keepRawDemos": true,
  "autoDeleteRawAfterDays": null,
  "apiPort": 4300,
  "webPort": 5173
}
```

На Windows пользователь должен поменять пути в `config.json` на свои абсолютные папки, например `D:/DotaReplayStorage/inbox`.

### 2.4. Backend API

Backend сделан на Node.js + Fastify.

Реализованы endpoints:

```text
GET    /api/health
GET    /api/system/storage
POST   /api/system/rescan

GET    /api/matches
GET    /api/matches/:id
GET    /api/matches/:id/jobs
GET    /api/matches/:id/dashboard
GET    /api/matches/:id/download
POST   /api/matches/:id/reparse
DELETE /api/matches/:id/raw
DELETE /api/matches/:id

GET    /api/jobs
GET    /api/jobs/:id/log
POST   /api/jobs/:id/retry
```

Важные правила безопасности:

- raw replay download берется только из записи матча;
- backend проверяет, что путь находится внутри `rawDemoPath`;
- удаление raw replay также проверяет, что файл лежит внутри разрешенной папки;
- parser log читается только по `job id` из папки `parserLogPath`;
- пользователь не может передать произвольный path для скачивания или удаления.

### 2.5. Watch folder scanner

Scanner уже реализован.

Алгоритм:

1. Ищет `.dem` файлы в `inboxPath`.
2. Пропускает уже импортированные файлы по `sourceFilename`.
3. Проверяет, что файл существует и является обычным файлом.
4. Ждет `fileStableCheckSeconds`.
5. Проверяет размер еще раз.
6. Если размер не изменился и файл не пустой, переносит файл в `rawDemoPath`.
7. Создает запись в `matches`.
8. Создает запись в `parse_jobs`.
9. Возвращает статистику scan/import/skipped.

Есть ручная кнопка `Rescan folder` на frontend.

### 2.6. Database

Используется SQLite через `better-sqlite3`.

Файл базы по умолчанию:

```text
data/app.db
```

Таблицы:

```text
matches
parse_jobs
players
player_items
player_abilities
```

Фактически активнее всего сейчас используются:

- `matches` - матч, статус, score, winner, raw path, parsed state;
- `parse_jobs` - очередь задач worker;
- `players`, `player_items`, `player_abilities` - задел под более структурированное хранение.

Статусы матчей:

```text
queued
parsing
ready
failed
deleted
```

Статусы jobs:

```text
queued
running
done
failed
```

### 2.7. Parser worker

Worker сделан отдельным Node.js process.

Логика:

1. Каждые 3 секунды берет следующую queued job.
2. Переводит job в `running`.
3. Создает output directory `storage/parsed/{match_db_id}`.
4. Запускает Java clarity tools через Gradle.
5. Собирает `dashboard.json`.
6. Пишет итоговые данные в SQLite.
7. Переводит match в `ready`, job в `done`.
8. При ошибке переводит job/match в failed и пишет ошибку.

Clarity запускается из `vendor/clarity`.

Сейчас worker вызывает три Java-задачи:

```text
runFullDemoDump
runFinalInventoryDump
runSkillBuildDump
```

Логи парсинга пишутся в:

```text
storage/logs/parser/job-{id}.log
```

### 2.8. Парсимые данные

Из replay сейчас извлекаются и показываются:

- match id;
- duration;
- radiant score;
- dire score;
- winner;
- игроки;
- steam id/account id, если удалось извлечь;
- pro player matching через `data/pro_players.json`;
- display name;
- hero;
- hero image;
- team;
- kills/deaths/assists;
- last hits;
- denies;
- gold;
- level;
- team totals;
- timeline ключевых событий;
- first blood;
- kills;
- objectives, если есть в combat log;
- buybacks, если есть в combat log;
- item purchase timings;
- ability build;
- final inventory;
- backpack/tp/neutral/enhancement slots, если данные есть;
- raw replay availability.

Combat log используется внутри для построения timeline/item timings/ability observations, но отдельный combat log на сайте не показывается.

### 2.9. Pro player matching

Есть локальный файл:

```text
data/pro_players.json
```

Dashboard builder:

1. Достает Steam64.
2. Переводит Steam64 в account id.
3. Ищет account id в `data/pro_players.json`.
4. Если игрок найден, показывает professional nickname и badge `PRO`.
5. Если не найден, оставляет обычный ник из replay.

### 2.10. Frontend

Frontend сделан на React + Vite + React Router.

Страницы:

```text
/             Replay inbox / matches list
/matches      тот же список матчей
/matches/:id  match details dashboard
/jobs         parser jobs
```

UI уже содержит:

- верхнюю навигационную панель;
- главную страницу со storage paths;
- счетчики Matches/Queued/Ready/Failed;
- поиск по матчам;
- фильтр по статусам;
- список матчей;
- кнопки открыть матч, скачать replay, reparse, удалить raw, удалить матч;
- страницу parser jobs с просмотром parser log;
- retry failed job из очереди parser jobs;
- страницу match details;
- кнопки Download replay, Reparse, Remove raw, Back;
- статусный блок матча;
- latest job summary;
- timeline key events;
- две team columns: Radiant и Dire;
- карточки игроков;
- hero images;
- final inventory с картинками предметов;
- backpack/extra slots;
- item timings с картинками;
- ability build;
- адаптивную mobile-разметку.

Визуальный стиль:

- темная esports/dashboard тема;
- ориентир по смыслу - Dota2ProTracker;
- без landing page;
- основной экран сразу показывает рабочий интерфейс;
- компактные таблицы и карточки;
- золотой accent для главных actions и KDA;
- зеленый Radiant и красный Dire accent.

### 2.11. Dev runner

Есть скрипты:

```bash
npm run dev:api
npm run dev:web
npm run dev:worker
npm run dev:local
npm run dev:lan
npm run doctor
npm run typecheck
npm run build
```

`npm run dev:local` поднимает API, worker и web локально.

`npm run dev:lan` поднимает web/API так, чтобы сайт можно было открыть с другого компьютера в локальной сети.

Пример LAN URL из текущей машины:

```text
http://192.168.0.12:5173
```

На другой машине IP может быть другим.

### 2.12. Git/GitHub

Проект подключен к:

```text
https://github.com/Monseratty/dota.git
```

Последние значимые коммиты:

```text
cd917e0 Make dashboard redesign more distinct
1928f06 Polish match dashboard visuals
e379eb1 Add match timeline panel
31e0c1a Add raw replay lifecycle controls
28ec934 Add cross-platform dev runner
```

## 3. Что проект должен делать по продукту

### 3.1. Пользовательский сценарий MVP

1. Пользователь запускает проект.
2. Пользователь кладет `.dem` в `storage/inbox`.
3. Система сама находит файл или пользователь нажимает `Rescan folder`.
4. Система ждет, пока файл полностью докопируется.
5. Система переносит файл в `storage/demos/raw`.
6. В списке матчей появляется match со статусом `queued`.
7. Worker парсит match.
8. Статус меняется на `ready`.
9. Пользователь открывает матч.
10. Пользователь смотрит score, teams, players, heroes, inventory, item build, ability build, timeline.
11. Пользователь при необходимости скачивает raw replay.
12. Пользователь может удалить только raw replay, сохранив parsed dashboard.
13. Пользователь может полностью удалить match.

### 3.2. Не MVP, но будущая цель

Позже проект может стать полноценным сервисом:

- web upload;
- аккаунты пользователей;
- облачное хранение;
- очередь через Redis/BullMQ;
- multi-worker parsing;
- AI review;
- публичные match pages;
- подбор похожих билдов;
- аналитика игроков;
- monetization через подписку/рекламу/премиум features.

## 4. Техническая архитектура

### 4.1. Общая схема

```text
                 +--------------------+
                 | storage/inbox      |
                 | user drops .dem    |
                 +---------+----------+
                           |
                           v
                 +--------------------+
                 | Fastify API        |
                 | Watch scanner      |
                 +---------+----------+
                           |
                           v
       +-------------------+-------------------+
       | SQLite matches / parse_jobs           |
       +-------------------+-------------------+
                           |
                           v
                 +--------------------+
                 | Worker             |
                 | clarity runner     |
                 +---------+----------+
                           |
                           v
                 +--------------------+
                 | vendor/clarity     |
                 | Java dump tools    |
                 +---------+----------+
                           |
                           v
       +-------------------+-------------------+
       | storage/parsed/{match_id}/dashboard   |
       +-------------------+-------------------+
                           |
                           v
                 +--------------------+
                 | React frontend     |
                 +--------------------+
```

### 4.2. Backend layers

```text
routes/
  matchRoutes.ts
  systemRoutes.ts

repositories/
  matchesRepository.ts
  jobsRepository.ts

scanner/
  watchFolderScanner.ts

services/
  storageService.ts

cleanup/
  rawDemoCleanup.ts

db/
  database.ts

config/
  appConfig.ts
```

### 4.3. Worker layers

```text
worker.ts
  main polling loop

parser/runClarity.ts
  запускает Gradle tasks из vendor/clarity

parser/buildDashboard.ts
  читает raw parsed files и собирает dashboard.json

db.ts
  worker-side доступ к SQLite

config.ts
  config loader
```

### 4.4. Frontend layers

```text
main.tsx
  router + global shell

api/client.ts
  fetch client for API

pages/HomePage.tsx
  inbox, storage, matches list

pages/MatchPage.tsx
  match details dashboard

pages/JobsPage.tsx
  parser jobs page

styles/app.css
  full UI styles
```

## 5. Требования к окружению

### 5.1. Общие требования

```text
Node.js 22+
npm
JDK 17
Git
```

### 5.2. Windows

На Windows нужно установить JDK 17 и прописать `JAVA_HOME`.

Пример PowerShell:

```powershell
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17"
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
```

### 5.3. macOS

На macOS worker умеет искать Homebrew OpenJDK 17 по пути:

```text
/opt/homebrew/Cellar/openjdk@17/17.0.19/libexec/openjdk.jdk/Contents/Home
```

Если JDK установлен иначе, лучше явно задать `JAVA_HOME`.

## 6. Как запустить проект

Первый запуск:

```bash
npm install
cp config.example.json config.json
npm run typecheck
```

Windows PowerShell:

```powershell
npm install
Copy-Item config.example.json config.json
npm run typecheck
```

Запуск всего проекта одной командой:

```bash
npm run dev:local
```

Запуск для открытия в локальной сети:

```bash
npm run dev:lan
```

Открыть сайт:

```text
http://localhost:5173
```

API:

```text
http://localhost:4300/api/health
```

Проверка окружения:

```bash
npm run doctor
```

## 7. Как пользоваться

1. Запустить `npm run dev:local` или `npm run dev:lan`.
2. Открыть сайт.
3. Скопировать replay `.dem` в `storage/inbox`.
4. Подождать автоматический scanner или нажать `Rescan folder`.
5. Дождаться статуса `ready`.
6. Открыть match details.
7. Смотреть dashboard.
8. При необходимости нажать:
   - `Download replay`;
   - `Reparse`;
   - `Remove raw`;
   - `Delete match`.

## 8. Acceptance criteria текущего состояния

Текущее состояние считается рабочим, если:

- `npm install` устанавливает зависимости;
- `npm run typecheck` проходит;
- `npm run dev:local` поднимает API, worker и web;
- `GET /api/health` возвращает `ok: true`;
- файл `.dem` из `storage/inbox` импортируется;
- после импорта создается запись в `matches`;
- создается queued job;
- worker переводит job в running/done;
- после парсинга появляется `storage/parsed/{match_db_id}/dashboard.json`;
- match переходит в `ready`;
- frontend показывает match в списке;
- match details открывается;
- на странице есть teams, players, hero images, final inventory, item timings, ability build, timeline;
- raw replay можно скачать, если он существует;
- raw replay можно удалить без удаления dashboard;
- match можно reparse, если raw replay существует;
- failed parser job можно открыть, посмотреть log и retry, если raw replay существует;
- match можно удалить полностью.

## 9. Ограничения текущей версии

### 9.1. Product limitations

- Нет аккаунтов пользователей.
- Нет облачного хранения.
- Нет web upload.
- Нет публичных share pages.
- Нет полноценного AI review.
- Нет платежей.
- Нет ролей доступа.
- Нет production deployment.

### 9.2. Parser limitations

- Парсинг зависит от `skadistats/clarity` и кастомных dump tools.
- Точность ability build зависит от доступных events и skill dump.
- Item timings строятся по combat log purchase events.
- Некоторые replay могут отличаться по структуре или ломать parser.
- Нужно продолжать проверку на большем количестве демок.

### 9.3. Infra limitations

- Очередь сделана через SQLite.
- Concurrency на MVP фактически 1.
- Есть retry failed job и просмотр parser log на странице Jobs, но нет отдельного advanced log viewer.
- Нет отдельного production process manager.
- Нет Docker.
- Нет автоматических unit/integration tests.

### 9.4. Storage limitations

- 250 демок в день по 100 MB = около 25 GB raw replay в день.
- На локальном MVP это быстро съест диск.
- Сейчас есть ручное удаление raw replay и задел под auto cleanup.
- Для production позже нужно объектное хранилище или отдельный storage server.

## 10. Что делать дальше

### Этап 1. Укрепить текущий MVP

- Прогнать 10-30 разных демок.
- Проверить, где parser падает.
- Улучшить handling failed jobs.
- Улучшить UX retry failed job.
- Добавить progress/state для long parsing.
- Добавить readable parser error на UI.
- Улучшить raw parser logs viewer.

### Этап 2. Улучшить данные

- Расширить таблицы `players`, `player_items`, `player_abilities`.
- Сохранять больше dashboard data в SQLite, а не только JSON.
- Добавить net worth, GPM, XPM, hero damage, tower damage, healing, если стабильно достается.
- Улучшить final inventory slot mapping.
- Улучшить neutral/enhancement slot rendering.
- Добавить team objectives.
- Добавить duration и game mode на UI.

### Этап 3. Улучшить frontend

- Сделать отдельные tabs на match page:
  - Overview;
  - Builds;
  - Timeline;
  - Economy;
  - Files.
- Добавить skeleton/loading states.
- Добавить более плотный Dota2ProTracker-like build layout.
- Добавить сравнение игроков.
- Добавить фильтр по hero/player/pro.
- Добавить sortable columns.

### Этап 4. Tests and quality

- Добавить unit tests для:
  - storage path safety;
  - scanner stable file check;
  - dashboard builder;
  - Steam64 -> account id;
  - pro player matching.
- Добавить integration test для API.
- Добавить fixture parsed output.
- Добавить CI на GitHub Actions.

### Этап 5. AI Review

AI Review должен быть отдельным модулем, который не блокирует parsing.

Пример логики:

1. Parser готовит structured match summary.
2. AI module получает компактный JSON:
   - hero;
   - role;
   - lane;
   - KDA;
   - item timings;
   - ability build;
   - deaths timeline;
   - team score;
   - game duration.
3. AI генерирует review:
   - что игрок сделал хорошо;
   - какие timings просели;
   - какие смерти были критичными;
   - что можно было купить иначе;
   - short action list на следующий матч.
4. Review сохраняется в SQLite/JSON.
5. UI показывает review на отдельной вкладке.

Важно: AI не должен получать raw `.dem`, только compact structured JSON.

### Этап 6. Production version

Когда локальный MVP станет стабильным:

- добавить web upload;
- добавить cloud/object storage;
- добавить background queue;
- добавить auth;
- добавить user projects;
- добавить billing/premium;
- добавить deploy pipeline.

## 11. Code ownership notes для AI-агентов

Если проект продолжает Codex/Claude:

- Не переписывать `vendor/clarity` без отдельной причины.
- Не менять storage paths без обновления `config.example.json`, README и этого ТЗ.
- Не показывать raw combat log на UI без запроса пользователя.
- Не удалять raw replay автоматически без явной настройки.
- Не добавлять облачные сервисы в MVP без отдельного решения.
- Не хранить секреты и tokens в репозитории.
- После изменений запускать `npm run typecheck`.
- После frontend changes проверять desktop и mobile.
- Для больших parser changes проверять на реальной `.dem`.

## 12. Главные файлы проекта

```text
README.md
DOTA_DEMO_PARSER_TZ.md
PROJECT_FULL_TZ.md
config.example.json
package.json

apps/api/src/server.ts
apps/api/src/config/appConfig.ts
apps/api/src/db/database.ts
apps/api/src/scanner/watchFolderScanner.ts
apps/api/src/services/storageService.ts
apps/api/src/routes/matchRoutes.ts
apps/api/src/routes/systemRoutes.ts
apps/api/src/repositories/matchesRepository.ts
apps/api/src/repositories/jobsRepository.ts
apps/api/src/cleanup/rawDemoCleanup.ts

apps/worker/src/worker.ts
apps/worker/src/parser/runClarity.ts
apps/worker/src/parser/buildDashboard.ts
apps/worker/src/db.ts
apps/worker/src/config.ts

apps/web/src/main.tsx
apps/web/src/api/client.ts
apps/web/src/pages/HomePage.tsx
apps/web/src/pages/MatchPage.tsx
apps/web/src/pages/JobsPage.tsx
apps/web/src/styles/app.css

vendor/clarity/src/main/java/skadistats/clarity/tools/FullDemoDump.java
vendor/clarity/src/main/java/skadistats/clarity/tools/FinalInventoryDump.java
vendor/clarity/src/main/java/skadistats/clarity/tools/SkillBuildDump.java
```

## 13. Короткое резюме для новой сессии

Проект уже является рабочим локальным MVP.

Он умеет:

- принимать `.dem` через local watch folder;
- переносить raw replay в локальное хранилище;
- создавать parse jobs;
- парсить через vendored `skadistats/clarity`;
- строить `dashboard.json`;
- показывать матч на React frontend;
- показывать игроков, героев, final inventory, item/ability builds и timeline;
- скачивать raw replay;
- удалять raw replay отдельно;
- reparse match;
- удалять match;
- работать локально и в LAN.

Следующая разумная задача: прогнать больше демок, стабилизировать parser на разных матчах и улучшить качество dashboard data.
