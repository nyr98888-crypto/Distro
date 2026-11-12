/** Client-safe channel types and helpers (no Prisma / libsql imports). */

export type ChannelDTO = {
  id: string;
  accountId: string;
  externalId: string;
  name: string;
  url: string;
  memberCount: number;
  categoryTags: string[];
  isApprovalRequired: boolean;
  isActive: boolean;
};

export type ChannelStats = {
  totalChannels: number;
  activeChannels: number;
  totalReach: number;
};

export function computeChannelStats(
  channels: ChannelDTO[] | null | undefined
): ChannelStats {
  const list = Array.isArray(channels) ? channels : [];
  return {
    totalChannels: list.length,
    activeChannels: list.filter((c) => c?.isActive).length,
    totalReach: list
      .filter((c) => c?.isActive)
      .reduce((sum, c) => sum + (Number(c?.memberCount) || 0), 0),
  };
}
