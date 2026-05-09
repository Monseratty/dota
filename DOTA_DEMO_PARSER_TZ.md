# ТЗ: Dota 2 Demo Parser Dashboard

## 0. Контекст для Claude и новых Codex-сессий

Этот документ является главным источником правды по проекту. Его можно передавать Claude, новой сессии Codex или другому AI-агенту, чтобы они понимали продукт, стек, ограничения и порядок реализации без чтения предыдущей переписки.

### Короткое описание продукта

Нужно сделать локальный веб-сервис для Dota 2 replay analysis.

Пользователь не загружает демки через сайт на MVP. Вместо этого он кладёт `.dem` файлы в локальную папку:

```text
storage/inbox
```

Приложение само:

1. Находит новые `.dem`.
2. Проверяет, что файл полностью докопировался.
3. Переносит файл в `storage/demos/raw`.
4. Создаёт задачу на парсинг.
5. Парсит replay через `skadistats/clarity`.
6. Сохраняет parsed JSON и данные в SQLite.
7. Показывает матч на многостраничном сайте в стиле Dota2ProTracker.

Главная цель MVP: end-to-end pipeline.

```text
.dem в storage/inbox
  -> scanner
  -> parse job
  -> clarity parser
  -> dashboard.json
  -> frontend match page
```

### Роли AI-инструментов

Если проект ведётся через Claude + Codex:

```text
Claude:
  планирует
  ревьюит ТЗ/архитектуру
  формулирует задачи
  пишет acceptance criteria
  предлагает улучшения UI/UX/AI Review

Codex:
  пишет код
  редактирует файлы
  запускает команды
  ставит зависимости с разрешения пользователя
  запускает dev server
  проверяет frontend в браузере
  чинит ошибки
  интегрирует результат
```

Не рекомендуется давать Claude и Codex одновременно писать один и тот же участок кода. Лучше: Claude формулирует задачу и ревьюит, Codex реализует локально.

### Формат задач для Codex

Claude или пользователь должны передавать задачи Codex примерно в таком формате:

```text
Task:
Implement local watch folder scanner.

Context:
Use DOTA_DEMO_PARSER_TZ.md as source of truth.
Project stack: Node.js + Fastify + SQLite + React/Vite.

Scope:
- Create scanner service
- Add POST /api/system/rescan
- Create match and parse_job rows
- Do not implement parser worker yet

Acceptance criteria:
- Finds .dem files in storage/inbox
- Waits until file size is stable
- Moves file to storage/demos/raw
- Creates matches row
- Creates parse_jobs row
- Match appears in GET /api/matches
- npm run dev works
```

### Текущие локальные материалы

В предыдущем исследовательском прототипе уже проверялся `skadistats/clarity` и была распарсена одна демка. Новая реализация не обязана копировать старый прототип, но может использовать его как справочник.

Важные локальные пути из текущей рабочей среды:

```text
Workspace:
/Users/denismnogodengov/Documents/Codex/2026-05-08/ghbdtn

ТЗ:
/Users/denismnogodengov/Documents/Codex/2026-05-08/ghbdtn/DOTA_DEMO_PARSER_TZ.md

Исходная тестовая демка:
/Users/denismnogodengov/Downloads/8794303336.dem
```

Если новая Codex-сессия работает в другой папке, нужно открыть/скопировать этот ТЗ и продолжить по нему.

### Ключевые продуктовые решения

- MVP работает локально.
- Облако на MVP не используется.
- Web upload через сайт не обязателен на MVP.
- Основной импорт идёт через watch folder `storage/inbox`.
- Raw `.dem` хранится локально.
- Parsed data хранится отдельно и остаётся доступной даже после удаления raw replay.
- UI должен быть похож по смыслу на Dota2ProTracker: компактно, тёмно, с карточками игроков, героями, предметами, ability build и final inventory.
- Combat log не показывать в UI MVP.
- AI Review не входит в первый MVP, но архитектура должна позволить добавить его позже через `features.json`.

### Ключевые технические решения

- Frontend: React + Vite + React Router.
- Backend: Node.js + Fastify.
- Database: SQLite через `better-sqlite3`.
- Worker: отдельный Node.js process.
- Parser: Java 17 + `skadistats/clarity`.
- Storage: local filesystem через `StorageService`.
- Runtime queue на MVP: таблица `parse_jobs` в SQLite.
- Иконки Dota на MVP можно брать с CDN.
- Pro player matching на MVP через локальный `data/pro_players.json`.

