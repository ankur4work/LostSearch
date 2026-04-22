import { describe, it, expect, beforeEach, vi } from 'vitest';
import { isAdmin } from '@/lib/admin-guard';

describe('admin guard', () => {
  const origEmails = process.env.ADMIN_EMAILS;
  const origNodeEnv = process.env.NODE_ENV;
  beforeEach(() => {
    process.env.ADMIN_EMAILS = origEmails;
    process.env.NODE_ENV = origNodeEnv;
    vi.resetModules();
  });

  it('empty allowlist + dev env → open', async () => {
    vi.resetModules();
    process.env.ADMIN_EMAILS = '';
    process.env.NODE_ENV = 'development';
    const { isAdmin: fresh } = await import('@/lib/admin-guard');
    expect(fresh('anyone@example.com')).toBe(true);
  });

  it('empty allowlist + production → CLOSED (fail-safe)', async () => {
    vi.resetModules();
    process.env.ADMIN_EMAILS = '';
    process.env.NODE_ENV = 'production';
    const { isAdmin: fresh } = await import('@/lib/admin-guard');
    expect(fresh('anyone@example.com')).toBe(false);
  });

  it('non-empty allowlist → case-insensitive match', async () => {
    vi.resetModules();
    process.env.ADMIN_EMAILS = 'Alice@example.com, bob@example.com';
    process.env.NODE_ENV = 'production';
    const { isAdmin: fresh } = await import('@/lib/admin-guard');
    expect(fresh('alice@example.com')).toBe(true);
    expect(fresh('BOB@EXAMPLE.COM')).toBe(true);
    expect(fresh('eve@example.com')).toBe(false);
  });

  it('null / empty email is never admin', () => {
    expect(isAdmin(null)).toBe(false);
    expect(isAdmin(undefined)).toBe(false);
    expect(isAdmin('')).toBe(false);
  });
});
