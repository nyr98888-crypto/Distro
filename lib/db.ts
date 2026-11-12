import { randomUUID } from "crypto";
import { turso } from "@/lib/turso";

type SqlValue = string | number | bigint | boolean | null | Uint8Array;
type Row = Record<string, unknown>;
type WhereValue =
  | SqlValue
  | Date
  | { in?: unknown[]; notIn?: unknown[]; not?: unknown; lte?: unknown; gte?: unknown; lt?: unknown; gt?: unknown; startsWith?: string; contains?: string }
  | { equals?: unknown }
  | Record<string, unknown>;

type OrderBy = Record<string, "asc" | "desc"> | Array<Record<string, "asc" | "desc">>;

function uuid(): string {
  return randomUUID();
}

function nowIso(): string {
  return new Date().toISOString();
}

function toSql(value: unknown): SqlValue {
  if (value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "bigint") {
    return value;
  }
  if (value instanceof Uint8Array) return value;
  return String(value);
}

function coerceRow(row: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) {
    if (typeof v === "number" && (k.startsWith("is") || k === "isActive" || k === "isOnline" || k === "isApprovalRequired")) {
      out[k] = v === 1;
    } else if (
      typeof v === "string" &&
      /At$|Time$|Date$|^createdAt$|^updatedAt$|^scheduledFor$|^executedAt$|^lastSyncedAt$|^lastSeenAt$|^lastExtensionPing$|^scheduledTime$|^nextRunAt$|^endDate$/.test(
        k
      )
    ) {
      out[k] = v ? new Date(v) : null;
    } else {
      out[k] = v;
    }
  }
  return out;
}

function pick(row: Row, select?: Record<string, unknown> | null): Row {
  if (!select) return row;
  const out: Row = {};
  for (const key of Object.keys(select)) {
    if (key === "_count") continue;
    if (select[key]) out[key] = row[key];
  }
  return out;
}

type WhereBuilt = { sql: string; args: SqlValue[] };