### Главные риски

- Самое сложное место: стабильный парсинг `.dem`, особенно final inventory, item timings, ability build и player identity.
- Нельзя читать `.dem` целиком в память без необходимости.
- Нельзя отдавать raw replay по произвольному path из запроса.
- Нужно проверять, что файл в `storage/inbox` полностью докопировался перед переносом и парсингом.
- Нужно аккуратно разделить raw data, parsed data и UI dashboard data.

### Что делать первым

Первый рабочий заход должен быть направлен на end-to-end MVP:

1. Создать структуру проекта.
2. Настроить config, storage folders, SQLite.
3. Сделать backend healthcheck и API списка матчей.
4. Сделать scanner для `storage/inbox`.
5. Сделать parse_jobs.
6. Подключить parser worker.
7. Генерировать `dashboard.json`.
8. Сделать frontend `/`, `/matches`, `/matches/:id`.
9. Проверить на реальной демке.

## 1. Цель проекта

Сделать локальный веб-сервис для автоматического разбора `.dem` файлов Dota 2. Пользователь складывает демки в специальную локальную папку, backend сам находит новые файлы, парсит их через `clarity`, сохраняет результаты на локальном компьютере и отображает матчи на сайте в стиле Dota2ProTracker.

На первом этапе проект работает полностью локально:

- без облачного хранения;
- без внешних очередей;
- без обязательной загрузки через браузер;
- с локальной папкой для входящих `.dem` файлов.

## 2. Основной пользовательский сценарий

1. Пользователь запускает приложение.
2. Пользователь скачивает или копирует `.dem` файлы в локальную папку `storage/inbox`.
3. Backend периодически сканирует эту папку.
4. Если найден новый `.dem`, backend проверяет, что файл полностью докопировался.
5. Файл переносится в папку постоянного локального хранения.
6. Создаётся задача на парсинг.
7. Parser Worker разбирает демку через `clarity`.
8. Результаты сохраняются в базу и JSON-файлы.
9. На сайте появляется матч со статусом `ready`.
10. Пользователь открывает страницу матча и смотрит статистику.

## 3. MVP

MVP должен уметь:

- запускаться локально одной командой;
- сканировать локальную watch folder;
- находить новые `.dem` файлы;
- корректно ждать окончания копирования файла;
- переносить принятые демки из `inbox` в `raw`;
- создавать задачи на парсинг;
- парсить демки через Java `clarity`;
- сохранять извлечённые данные в локальную базу;
- сохранять dashboard JSON для быстрого отображения;
- отображать список найденных матчей;
- отображать статус обработки;
- отображать страницу конкретного матча;
- показывать информацию в стиле Dota2ProTracker;
- позволять удалить матч вместе с raw demo и parsed-данными;
- позволять вручную запустить повторное сканирование папки.

Web upload через сайт не является обязательной частью MVP. Его можно добавить позже как дополнительный способ импорта.

## 4. Локальное хранение файлов

Все файлы хранятся на компьютере пользователя.

Структура:

```text
storage/
  inbox/
    сюда пользователь кладёт новые .dem файлы

  demos/
    raw/
      {match_id}.dem

  parsed/
    {match_id}/
      dashboard.json
      summary.json
      scoreboard.json
      final_inventory.json
      item_builds.json
      ability_builds.json
      timelines.json

  failed/
    {original_filename}.dem

  logs/
    parser/
      {match_id}.log
```

Правила хранения:

- пользователь вручную кладёт `.dem` файлы в `storage/inbox`;
- backend не парсит файл сразу после появления, а сначала проверяет, что размер файла перестал меняться;
- после принятия файл переносится в `storage/demos/raw`;
- если `match_id` удалось достать из демки, использовать его как основной ID;
- если `match_id` не удалось достать, использовать внутренний UUID;
- если матч уже существует, не перезаписывать его молча;
- битые или непарсящиеся демки можно переносить в `storage/failed`;
- результаты парсинга сохраняются в `storage/parsed/{match_id}`;
- логи парсера сохраняются в `storage/logs/parser`;
- удаление матча через UI должно удалять raw demo, parsed JSON и записи из базы.

На MVP raw `.dem` можно хранить бессрочно. Позже добавить настройку автоудаления старых raw demo.

