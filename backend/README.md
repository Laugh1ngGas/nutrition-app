# MealPrepRoulette — Backend API

Node.js + Express + TypeScript + PostgreSQL + Redis

## Швидкий старт

### 1. Ініціалізація папок та середовища
```bash
# Створити локальні папки для даних
chmod +x init-data-dirs.sh && ./init-data-dirs.sh

# Налаштувати змінні середовища
cp .env.example .env
# Відредагуйте .env — вкажіть паролі та JWT секрети
# Згенерувати секрети: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 2. Запуск через Docker (рекомендовано)
```bash
# Запустити PostgreSQL + Redis + API
docker-compose up -d

# Або тільки БД, а API локально (для розробки):
docker-compose up -d postgres redis
npm install && npm run dev
```

### 3. Без Docker (вручну)
```bash
npm run db:migrate   # Створити таблиці
npm run dev          # Dev режим з hot-reload
```

---

## 💾 Постійне зберігання даних

Усі дані зберігаються локально у папці `docker-data/` поруч з проектом — **не всередині Docker**.

```
docker-data/
├── postgres/   ← файли PostgreSQL (WAL, таблиці, індекси)
├── redis/      ← Redis AOF-лог + RDB snapshots
└── logs/       ← логи API
```

### Порівняння підходів

| Команда | Named volume | Bind mount (наш варіант) |
|---------|-------------|--------------------------|
| `docker-compose down` | ✅ дані є | ✅ дані є |
| `docker-compose down -v` | ❌ дані втрачені | ✅ дані є |
| Перевстановлення Docker | ❌ дані втрачені | ✅ дані є |
| Видалення образів Docker | ❌ разом з ними | ✅ дані є |

### Корисні команди

```bash
# Зупинити все (дані збережено)
docker-compose down

# Перезапустити тільки API після змін у коді
docker-compose up -d --build api

# Переглянути логи в реальному часі
docker-compose logs -f api
docker-compose logs -f postgres

# Резервна копія БД
docker exec mealprepdb pg_dump -U mealprep_user mealprepdb > backup_$(date +%Y%m%d).sql

# Відновлення БД з backup
cat backup_20240101.sql | docker exec -i mealprepdb psql -U mealprep_user -d mealprepdb

# Повне скидання (УВАГА: всі дані будуть видалені)
docker-compose down && rm -rf docker-data && ./init-data-dirs.sh
```

---

## API Endpoints

| Method | Route | Опис | Auth |
|--------|-------|------|------|
| GET | `/api/v1/health` | Health check | ❌ |
| POST | `/api/v1/auth/register` | Реєстрація | ❌ |
| POST | `/api/v1/auth/login` | Логін | ❌ |
| POST | `/api/v1/auth/refresh` | Оновити токени | ❌ |
| POST | `/api/v1/auth/logout` | Вийти | ❌ |
| GET | `/api/v1/profile` | Отримати профіль | ✅ |
| PATCH | `/api/v1/profile` | Оновити профіль | ✅ |
| PUT | `/api/v1/profile/allergens` | Оновити алергени | ✅ |
| GET | `/api/v1/foods?q=` | Пошук продуктів | ❌ |
| GET | `/api/v1/foods/:id` | Продукт по ID | ❌ |
| GET | `/api/v1/foods/barcode/:code` | По штрихкоду | ❌ |
| POST | `/api/v1/foods` | Додати продукт | ✅ |
| GET | `/api/v1/logs?date=` | Денний щоденник | ✅ |
| GET | `/api/v1/logs/weekly?start_date=` | Тижнева статистика | ✅ |
| POST | `/api/v1/logs` | Записати прийом їжі | ✅ |
| DELETE | `/api/v1/logs/:id` | Видалити запис | ✅ |
| GET | `/api/v1/fridge` | Вміст холодильника | ✅ |
| GET | `/api/v1/fridge/expiring` | Продукти що псуються | ✅ |
| POST | `/api/v1/fridge` | Додати до холодильника | ✅ |
| PATCH | `/api/v1/fridge/:id` | Оновити кількість | ✅ |
| DELETE | `/api/v1/fridge/:id` | Видалити з холодильника | ✅ |
| GET | `/api/v1/shopping` | Списки покупок | ✅ |
| POST | `/api/v1/shopping` | Створити список | ✅ |
| GET | `/api/v1/shopping/:id` | Список з товарами | ✅ |
| POST | `/api/v1/shopping/:id/items` | Додати товар | ✅ |
| PATCH | `/api/v1/shopping/:id/items/:itemId/toggle` | Відмітити куплено | ✅ |
| POST | `/api/v1/shopping/generate-from-plan` | Список з плану | ✅ |

---

## Структура проекту

```
src/
├── config/
│   ├── database.ts       # PostgreSQL pool
│   └── redis.ts          # Redis client + cache helpers
├── controllers/
│   ├── auth.controller.ts
│   ├── profile.controller.ts
│   ├── foods.controller.ts
│   ├── foodLogs.controller.ts
│   ├── fridge.controller.ts
│   └── shoppingList.controller.ts
├── middleware/
│   ├── auth.ts           # JWT verification
│   └── errorHandler.ts   # Global error handler
├── routes/
│   └── index.ts          # All routes
├── services/
│   ├── auth.service.ts   # Auth logic + BMR calculation
│   └── foodLog.service.ts
├── types/
│   └── index.ts          # TypeScript interfaces
├── utils/
│   ├── logger.ts         # Winston logger
│   ├── migrate.sql       # DB schema
│   └── migrate.ts        # Migration runner
└── index.ts              # Entry point
```

## Наступні кроки (AI частина)

Коли будете готові додати AI рекомендації:
1. Встановити `openai` пакет
2. Додати `OPENAI_API_KEY` до `.env`
3. Створити `src/services/recommendations.service.ts`
4. Додати endpoint `GET /api/v1/recommendations`
