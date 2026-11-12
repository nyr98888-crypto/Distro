import "server-only";

import { db } from "@/lib/db";
import { parseStringArray } from "@/lib/json-fields";
import type { ChannelDTO } from "@/lib/channels-shared";

export type { ChannelDTO, ChannelStats } from "@/lib/channels-shared";
export { computeChannelStats } from "@/lib/channels-shared";

/** Resolve the user's active ConnectedAccount (isActive preferred, else newest ACTIVE). */
export async function getActiveAccountId(
  userId: string,
  preferredAccountId?: string | null
): Promise<string | null> {
  if (preferredAccountId) {
    const preferred = await db.connectedAccount.findFirst({
      where: {
        id: preferredAccountId,
        userId,
        status: "ACTIVE",
      },
      select: { id: true },
    });
    if (preferred) return preferred.id;
  }

  const selected = await db.connectedAccount.findFirst({
    where: { userId, status: "ACTIVE", isActive: true },
    select: { id: true },
  });
  if (selected) return selected.id;

  const account = await db.connectedAccount.findFirst({
    where: { userId, status: "ACTIVE" },
    orderBy: { lastSyncedAt: "desc" },
    select: { id: true },
  });

  return account?.id ?? null;
}

export function toChannelDTO(row: {
  id: string;
  accountId: string;
  externalId: string;
  name: string;
  url?: string | null;
  memberCount: number;
  categoryTags: string;
  isApprovalRequired: boolean;
  isActive: boolean;
}): ChannelDTO {
  const externalId = String(row?.externalId ?? "");
  const url =
    (row?.url && String(row.url).trim()) ||
    (externalId
      ? `https://www.facebook.com/groups/${externalId}`
      : "");
  return {
    id: String(row?.id ?? ""),
    accountId: String(row?.accountId ?? ""),
    externalId,
    name: String(row?.name ?? ""),
    url,
    memberCount: Number(row?.memberCount) || 0,
    categoryTags: parseStringArray(row?.categoryTags ?? "[]"),
    isApprovalRequired: Boolean(row?.isApprovalRequired),
    isActive: row?.isActive !== false,
  };
}

export async function listChannelsForAccount(
  accountId: string
): Promise<ChannelDTO[]> {
  if (!accountId) return [];
  const rows = await db.channel.findMany({
    where: {
      accountId,
      // Real Facebook group ids are numeric — hide leftover mock/seed rows
      NOT: {
        OR: [
          { externalId: { startsWith: "fb_15_group_" } },
          { externalId: { startsWith: "fb_il_" } },
          { externalId: { startsWith: "fb_group_" } },
        ],
      },
    },
    orderBy: [{ isActive: "desc" }, { memberCount: "desc" }, { name: "asc" }],
  });
  return (Array.isArray(rows) ? rows : [])
    .filter((row: any) => /^\d{5,}$/.test(String(row?.externalId ?? "")))
    .map(toChannelDTO);
}