## 5. Watch Folder

Основная папка импорта:

```text
storage/inbox
```

Backend должен сканировать папку периодически, например раз в 10 секунд.

Алгоритм:

1. Найти все файлы с расширением `.dem` в `storage/inbox`.
2. Для каждого файла проверить, есть ли он уже в базе как `discovered`, `queued`, `parsing`, `ready` или `failed`.
3. Проверить размер файла.
4. Подождать несколько секунд.
5. Проверить размер снова.
6. Если размер не изменился, считать файл полностью скопированным.
7. Перенести файл в `storage/demos/raw`.
8. Создать запись в `matches`.
9. Создать запись в `parse_jobs`.
10. Поставить статус `queued`.

Нужно предусмотреть ручную кнопку в UI:

```text
Rescan folder
```

Она запускает внеочередное сканирование `storage/inbox`.

## 6. База данных

Для локальной разработки использовать SQLite.

Файл базы:

```text
data/app.db
```

Основные таблицы:

```text
matches
  id
  match_id
  source_filename
  raw_file_path
  file_size
  duration
  radiant_score
  dire_score
  winner
  status
  discovered_at
  queued_at
  parsed_at
  error_message

players
  id
  match_id
  steam_id
  account_id
  display_name
  pro_name
  hero_id
  hero_name
  team
  slot
  kills
  deaths
  assists
  gpm
  xpm
  net_worth
  hero_damage
  tower_damage
  healing

player_items
  id
  match_id
  player_id
  item_id
  item_name
  slot_type
  slot_index
  is_final
  purchase_time

player_abilities
  id
  match_id
  player_id
  ability_id
  ability_name
  level
  game_time

parse_jobs
  id
  match_id
  raw_file_path
  status
  attempts
  created_at
  started_at
  finished_at
  error_message
```

Статусы матча:

```text
discovered
queued
parsing
ready
failed
deleted
```

Статусы задачи:

```text
queued
running
done
failed
```

## 7. Backend

Backend API отвечает за:

- сканирование watch folder;
- управление матчами;
- управление задачами парсинга;
- выдачу данных фронту;
- удаление матчей;
- повторный запуск парсинга.

Рекомендуемый стек:

```text
Node.js + Fastify
SQLite
local filesystem
Java clarity parser
```

API:

```text
GET /api/system/storage
```

Вернуть текущие пути хранения: inbox, raw demos, parsed data, database.

```text
POST /api/system/rescan
```

Вручную запустить сканирование `storage/inbox`.

```text
GET /api/matches
```

Список матчей с базовой информацией и статусом.

```text
GET /api/matches/:id
```

Информация о матче.

```text
GET /api/matches/:id/dashboard
```

Готовые данные для страницы матча.

```text
POST /api/matches/:id/reparse
```

Повторно поставить матч в очередь парсинга.

```text
DELETE /api/matches/:id
```

Удалить матч, raw demo, parsed-файлы и записи из базы.

Опционально позже:

```text
POST /api/demos/upload
```

Загрузка `.dem` через сайт. Не требуется для MVP.

## 8. Parser Worker

Parser Worker — отдельный процесс внутри проекта.

Задачи worker:

- брать задачи со статусом `queued`;
- переводить задачу в `running`;
- обновлять статус матча на `parsing`;
- запускать Java parser на `.dem` файле;
- получать JSON-результаты;
- сохранять parsed-файлы;
- записывать данные в SQLite;
- обновлять статус задачи на `done`;
- обновлять статус матча на `ready`;
- при ошибке сохранять лог, статус задачи `failed`, статус матча `failed`.

На MVP можно сделать простой polling базы раз в несколько секунд.

Команда парсинга условно:

```bash
java -cp clarity-tools.jar DemoParser input.dem output_dir/
```

## 9. Какие данные парсить

Обязательно:

- match id;
- длительность матча;
- победившая сторона;
- счёт Radiant/Dire;
- список игроков;
- SteamID/accountID;
- ник игрока;
- герой;
- команда;
- K/D/A;
- GPM/XPM;
- net worth;
- финальный инвентарь;
- backpack;
- neutral item;
- teleport slot;
- item purchase timings;
- ability build;
- уровни героя;
- базовые события матча.

Желательно:

- draft/picks/bans;
- lane info;
- график net worth;
- график XP;
- tower/objective events;
- Roshan events;
- buyback events;
- kill streaks;
- first blood;
- duration by game time.

