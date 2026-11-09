/** Shared DISTRO hybrid campaign types (dashboard + extension contracts). */

export type ScheduleType = "immediate" | "once" | "recurring";
export type CampaignStatus = "active" | "paused" | "completed" | "draft";
export type ExecutionMode = "extension" | "cloud";

export type WhatsAppConfig = {
  enabled: boolean;
  phone: string;
  customMessage: string;
};

export type DistroCampaign = {
  id: string;
  name: string;
  content: string;
  imageUrl?: string;
  whatsappConfig: WhatsAppConfig;
  targetGroupIds: string[];
  scheduleType: ScheduleType;
  runTime?: string;
  targetDays?: number[];
  endDate?: string;
  maxRuns?: number | null;
  groupDelaySeconds: number;
  status: CampaignStatus;
  nextRunAt: string | null;
  runsCount: number;
  executionMode: ExecutionMode;
};

export type DistroGroupPreset = {
  id: string;
  name: string;
  groupIds: string[];
};

export type DeviceSessionDTO = {
  userId: string;
  lastExtensionPing: string;
  isOnline: boolean;
  extensionVersion: string;
};

/** Extension is considered online if pinged within this window. */
export const EXTENSION_ONLINE_MS = 20 * 60 * 1000;

/** Missed runs are eligible for catch-up within this window. */
export const CATCHUP_WINDOW_MS = 12 * 60 * 60 * 1000;
