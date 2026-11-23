import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, assertLocal, newUser, PASSWORD, removeUser, TestUser } from './helpers';

const users: TestUser[] = [];
beforeAll(() => assertLocal());
afterAll(async () => { for (const u of users) await removeUser(u); });

const tokensOf = (body: any) => body.data.tokens ?? body.data;

describe('auth: register, login, refresh, change password', () => {
  it('register then login with the same password', async () => {
    const u = await newUser(); users.push(u);
    const login = await api('POST', '/auth/login', { email: u.email, password: PASSWORD });
    expect(login.status).toBe(200);
    expect(tokensOf(login.body).accessToken).toBeTruthy();
    expect((await api('GET', '/profile', undefined, tokensOf(login.body).accessToken)).status).toBe(200);
  });

  it('wrong password is 401', async () => {
    const u = await newUser(); users.push(u);
    expect((await api('POST', '/auth/login', { email: u.email, password: 'WrongPass999!' })).status).toBe(401);
  });

  it('refresh gives a new pair and revokes the old refresh token', async () => {
    const u = await newUser(); users.push(u);
    const first = await api('POST', '/auth/refresh', { refresh_token: u.refresh });
    expect(first.status).toBe(200);
    const next = tokensOf(first.body);
    expect(next.refreshToken).not.toBe(u.refresh);
    // The old one can't be used again
    expect((await api('POST', '/auth/refresh', { refresh_token: u.refresh })).status).toBe(401);
    // The new one works
    const second = await api('POST', '/auth/refresh', { refresh_token: next.refreshToken });
    expect(second.status).toBe(200);
    u.access = tokensOf(second.body).accessToken;
  });

  it('two sessions get different refresh tokens (no duplicate-token 500)', async () => {
    const u = await newUser(); users.push(u);
    const [a, b] = await Promise.all([
      api('POST', '/auth/login', { email: u.email, password: PASSWORD }),
      api('POST', '/auth/login', { email: u.email, password: PASSWORD }),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(tokensOf(a.body).refreshToken).not.toBe(tokensOf(b.body).refreshToken);
  });

  it('changing the password revokes every refresh token and the old password', async () => {
    const u = await newUser(); users.push(u);
    const other = tokensOf((await api('POST', '/auth/login', { email: u.email, password: PASSWORD })).body); // 2nd device
    const changed = await api('POST', '/auth/change-password',
      { current_password: PASSWORD, new_password: 'NewPass456!' }, u.access);
    expect(changed.status).toBe(200);
    expect((await api('POST', '/auth/refresh', { refresh_token: u.refresh })).status).toBe(401);
    expect((await api('POST', '/auth/refresh', { refresh_token: other.refreshToken })).status).toBe(401);
    expect((await api('POST', '/auth/login', { email: u.email, password: PASSWORD })).status).toBe(401);
    const relogin = await api('POST', '/auth/login', { email: u.email, password: 'NewPass456!' });
    expect(relogin.status).toBe(200);
    // The device that changed it stays signed in with the tokens it got back
    const kept = tokensOf(changed.body);
    expect((await api('POST', '/auth/refresh', { refresh_token: kept.refreshToken })).status).toBe(200);
    u.password = 'NewPass456!';
    u.access = tokensOf(relogin.body).accessToken;
  });

  it('protected endpoints need a valid access token', async () => {
    expect((await api('GET', '/fridge')).status).toBe(401);
    expect((await api('GET', '/fridge', undefined, 'not-a-token')).status).toBe(401);
  });
});