function buildWhere(
  table: string,
  where: Record<string, WhereValue> | undefined,
  alias = table
): WhereBuilt {
  if (!where || Object.keys(where).length === 0) {
    return { sql: "1=1", args: [] };
  }

  const parts: string[] = [];
  const args: SqlValue[] = [];

  const pushCol = (col: string, val: WhereValue) => {
    const qcol = `"${alias}"."${col}"`;
    if (val === null) {
      parts.push(`${qcol} IS NULL`);
      return;
    }
    if (typeof val !== "object" || val instanceof Date || val instanceof Uint8Array) {
      parts.push(`${qcol} = ?`);
      args.push(toSql(val));
      return;
    }
    const obj = val as Record<string, unknown>;
    if ("in" in obj && Array.isArray(obj.in)) {
      if (obj.in.length === 0) {
        parts.push("0=1");
        return;
      }
      parts.push(`${qcol} IN (${obj.in.map(() => "?").join(",")})`);
      for (const v of obj.in) args.push(toSql(v));
      return;
    }
    if ("notIn" in obj && Array.isArray(obj.notIn)) {
      if (obj.notIn.length === 0) {
        parts.push("1=1");
        return;
      }
      parts.push(`${qcol} NOT IN (${obj.notIn.map(() => "?").join(",")})`);
      for (const v of obj.notIn) args.push(toSql(v));
      return;
    }
    if ("not" in obj) {
      if (obj.not === null) {
        parts.push(`${qcol} IS NOT NULL`);
      } else if (typeof obj.not === "object" && obj.not && "in" in (obj.not as object)) {
        const arr = (obj.not as { in: unknown[] }).in;
        if (!arr.length) {
          parts.push("1=1");
        } else {
          parts.push(`${qcol} NOT IN (${arr.map(() => "?").join(",")})`);
          for (const v of arr) args.push(toSql(v));
        }
      } else {
        parts.push(`${qcol} <> ?`);
        args.push(toSql(obj.not));
      }
      return;
    }
    if ("startsWith" in obj && typeof obj.startsWith === "string") {
      parts.push(`${qcol} LIKE ?`);
      args.push(`${obj.startsWith}%`);
      return;
    }
    if ("contains" in obj && typeof obj.contains === "string") {
      parts.push(`${qcol} LIKE ?`);
      args.push(`%${obj.contains}%`);
      return;
    }
    if ("lte" in obj) {
      parts.push(`${qcol} <= ?`);
      args.push(toSql(obj.lte));
    }
    if ("gte" in obj) {
      parts.push(`${qcol} >= ?`);
      args.push(toSql(obj.gte));
    }
    if ("lt" in obj) {
      parts.push(`${qcol} < ?`);
      args.push(toSql(obj.lt));
    }
    if ("gt" in obj) {
      parts.push(`${qcol} > ?`);
      args.push(toSql(obj.gt));
    }
    if ("equals" in obj) {
      parts.push(`${qcol} = ?`);
      args.push(toSql(obj.equals));
    }
    // Nested relation filter e.g. account: { userId }
    if (!("in" in obj || "notIn" in obj || "not" in obj || "lte" in obj || "gte" in obj || "lt" in obj || "gt" in obj || "startsWith" in obj || "contains" in obj || "equals" in obj)) {
      // treat as equality map for nested — handled separately
    }
  };

  for (const [key, val] of Object.entries(where)) {
    if (key === "OR" && Array.isArray(val)) {
      const orParts: string[] = [];
      for (const branch of val as Record<string, WhereValue>[]) {
        const built = buildWhere(table, branch, alias);
        orParts.push(`(${built.sql})`);
        args.push(...built.args);
      }
      parts.push(`(${orParts.join(" OR ")})`);
      continue;
    }
    if (key === "AND" && Array.isArray(val)) {
      for (const branch of val as Record<string, WhereValue>[]) {
        const built = buildWhere(table, branch, alias);
        parts.push(`(${built.sql})`);
        args.push(...built.args);
      }
      continue;
    }
    if (key === "NOT") {
      if (Array.isArray(val)) {
        for (const branch of val as Record<string, WhereValue>[]) {
          const built = buildWhere(table, branch, alias);
          parts.push(`NOT (${built.sql})`);
          args.push(...built.args);
        }
      } else if (val && typeof val === "object") {
        const built = buildWhere(table, val as Record<string, WhereValue>, alias);
        parts.push(`NOT (${built.sql})`);
        args.push(...built.args);
      }
      continue;
    }
    // Nested: account: { userId }
    if (key === "account" && val && typeof val === "object" && !Array.isArray(val)) {
      const nested = val as Record<string, WhereValue>;
      for (const [nk, nv] of Object.entries(nested)) {
        parts.push(
          `EXISTS (SELECT 1 FROM "ConnectedAccount" _acc WHERE _acc."id" = "${alias}"."accountId" AND _acc."${nk}" = ?)`
        );
        args.push(toSql(nv));
      }
      continue;
    }
    pushCol(key, val);
  }

  return { sql: parts.length ? parts.join(" AND ") : "1=1", args };
}

function buildOrderBy(orderBy: OrderBy | undefined, alias: string): string {
  if (!orderBy) return "";
  const items = Array.isArray(orderBy) ? orderBy : [orderBy];
  const parts: string[] = [];
  for (const item of items) {
    for (const [col, dir] of Object.entries(item)) {
      parts.push(`"${alias}"."${col}" ${dir === "desc" ? "DESC" : "ASC"}`);
    }
  }
  return parts.length ? ` ORDER BY ${parts.join(", ")}` : "";
}

async function runQuery(sql: string, args: SqlValue[] = []): Promise<any[]> {
  const result = await turso.execute({ sql, args });
  return result.rows.map((r: any) => coerceRow({ ...(r as unknown as Row) }));
}

async function runExecute(sql: string, args: SqlValue[] = []): Promise<void> {
  await turso.execute({ sql, args });
}

