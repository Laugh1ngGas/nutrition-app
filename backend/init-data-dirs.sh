#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Запустіть один раз перед першим docker-compose up:
#   chmod +x init-data-dirs.sh && ./init-data-dirs.sh
# ──────────────────────────────────────────────────────────────────────────────

set -e

echo "📁 Створення локальних папок для зберігання даних..."

mkdir -p docker-data/postgres
mkdir -p docker-data/redis
mkdir -p docker-data/logs

# PostgreSQL вимагає, щоб папка data була порожньою і мала права 700
chmod 700 docker-data/postgres

echo ""
echo "✅ Готово! Структура папок:"
echo ""
echo "  docker-data/"
echo "  ├── postgres/   ← дані PostgreSQL (WAL, таблиці, індекси)"
echo "  ├── redis/      ← Redis AOF + RDB snapshots"
echo "  └── logs/       ← логи API"
echo ""
echo "⚠️  Не додавайте docker-data/ до git (вже є в .gitignore)"
echo ""
echo "Наступний крок:"
echo "  cp .env.example .env   ← заповніть паролі та секрети"
echo "  docker-compose up -d   ← запустити все"
