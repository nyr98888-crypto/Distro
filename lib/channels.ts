import "server-only";

import { prisma } from "@/lib/prisma";
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
    const preferred = await prisma.connectedAccount.findFirst({
      where: {
        id: preferredAccountId,
        userId,
        status: "ACTIVE",
      },
      select: { id: true },
    });
    if (preferred) return preferred.id;
  }

  const selected = await prisma.connectedAccount.findFirst({
    where: { userId, status: "ACTIVE", isActive: true },
    select: { id: true },
  });
  if (selected) return selected.id;

  const account = await prisma.connectedAccount.findFirst({
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
  const url =
    (row.url && String(row.url).trim()) ||
    (row.externalId
      ? `https://www.facebook.com/groups/${row.externalId}`
      : "");
  return {
    id: row.id,
    accountId: row.accountId,
    externalId: row.externalId,
    name: row.name,
    url,
    memberCount: row.memberCount,
    categoryTags: parseStringArray(row.categoryTags),
    isApprovalRequired: row.isApprovalRequired,
    isActive: row.isActive,
  };
}

export async function listChannelsForAccount(
  accountId: string
): Promise<ChannelDTO[]> {
  const rows = await prisma.channel.findMany({
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
  return rows
    .filter((row) => /^\d{5,}$/.test(row.externalId))
    .map(toChannelDTO);
}