function model(table: string): any {
  return {
    async findUnique(opts: {
      where: Record<string, WhereValue>;
      select?: Record<string, unknown>;
      include?: Record<string, unknown>;
    }): Promise<any | null> {
      const where = buildWhere(table, opts.where);
      const rows = await runQuery(
        `SELECT * FROM "${table}" WHERE ${where.sql} LIMIT 1`,
        where.args
      );
      if (!rows[0]) return null;
      return attachIncludes(table, pick(rows[0], opts.select), opts.include);
    },

    async findFirst(opts: {
      where?: Record<string, WhereValue>;
      select?: Record<string, unknown>;
      include?: Record<string, unknown>;
      orderBy?: OrderBy;
    } = {}): Promise<any | null> {
      const where = buildWhere(table, opts.where);
      const order = buildOrderBy(opts.orderBy, table);
      const rows = await runQuery(
        `SELECT * FROM "${table}" WHERE ${where.sql}${order} LIMIT 1`,
        where.args
      );
      if (!rows[0]) return null;
      return attachIncludes(table, pick(rows[0], opts.select), opts.include);
    },

    async findMany(opts: {
      where?: Record<string, WhereValue>;
      select?: Record<string, unknown>;
      include?: Record<string, unknown>;
      orderBy?: OrderBy;
      take?: number;
    } = {}): Promise<any[]> {
      const where = buildWhere(table, opts.where);
      const order = buildOrderBy(opts.orderBy, table);
      const limit = opts.take != null ? ` LIMIT ${Number(opts.take)}` : "";
      const rows = await runQuery(
        `SELECT * FROM "${table}" WHERE ${where.sql}${order}${limit}`,
        where.args
      );
      const out: any[] = [];
      for (const row of rows) {
        out.push(
          await attachIncludes(table, pick(row, opts.select), opts.include)
        );
      }
      return out;
    },

    async create(opts: {
      data: Record<string, unknown>;
      select?: Record<string, unknown>;
      include?: Record<string, unknown>;
    }): Promise<any> {
      const data = { ...opts.data };
      if (!data.id) data.id = uuid();
      const now = nowIso();
      if (tableHas(table, "createdAt") && data.createdAt == null) data.createdAt = now;
      if (tableHas(table, "updatedAt") && data.updatedAt == null) data.updatedAt = now;
      if (tableHas(table, "lastSyncedAt") && data.lastSyncedAt == null) data.lastSyncedAt = now;

      const cols = Object.keys(data);
      const placeholders = cols.map(() => "?").join(", ");
      await runExecute(
        `INSERT INTO "${table}" (${cols.map((c: any) => `"${c}"`).join(", ")}) VALUES (${placeholders})`,
        cols.map((c: any) => toSql(data[c]))
      );
      const row = await this.findUnique({
        where: { id: data.id as string },
        select: opts.select,
        include: opts.include,
      });
      return row!;
    },

    async update(opts: {
      where: Record<string, WhereValue>;
      data: Record<string, unknown>;
      select?: Record<string, unknown>;
      include?: Record<string, unknown>;
    }): Promise<any | null> {
      const data = { ...opts.data };
      if (tableHas(table, "updatedAt")) data.updatedAt = nowIso();
      const cols = Object.keys(data);
      if (!cols.length) {
        return this.findFirst({ where: opts.where, select: opts.select, include: opts.include });
      }
      const where = buildWhere(table, opts.where);
      await runExecute(
        `UPDATE "${table}" SET ${cols.map((c: any) => `"${c}" = ?`).join(", ")} WHERE ${where.sql}`,
        [...cols.map((c: any) => toSql(data[c])), ...where.args]
      );
      return this.findFirst({
        where: opts.where,
        select: opts.select,
        include: opts.include,
      });
    },

    async updateMany(opts: {
      where: Record<string, WhereValue>;
      data: Record<string, unknown>;
    }) {
      const data = { ...opts.data };
      if (tableHas(table, "updatedAt")) data.updatedAt = nowIso();
      const cols = Object.keys(data);
      if (!cols.length) return { count: 0 };
      const where = buildWhere(table, opts.where);
      await runExecute(
        `UPDATE "${table}" SET ${cols.map((c: any) => `"${c}" = ?`).join(", ")} WHERE ${where.sql}`,
        [...cols.map((c: any) => toSql(data[c])), ...where.args]
      );
      return { count: 1 };
    },

    async delete(opts: { where: Record<string, WhereValue> }) {
      const existing = await this.findFirst({ where: opts.where });
      const where = buildWhere(table, opts.where);
      await runExecute(`DELETE FROM "${table}" WHERE ${where.sql}`, where.args);
      return existing;
    },

    async deleteMany(opts: { where?: Record<string, WhereValue> } = {}) {
      const where = buildWhere(table, opts.where);
      await runExecute(`DELETE FROM "${table}" WHERE ${where.sql}`, where.args);
      return { count: 1 };
    },

    async count(opts: { where?: Record<string, WhereValue> } = {}) {
      const where = buildWhere(table, opts.where);
      const rows = await runQuery(
        `SELECT COUNT(*) as c FROM "${table}" WHERE ${where.sql}`,
        where.args
      );
      return Number(rows[0]?.c ?? 0);
    },

    async upsert(opts: {
      where: Record<string, WhereValue>;
      create: Record<string, unknown>;
      update: Record<string, unknown>;
      select?: Record<string, unknown>;
    }): Promise<any> {
      const existing = await this.findFirst({ where: opts.where });
      if (existing) {
        if (Object.keys(opts.update).length === 0) {
          return pick(existing, opts.select);
        }
        return this.update({
          where: { id: existing.id as string },
          data: opts.update,
          select: opts.select,
        });
      }
      return this.create({ data: opts.create, select: opts.select });
    },
  };
}