Не показывать в UI на MVP:

- полный combat log;
- сырые protobuf/event dumps;
- технические entity данные.

Но можно сохранять часть технических данных в parsed JSON для отладки, если это не раздувает объём.

## 10. Pro Player Resolution

Нужно определять, является ли игрок профессиональным.

На MVP без runtime API:

- положить локальный JSON-файл `data/pro_players.json`;

Структура:

```json
[
  {
    "account_id": 123,
    "steam_id": "7656119...",
    "name": "Noticed",
    "team": "Team Yandex"
  }
]
```

Логика:

- если `account_id` найден в `pro_players.json`, показывать professional nickname;
- если не найден, показывать ник из демки;
- рядом можно показывать маленький `PRO` бейдж;
- обновление списка pro players пока вручную через замену JSON.

## 11. Frontend

Рекомендуемый стек:

```text
React / Vite
TypeScript желательно, но не обязательно
React Router
```

Основные страницы:

```text
/
```

Главная: путь к watch folder, статус системы, последние матчи, кнопка `Rescan folder`.

```text
/matches
```

Все найденные матчи: поиск, фильтры, дата, герой, игрок, статус.

```text
/matches/:id
```

Страница конкретного матча: scoreboard, игроки, билды, финальный инвентарь, графики.

```text
/matches/:id/builds
```

Отдельная страница билдов как Dota2ProTracker: item timings, skill build, final slots.

```text
/matches/:id/timeline
```

События матча по времени: kills, objectives, Roshan, buybacks.

```text
/settings
```

Настройки локального хранения, лимиты, путь к папке, автоудаление старых демок.

Главный экран:

- показать путь к watch folder;
- показать подсказку, что `.dem` нужно класть в `storage/inbox`;
- кнопка `Rescan folder`;
- список последних матчей;
- статус: `discovered`, `queued`, `parsing`, `ready`, `failed`;
- кнопка открыть матч;
- кнопка повторить парсинг;
- кнопка удалить.

Страница матча:

- верхняя панель матча: герои, счёт, победитель, длительность;
- две колонки Radiant/Dire;
- карточки игроков;
- герой с картинкой;
- ник/pro nickname;
- KDA/GPM/XPM/net worth;
- ability build иконками;
- item build с таймингами;
- финальный инвентарь как на Dota2ProTracker:
  - 6 основных слотов;
  - backpack отдельно;
  - TP slot;
  - neutral item;
- компактный стиль, без лишних описаний;
- тёмная тема.

## 12. Иконки и справочники

Нужны локальные или CDN-иконки:

- heroes;
- items;
- abilities.

На MVP можно использовать CDN Valve/Dota assets. Позже можно сделать локальный cache.

Справочники:

```text
data/heroes.json
data/items.json
data/abilities.json
data/pro_players.json
```

## 13. Ограничения импорта

На MVP:

- импортировать только `.dem`;
- игнорировать временные файлы и файлы без `.dem`;
- не начинать парсинг, пока размер файла меняется;
- один parser worker по умолчанию;
- если файл повреждён, показывать `failed` и текст ошибки;
- если в `inbox` лежит много демок, обрабатывать их очередью;
- не блокировать сайт во время парсинга.

## 14. Локальная конфигурация

Файл:

```text
config.json
```

Пример:

```json
{
  "storagePath": "./storage",
  "inboxPath": "./storage/inbox",
  "rawDemoPath": "./storage/demos/raw",
  "parsedPath": "./storage/parsed",
  "failedPath": "./storage/failed",
  "databasePath": "./data/app.db",
  "scanIntervalSeconds": 10,
  "fileStableCheckSeconds": 5,
  "parserConcurrency": 1,
  "keepRawDemos": true,
  "autoDeleteRawAfterDays": null
}
```

## 15. Нефункциональные требования

Проект должен:

- запускаться локально одной командой;
- не требовать облака;
- не терять данные после перезапуска;
- автоматически подхватывать демки из локальной папки;
- корректно показывать ошибку парсинга;
- не блокировать сайт во время обработки демки;
- позволять открыть уже распарсенный матч без повторного парсинга;
- работать с демками `~100-200 МБ`;
- выдерживать локально хотя бы `250 демок/день`, если хватает диска;
- позволять в будущем заменить локальное хранение на облачное без полной переделки.

