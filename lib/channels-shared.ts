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

export function computeChannelStats(channels: ChannelDTO[]): ChannelStats {
  return {
    totalChannels: channels.length,
    activeChannels: channels.filter((c) => c.isActive).length,
    totalReach: channels
      .filter((c) => c.isActive)
      .reduce((sum, c) => sum + c.memberCount, 0),
  };
}
