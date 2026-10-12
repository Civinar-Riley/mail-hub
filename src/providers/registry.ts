import { allRows, getDb, getRow } from '../db.js';
import type { BaseProvider, ProviderMeta } from './base.js';

export interface ProviderConfig {
  enabled: boolean;
  autoDispatch: boolean;
}

class ProviderRegistry {
  private providers = new Map<string, BaseProvider>();

  register(provider: BaseProvider): void {
    const name = provider.meta?.name;
    // SQLite accepts NULL in a TEXT PRIMARY KEY and `WHERE provider = NULL`
    // never matches, so an unnamed provider would insert a fresh config row
    // on every boot. Refuse it here rather than clean up after it.
    if (typeof name !== 'string' || !name.trim()) {
      throw new Error('Provider registration requires a non-empty meta.name');
    }
    this.providers.set(name, provider);
    const db = getDb();
    const existing = db.prepare(`SELECT provider FROM provider_config WHERE provider = ?`).get(name);
    if (!existing) {
      db.prepare(`INSERT INTO provider_config (provider, enabled, priority, auto_dispatch) VALUES (?, 1, 0, ?)`)
        .run(name, provider.meta.tier === 'paid' ? 0 : 1);
    }
  }

  unregister(name: string): void {
    this.providers.delete(name);
  }

  get(name: string): BaseProvider | undefined {
    return this.providers.get(name);
  }

  /** Registration order — the tie-breaker for the computed default dispatch order. */
  getAll(): BaseProvider[] {
    return Array.from(this.providers.values());
  }

  getEnabled(): BaseProvider[] {
    const db = getDb();
    const rows = allRows<{ provider: string; enabled: number }>(db, `SELECT provider, enabled FROM provider_config`);
    const enabledByName = new Map(rows.map((r) => [r.provider, r.enabled === 1]));
    // Providers without a config row default to enabled; explicitly disabled
    // providers stay disabled even when every provider is turned off.
    return this.getAll().filter((p) => enabledByName.get(p.meta.name) ?? true);
  }

  getConfig(name: string): ProviderConfig {
    const db = getDb();
    const row = getRow<{ enabled: number; auto_dispatch: number }>(
      db,
      `SELECT enabled, auto_dispatch FROM provider_config WHERE provider = ?`,
      name,
    );
    if (!row) {
      return { enabled: true, autoDispatch: true };
    }
    return { enabled: row.enabled === 1, autoDispatch: row.auto_dispatch !== 0 };
  }

  getAllConfigs(): Map<string, ProviderConfig> {
    const db = getDb();
    const rows = allRows<{ provider: string; enabled: number; auto_dispatch: number }>(
      db,
      `SELECT provider, enabled, auto_dispatch FROM provider_config`,
    );
    return new Map(rows.map((r) => [r.provider, { enabled: r.enabled === 1, autoDispatch: r.auto_dispatch !== 0 }]));
  }

  listMeta(): (ProviderMeta & ProviderConfig)[] {
    const cfgs = this.getAllConfigs();
    return this.getAll().map((p) => {
      const c = cfgs.get(p.meta.name);
      if (!c) return { ...p.meta, enabled: true, autoDispatch: true };
      return { ...p.meta, ...c };
    });
  }
}

export const registry = new ProviderRegistry();