## 16. Команды запуска

Желаемый DX:

```bash
npm install
npm run dev
```

Отдельно worker:

```bash
npm run worker
```

Или всё вместе:

```bash
npm run dev:all
```

## 17. Что подготовить для будущего облака

Даже в локальной версии надо сразу сделать абстракции:

```text
StorageService
  saveRawDemo()
  moveFromInboxToRaw()
  readRawDemo()
  deleteRawDemo()
  saveParsedJson()
  readParsedJson()
  deleteParsedData()

LocalStorageService
  реализация через filesystem

CloudStorageService
  будет позже
```

Так потом можно будет заменить локальный диск на S3/R2/B2 без переписывания всего проекта.

Также не завязывать frontend на файлы напрямую. Frontend всегда ходит через backend API.

## 18. Скачивание raw replay

Пользователь должен иметь возможность скачать оригинальный `.dem` файл со страницы матча, если raw replay ещё хранится локально.

### Хранение raw replay

Raw `.dem` файл после импорта хранится в:

```text
storage/demos/raw/{match_id}.dem
```

В базе у матча должны быть поля:

```text
matches
  raw_file_path
  file_size
  raw_deleted_at
  raw_delete_reason
```

Если raw replay существует на диске, backend должен отдавать в API:

```json
{
  "hasRawDemo": true,
  "rawDemoSize": 104857600,
  "downloadUrl": "/api/matches/8794303336/download"
}
```

Если raw replay был удалён, статистика матча остаётся доступной, но скачивание отключается:

```json
{
  "hasRawDemo": false,
  "rawDeletedAt": "2026-05-09T12:00:00.000Z",
  "rawDeleteReason": "auto_delete_after_14_days"
}
```

### API для скачивания

```text
GET /api/matches/:id/download
```

Backend должен:

1. Найти матч в базе.
2. Взять `raw_file_path` из записи матча.
3. Проверить, что файл существует.
4. Проверить, что файл находится внутри разрешённой папки `storage/demos/raw`.
5. Отдать файл через stream response.

Заголовки ответа:

```text
Content-Type: application/octet-stream
Content-Disposition: attachment; filename="{match_id}.dem"
Content-Length: {file_size}
```

Файл нельзя читать целиком в память. Нужно использовать потоковую отдачу, потому что `.dem` может весить `100-200 МБ`.

### UI

На странице матча должна быть кнопка:

```text
Download replay
```

Кнопка активна, если:

```text
hasRawDemo === true
```

Если raw replay удалён или отсутствует:

- кнопка disabled;
- показывать короткий статус: `Replay file no longer available`;
- статистика матча остаётся доступной.

### Безопасность

Frontend не должен получать прямой локальный путь к файлу и не должен скачивать файл напрямую из filesystem.

Запрещённый вариант:

```text
GET /download?path=/Users/...
```

Разрешённый вариант:

```text
GET /api/matches/:id/download
```

Backend всегда сам берёт путь из базы и проверяет, что итоговый resolved path находится внутри `storage/demos/raw`.

Это нужно, чтобы пользователь не мог скачать произвольный файл с компьютера через подмену path.

## 19. Технический стек и структура проекта

Для MVP нужно использовать простой и понятный стек, который легко запустить локально и потом без полной переделки расширить до production-версии.

### Frontend

```text
React
Vite
React Router
TypeScript желательно
CSS Modules или обычный CSS
```

Почему:

- Vite быстро запускается локально;
- React удобен для многостраничного интерфейса;
- React Router достаточно для страниц `/`, `/matches`, `/matches/:id`;
- Next.js на MVP не нужен, потому что серверный рендеринг и сложная routing-инфраструктура пока не дают пользы.

### Backend

```text
Node.js
Fastify
TypeScript желательно
Zod
Pino
```

Почему:

- Fastify лёгкий и быстрый;
- Node.js хорошо подходит для локального API, работы с файлами и запуска worker-процессов;
- Zod нужен для валидации config/API payloads;
- Pino нужен для нормальных структурированных логов.

### Database

```text
SQLite
better-sqlite3
```

Почему:

- SQLite не требует отдельного сервера;
- база лежит локальным файлом `data/app.db`;
- для MVP и локального использования этого достаточно;
- позже можно перейти на Postgres, если появится многопользовательский сервер или облачная версия.

### Worker

