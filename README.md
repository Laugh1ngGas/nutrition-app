# NutritionApp

> React + Vite · Node.js + Express · PostgreSQL · Redis · Docker

## Структура проекту

```
mealprep/                        ← коренева папка
├── docker-compose.yml           ← єдина точка запуску всього стеку
├── .env                         ← один файл змінних для всіх сервісів
├── init-data-dirs.ps1           ← Windows: запустити один раз
├── init-data-dirs.sh            ← Mac/Linux: запустити один раз
├── nginx.conf                   ← конфіг Nginx для фронтенду
│
├── frontend/
│   ├── Dockerfile               ← скопіювати з frontend.Dockerfile
│   └── nginx.conf               ← скопіювати сюди
│
├── backend/                     ← Express API
│   └── Dockerfile
│
└── docker-data/                 ← локальні дані (НЕ в git)
    ├── postgres/                ← файли PostgreSQL
    ├── redis/                   ← Redis persistence
    └── logs/                    ← логи API
```

---

## Перший запуск

### 1. Зібрати структуру папок

```powershell
# Windows (PowerShell)
mkdir mealprep; cd mealprep

git clone https://github.com/your/frontend-repo.git frontend
git clone https://github.com/your/backend-repo.git  backend
```

### 2. Додати Dockerfile і nginx.conf до фронтенду

```powershell
# Windows
Copy-Item frontend.Dockerfile frontend\Dockerfile
Copy-Item nginx.conf frontend\nginx.conf
```

```bash
# Mac / Linux
cp frontend.Dockerfile frontend/Dockerfile
cp nginx.conf frontend/nginx.conf
```

### 3. Ініціалізувати папки для даних

```powershell
# Windows — запустити ps1 скрипт
.\init-data-dirs.ps1
```

```bash
# Mac / Linux
chmod +x init-data-dirs.sh && ./init-data-dirs.sh
```

> ⚠️ **Windows: якщо PowerShell блокує запуск скриптів**, виконайте один раз:
>
> ```powershell
> Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
> ```

### 4. Налаштувати змінні середовища

```powershell
# Windows
Copy-Item .env.example .env
notepad .env
```

```bash
# Mac / Linux
cp .env.example .env && nano .env
```

Заповніть у `.env`:

- `DB_PASSWORD` — будь-який надійний пароль
- `JWT_SECRET` і `JWT_REFRESH_SECRET` — випадкові рядки мінімум 64 символи

```powershell
# Генерація JWT секрету (потрібен Node.js)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 5. Запустити весь стек

```powershell
docker-compose up -d --build
```

**Ready**

| Сервіс       | URL                                 |
| ------------ | ----------------------------------- |
| Frontend     | http://localhost:5173               |
| Backend API  | http://localhost:3001/api/v1        |
| Health check | http://localhost:3001/api/v1/health |

---

## Щоденна розробка

```powershell
# Запустити (якщо вже збудовано)
docker-compose up -d

# Зупинити (дані збережено)
docker-compose down

# Перезібрати після змін у коді
docker-compose up -d --build

# Перезібрати тільки один сервіс
docker-compose up -d --build backend
docker-compose up -d --build frontend

# Логи в реальному часі
docker-compose logs -f
docker-compose logs -f backend
```

### Розробка без Docker (hot-reload) — рекомендовано

Тримайте БД у Docker, а код запускайте локально — швидший перезапуск:

```powershell
# Термінал 1 — тільки PostgreSQL + Redis
docker-compose up -d postgres redis

# Термінал 2 — бекенд з hot-reload
cd backend
npm install
npm run dev

# Термінал 3 — фронтенд з hot-reload
cd frontend
npm install
npm run dev
```

> У `.env` для локального запуску: `DB_HOST=localhost`, `REDIS_HOST=localhost`

---

## Підключення фронтенду до API

Реальний клієнт: `frontend/src/integrations/api/client.ts`. У браузері він завжди
звертається за відносним шляхом `/api/v1/...` — фронтенд-сервер (Nitro) сам
проксує `/api/**` до бекенду через внутрішню docker-мережу (`http://backend:3001`,
див. `routeRules` у `frontend/vite.config.ts`). Це означає:

- Немає абсолютного URL, який "запікається" у білд — той самий образ працює
  однаково через `localhost`, LAN IP або тунель (ngrok), без ребілду.
- Браузер ніколи не робить cross-origin запит до API напряму, тож CORS для
  цього шляху не задіяний.

`FRONTEND_URL` (backend, `docker-compose.yml`) — це лише запасний варіант для
прямих запитів до бекенду в обхід проксі (наприклад, `curl`/Postman на
`:3001`); підтримує список origin'ів через кому.

---

## Корисні команди

```powershell
# Резервна копія БД
$date = Get-Date -Format "yyyyMMdd_HHmm"
docker exec nutrition-app-postgres pg_dump -U mealprep_user mealprepdb > "backup_$date.sql"

# Відновлення з бекапу
Get-Content backup_20240101_1200.sql | docker exec -i nutrition-app-postgres psql -U mealprep_user -d mealprepdb

# Увійти в PostgreSQL
docker exec -it nutrition-app-postgres psql -U mealprep_user -d mealprepdb

# Увійти в Redis CLI
docker exec -it nutrition-app-redis redis-cli

# Статус контейнерів
docker-compose ps
docker stats

# Повне скидання (УВАГА: всі дані видаляться)
docker-compose down
Remove-Item -Recurse -Force docker-data
.\init-data-dirs.ps1
```

---

## Дані між перезапусками

| Команда                            | Дані збережено? |
| ---------------------------------- | --------------- |
| `docker-compose down`              | так             |
| `docker-compose down -v`           | так             |
| Перевстановлення Docker            | так             |
| `Remove-Item -Recurse docker-data` | ні (навмисне)   |
