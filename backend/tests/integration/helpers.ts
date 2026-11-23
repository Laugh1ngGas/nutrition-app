// Integration tests run against the LOCAL docker stack only (docker compose up).
// They refuse to start if the API isn't on localhost or the backend container
// is configured for a hosted database (DATABASE_URL = Supabase).
import { execFileSync } from 'child_process';
import { randomUUID } from 'crypto';

export const BASE = process.env.INTEGRATION_BASE || 'http://localhost:8080/api/v1';

export function assertLocal() {
  const host = new URL(BASE).hostname;
  if (!['localhost', '127.0.0.1'].includes(host)) throw new Error(`Refusing to run against ${host}: local stack only`);
  const hosted = execFileSync('docker', ['exec', 'nutrition-app-backend', 'sh', '-c', 'echo -n "${DATABASE_URL:+set}"']).toString();
  if (hosted) throw new Error('The backend container has DATABASE_URL set (hosted DB): refusing to run');
}

/** A query on the local docker Postgres; returns rows as arrays of strings */
export function psql(sql: string): string[][] {
  const out = execFileSync('docker', [
    'exec', 'nutrition-app-postgres', 'sh', '-c', 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tA -F "|" -c "$0"', sql,
  ]).toString().trim();
  return out ? out.split('\n').map((line) => line.split('|')) : [];
}

export interface Res<T = any> { status: number; body: T }

export async function api<T = any>(method: string, path: string, body?: unknown, token?: string): Promise<Res<T>> {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as T };
}

export const PASSWORD = 'TestPass123!';

export interface TestUser { email: string; password: string; access: string; refresh: string; id: string }

export async function newUser(prefix = 'it'): Promise<TestUser> {
  const email = `${prefix}-${randomUUID().slice(0, 8)}@example.com`;
  const r = await api('POST', '/auth/register', { email, password: PASSWORD, first_name: 'Test' });
  if (r.status !== 201) throw new Error(`register failed: ${r.status} ${JSON.stringify(r.body)}`);
  const { tokens, user } = r.body.data;
  return { email, password: PASSWORD, access: tokens.accessToken, refresh: tokens.refreshToken, id: user.id };
}

/** Deletes the user the way the app does (account deletion endpoint) */
export async function removeUser(u: TestUser) {
  await api('DELETE', '/auth/account', { password: u.password }, u.access);
}

export async function foodId(name: string, token: string): Promise<string> {
  const r = await api('GET', `/foods?q=${encodeURIComponent(name)}&limit=10`, undefined, token);
  const exact = r.body.data.find((f: { name: string }) => f.name.toLowerCase() === name.toLowerCase());
  return (exact ?? r.body.data[0]).id;
}

export function monday(): string {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