```text
Node.js worker process
child_process для запуска Java parser
polling SQLite parse_jobs
```

Почему:

- worker можно запускать отдельной командой;
- на MVP не нужна внешняя очередь;
- polling таблицы `parse_jobs` проще и надёжнее для локального приложения;
- позже worker можно перевести на Redis/BullMQ/RabbitMQ/SQS.

### Parser

```text
Java 17
skadistats/clarity
custom Java parser tools
JSON output
```

Почему:

- `clarity` уже умеет читать Dota 2 `.dem`;
- кастомные Java tools позволяют сразу отдавать нужный формат;
- backend/worker получает JSON и не зависит от внутренних protobuf/entity details.

### Storage

```text
local filesystem
StorageService abstraction
```

Почему:

- на MVP все `.dem` и parsed-файлы хранятся на компьютере пользователя;
- `StorageService` позволит позже заменить локальный диск на S3/R2/B2;
- frontend не должен читать файлы напрямую, только через backend API.

### Assets

```text
Dota hero icons
Dota item icons
Dota ability icons
```

На MVP можно использовать CDN-иконки. Позже можно добавить локальный cache, чтобы сайт работал полностью офлайн.

### Pro Players

```text
data/pro_players.json
```

На MVP список pro players хранится локально. Runtime-запросы к внешним API не обязательны.

### Рекомендуемая структура репозитория

```text
apps/
  web/
    src/
      pages/
      components/
      api/
      styles/
      router/

  api/
    src/
      routes/
      services/
      repositories/
      db/
      config/
      scanner/

  worker/
    src/
      jobs/
      parser/
      services/

packages/
  shared/
    src/
      types/
      constants/
      utils/

  parser-tools/
    src/main/java/
      ...

storage/
  inbox/
  demos/
    raw/
  parsed/
  failed/
  logs/

data/
  app.db
  heroes.json
  items.json
  abilities.json
  pro_players.json

config.json
package.json
```

### Основные принципы реализации

- не завязывать frontend на локальные пути файлов;
- все данные для UI отдавать через backend API;
- parsed match data собирать в единый `dashboard.json`;
- raw `.dem` считать исходником, а не главным runtime-данным;
- сначала делать надёжный локальный MVP, потом добавлять cloud storage;
- не добавлять внешние сервисы, пока они реально не нужны;
- держать parser отдельно от frontend/backend логики;
- хранить технические parser logs отдельно от пользовательских dashboard data.

## 20. Этапы разработки

Этап 1: локальная watch folder

- создать структуру `storage`;
- создать backend;
- добавить periodic scanner;
- находить `.dem` в `storage/inbox`;
- проверять стабильность файла;
- переносить файл в `storage/demos/raw`;
- создавать запись в базе;
- показывать список матчей.

Этап 2: parser worker

- подключить clarity;
- запускать парсинг из очереди;
- сохранить JSON;
- обновить статус;
- сохранять ошибки и логи.

Этап 3: dashboard page

- отрисовать матч;
- игроки;
- герои;
- KDA;
- предметы;
- финальный инвентарь;
- ability build.

Этап 4: polish

- красивые карточки как Dota2ProTracker;
- статусы;
- ошибки;
- удаление матчей;
- повторный парсинг;
- локальный `pro_players.json`.

Этап 5: дополнительные способы импорта

- web upload через сайт;
- drag-and-drop `.dem`;
- импорт папки;
- bulk import.

Этап 6: подготовка к production

- очередь;
- параллельный parsing;
- lifecycle raw demos;
- cloud storage adapter;
- auth;
- deploy.

## 21. План первого рабочего прохода

Первый рабочий проход должен быть направлен на то, чтобы как можно быстрее получить end-to-end MVP: пользователь кладёт `.dem` в папку, backend её находит, parser разбирает, сайт показывает матч.

Рекомендуемый порядок:

### Шаг 1: Скелет проекта

- создать структуру backend/frontend/worker;
- настроить npm scripts;
- добавить общий `config.json`;
- создать папки `storage`, `data`, `logs`;
- подготовить локальную SQLite базу.

Ожидаемый результат: проект запускается, backend отвечает healthcheck endpoint, frontend открывается.

### Шаг 2: Локальная база и модели

- создать schema для `matches`, `players`, `player_items`, `player_abilities`, `parse_jobs`;
- добавить repository layer;
- добавить миграции или простой init script;
- добавить базовые API для списка матчей и просмотра одного матча.