const TABLES_WITH_DATES = new Set([
  "User",
  "ConnectedAccount",
  "DeviceSession",
  "DeviceWorker",
  "GroupPreset",
  "ScheduledPost",
  "PublishedGroupPost",
  "Campaign",
]);

function tableHas(table: string, col: string): boolean {
  if (col === "createdAt" || col === "updatedAt") return TABLES_WITH_DATES.has(table);
  if (col === "lastSyncedAt") return table === "ConnectedAccount";
  return false;
}

async function attachIncludes(
  table: string,
  row: Row | null,
  include?: Record<string, unknown>
): Promise<Row | null> {
  if (!row) return null;
  if (!include) return row;
  const out = { ...row };

  if (include._count && typeof include._count === "object") {
    const countSel = (include._count as { select?: Record<string, boolean> }).select || {};
    const counts: Record<string, number> = {};
    if (countSel.channels) {
      const r = await runQuery(
        `SELECT COUNT(*) as c FROM "Channel" WHERE "accountId" = ?`,
        [toSql(row.id)]
      );
      counts.channels = Number(r[0]?.c ?? 0);
    }
    if (countSel.jobs) {
      const r = await runQuery(
        `SELECT COUNT(*) as c FROM "PublishJob" WHERE "campaignId" = ?`,
        [toSql(row.id)]
      );
      counts.jobs = Number(r[0]?.c ?? 0);
    }
    out._count = counts;
  }

  if (include.publishedPosts) {
    const pubInclude = include.publishedPosts;
    let whereSql = `"scheduledPostId" = ?`;
    const args: SqlValue[] = [toSql(row.id)];
    let order = ` ORDER BY "createdAt" DESC`;
    if (pubInclude && typeof pubInclude === "object") {
      const pi = pubInclude as {
        where?: Record<string, WhereValue>;
        orderBy?: OrderBy;
      };
      if (pi.where) {
        const built = buildWhere("PublishedGroupPost", pi.where, "PublishedGroupPost");
        whereSql += ` AND ${built.sql}`;
        args.push(...built.args);
      }
      if (pi.orderBy) order = buildOrderBy(pi.orderBy, "PublishedGroupPost");
    }
    out.publishedPosts = await runQuery(
      `SELECT * FROM "PublishedGroupPost" WHERE ${whereSql}${order}`,
      args
    );
  }

  if (include.user) {
    const users = await runQuery(`SELECT * FROM "User" WHERE "id" = ? LIMIT 1`, [
      toSql(row.userId),
    ]);
    let user = users[0] || null;
    if (
      user &&
      include.user &&
      typeof include.user === "object" &&
      (include.user as { include?: { deviceSession?: boolean } }).include
        ?.deviceSession
    ) {
      const sessions = await runQuery(
        `SELECT * FROM "DeviceSession" WHERE "userId" = ? LIMIT 1`,
        [toSql(user.id)]
      );
      user = { ...user, deviceSession: sessions[0] || null };
    }
    out.user = user;
  }

  if (include.deviceSession) {
    const sessions = await runQuery(
      `SELECT * FROM "DeviceSession" WHERE "userId" = ? LIMIT 1`,
      [toSql(row.id)]
    );
    out.deviceSession = sessions[0] || null;
  }

  return out;
}

export const db: any = {
  user: model("User"),
  connectedAccount: model("ConnectedAccount"),
  channel: model("Channel"),
  scheduledPost: model("ScheduledPost"),
  publishedGroupPost: model("PublishedGroupPost"),
  groupPreset: model("GroupPreset"),
  deviceSession: model("DeviceSession"),
  deviceWorker: model("DeviceWorker"),
  campaign: model("Campaign"),
  publishJob: model("PublishJob"),

  async $transaction(ops: any): Promise<any> {
    if (typeof ops === "function") {
      return ops(db);
    }
    const results: any[] = [];
    for (const op of ops) {
      results.push(await op);
    }
    return results;
  },

  async $disconnect(): Promise<void> {
    // no-op for serverless Turso client
  },
};