Ожидаемый результат: backend умеет создавать и читать записи матчей/задач.

### Шаг 3: Watch folder scanner

- реализовать периодическое сканирование `storage/inbox`;
- находить `.dem` файлы;
- проверять стабильность размера файла;
- переносить готовые файлы в `storage/demos/raw`;
- создавать `match` и `parse_job`;
- добавить кнопку/API `Rescan folder`.

Ожидаемый результат: если положить `.dem` в `storage/inbox`, она появляется на сайте со статусом `queued`.

### Шаг 4: Parser worker

- подключить Java `clarity`;
- добавить wrapper для запуска parser process;
- брать задачи из `parse_jobs`;
- обновлять статусы `queued -> running -> done/failed`;
- сохранять parser logs;
- сохранять raw JSON в `storage/parsed/{match_id}`.

Ожидаемый результат: демка автоматически парсится, а статус матча становится `ready` или `failed`.

### Шаг 5: Dashboard JSON

- привести результат clarity к единому `dashboard.json`;
- собрать данные матча;
- собрать игроков;
- собрать героев;
- собрать KDA/GPM/XPM/net worth;
- собрать item timings;
- собрать final inventory;
- собрать ability build;
- применить локальный `pro_players.json`.

Ожидаемый результат: для каждого готового матча есть компактный `dashboard.json`, который frontend может сразу отрисовать.

### Шаг 6: Frontend MVP

- сделать страницы `/`, `/matches`, `/matches/:id`;
- показать watch folder path;
- показать список матчей;
- показать статусы обработки;
- добавить кнопку `Rescan folder`;
- добавить страницу матча;
- отрисовать карточки игроков;
- отрисовать героев, предметы, ability build и final inventory.

Ожидаемый результат: сайт можно использовать как локальную панель просмотра распарсенных демок.

### Шаг 7: Полировка интерфейса

- привести визуал ближе к Dota2ProTracker;
- убрать лишние технические данные;
- сделать тёмную тему;
- добавить нормальные empty/error/loading states;
- проверить отображение на разных размерах экрана;
- добавить кнопки `Reparse` и `Delete`.

Ожидаемый результат: MVP выглядит аккуратно и им удобно пользоваться.

### Шаг 8: Проверка на реальной демке

- положить реальную `.dem` в `storage/inbox`;
- дождаться парсинга;
- проверить корректность игроков;
- проверить героев;
- проверить финальный инвентарь;
- проверить item timings;
- проверить ability build;
- проверить pro nickname resolution;
- исправить найденные проблемы.

Ожидаемый результат: реальный матч открывается на сайте и показывает полезные данные без ручной подготовки.

## 22. Примерная оценка объёма кода

Ориентировочный объём для нормального локального MVP:

```text
Backend API:                800-1500 строк
Watch folder scanner:       250-500 строк
Parser worker wrapper:      400-800 строк
SQLite schema/repository:   500-900 строк
Storage service:            250-500 строк
Frontend pages/components:  1200-2500 строк
Styles/CSS:                 800-1600 строк
Shared types/utils:         300-700 строк
Clarity Java parser code:   500-1200 строк
Config/scripts:             200-500 строк
```

Итого:

```text
Минимальный рабочий MVP:    ~4500-6000 строк
Аккуратный MVP:             ~6000-9000 строк
```

Основной риск по объёму не в backend/frontend, а в качестве парсинга `.dem`: нужно стабильно доставать final inventory, item timings, ability build, player identities и приводить их к чистому `dashboard.json`.

## 23. MVP Definition of Done

MVP считается готовым, если:

- можно открыть локальный сайт;
- пользователь может положить `.dem` в `storage/inbox`;
- backend автоматически находит файл;
- файл переносится в `storage/demos/raw`;
- появляется статус обработки;
- parser обрабатывает файл;
- матч появляется в списке;
- страницу матча можно открыть;
- видны игроки, герои, статистика, item build, final inventory, ability build;
- если парсинг упал, пользователь видит понятную ошибку;
- можно вручную нажать `Rescan folder`;
- можно скачать raw `.dem` со страницы матча, если файл ещё существует;
- если raw `.dem` удалён, статистика матча остаётся доступной;
- можно удалить матч вместе с raw `.dem` и parsed JSON.
