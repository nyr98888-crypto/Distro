import { parseStringArray } from "@/lib/json-fields";
import { asArray, asString, safeIso } from "@/lib/safe";
import type { ScheduleType } from "@/lib/schedule-engine";

export const SCHEDULED_POST_STATUSES = [
  "pending",
  "running",
  "paused",
  "completed",
  "failed",
  "cancelled",
] as const;

export type ScheduledPostStatus = (typeof SCHEDULED_POST_STATUSES)[number];

export type ScheduledGroupRef = {
  id: string;
  name: string;
  externalId?: string;
  url?: string;
};

export type PublishedGroupPostDTO = {
  id: string;
  groupId: string;
  groupName: string;
  groupExternalId: string;
  postUrl: string;
  postFbId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type ScheduledPostDTO = {
  id: string;
  name: string;
  content: string;
  imageUrl: string;
  targetGroups: ScheduledGroupRef[];
  scheduledTime: string;
  delaySeconds: number;
  status: ScheduledPostStatus;
  errorMessage: string;
  scheduleType: ScheduleType;
  daysOfWeek: number[];
  runTime: string;
  endDate: string | null;
  maxRuns: number | null;
  runsCount: number;
  isActive: boolean;
  nextRunAt: string | null;
  executionMode: "extension" | "cloud";
  publishedPosts: PublishedGroupPostDTO[];
  createdAt: string;
  updatedAt: string;
};

export type ScheduledPostRow = {
  id: string;
  name: string;
  content: string;
  imageUrl: string;
  targetGroups: string;
  scheduledTime: Date;
  delaySeconds: number;
  status: string;
  errorMessage: string;
  scheduleType: string;
  daysOfWeek: string;
  runTime: string;
  endDate: Date | null;
  maxRuns: number | null;
  runsCount: number;
  isActive: boolean;
  nextRunAt: Date | null;
  executionMode?: string;
  accountId?: string | null;
  whatsappJson?: string | null;
  createdAt: Date;
  updatedAt: Date;
  publishedPosts?: Array<{
    id: string;
    groupId: string;
    groupName: string;
    groupExternalId: string;
    postUrl: string;
    postFbId: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }>;
};

export type CampaignLifecycleFilter = "active" | "paused" | "completed" | "all";

export function statusLabelHe(status: string): string {
  switch (status) {
    case "pending":
      return "ממתין";
    case "running":
      return "רץ";
    case "paused":
      return "מושהה";
    case "completed":
      return "הושלם";
    case "failed":
      return "נכשל";
    case "cancelled":
      return "בוטל";
    default:
      return status;
  }
}

export function statusTone(status: string): string {
  switch (status) {
    case "pending":
      return "bg-sky-100 text-sky-800 border-sky-200";
    case "running":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "paused":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "completed":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "failed":
      return "bg-rose-100 text-rose-800 border-rose-200";
    case "cancelled":
      return "bg-slate-100 text-slate-600 border-slate-200";
    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
}

export function campaignFilterLabel(filter: CampaignLifecycleFilter): string {
  switch (filter) {
    case "active":
      return "פעיל";
    case "paused":
      return "מושהה";
    case "completed":
      return "הסתיים";
    default:
      return "הכל";
  }
}

export function matchesCampaignFilter(
  post: Pick<ScheduledPostDTO, "status" | "isActive">,
  filter: CampaignLifecycleFilter
): boolean {
  if (filter === "all") return true;
  if (filter === "paused") return post.status === "paused";
  if (filter === "active") {
    return (
      post.isActive &&
      (post.status === "pending" || post.status === "running")
    );
  }
  return (
    post.status === "completed" ||
    post.status === "cancelled" ||
    (post.status !== "paused" && !post.isActive)
  );
}

export function parseTargetGroups(raw: string): ScheduledGroupRef[] {
  try {
    const parsed: unknown = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item: any) => {
        if (typeof item === "string") {
          return { id: item, name: item };
        }
        if (item && typeof item === "object") {
          const obj = item as Record<string, unknown>;
          const id = String(obj.id || obj.externalId || "");
          const name = String(obj.name || id);
          if (!id) return null;
          return {
            id,
            name,
            externalId:
              typeof obj.externalId === "string" ? obj.externalId : undefined,
            url: typeof obj.url === "string" ? obj.url : undefined,
          };
        }
        return null;
      })
      .filter((g): g is ScheduledGroupRef => Boolean(g));
  } catch {
    return parseStringArray(raw).map((id: any) => ({ id, name: id }));
  }
}

export function parseDaysOfWeek(raw: string): number[] {
  try {
    const parsed: unknown = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((n: any) => Number(n))
      .filter((n: any) => Number.isInteger(n) && n >= 0 && n <= 6);
  } catch {
    return [];
  }
}

export function cadenceLabelHe(
  post: Pick<
    ScheduledPostDTO,
    "scheduleType" | "daysOfWeek" | "runTime" | "status" | "isActive" | "nextRunAt"
  >
): string {
  if (post.status === "paused") return "מושהה";
  if (!post.isActive) return "לא פעיל";
  if (post.scheduleType === "recurring") {
    const days = asArray(post?.daysOfWeek)
      .map((d: any) => ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"][d] || "")
      .filter(Boolean)
      .join(", ");
    return `רץ כל ${days || "יום"} ב־${post.runTime || "07:00"}`;
  }
  if (post.scheduleType === "immediate") {
    return "פרסום מיידי";
  }
  if (post.nextRunAt) {
    return `מתוזמן ל־${new Date(post.nextRunAt).toLocaleString("he-IL")}`;
  }
  return "חד־פעמי";
}

export function toPublishedGroupPostDTO(
  row: NonNullable<ScheduledPostRow["publishedPosts"]>[number]
): PublishedGroupPostDTO {
  const now = new Date().toISOString();
  return {
    id: asString(row?.id),
    groupId: asString(row?.groupId),
    groupName: asString(row?.groupName),
    groupExternalId: asString(row?.groupExternalId),
    postUrl: asString(row?.postUrl),
    postFbId: asString(row?.postFbId),
    status: asString(row?.status, "live"),
    createdAt: safeIso(row?.createdAt, now) || now,
    updatedAt: safeIso(row?.updatedAt, now) || now,
  };
}

export function toScheduledPostDTO(row: ScheduledPostRow): ScheduledPostDTO {
  const now = new Date().toISOString();
  const scheduledTime =
    safeIso(row?.scheduledTime, now) || now;
  return {
    id: asString(row?.id),
    name: asString(row?.name),
    content: asString(row?.content),
    imageUrl: asString(row?.imageUrl),
    targetGroups: parseTargetGroups(
      typeof row?.targetGroups === "string"
        ? row.targetGroups
        : JSON.stringify(row?.targetGroups ?? [])
    ),
    scheduledTime,
    delaySeconds: Number(row?.delaySeconds ?? 60) || 60,
    status: (asString(row?.status, "pending") as ScheduledPostStatus) || "pending",
    errorMessage: asString(row?.errorMessage),
    scheduleType: (row?.scheduleType === "recurring"
      ? "recurring"
      : row?.scheduleType === "immediate"
        ? "immediate"
        : "once") as ScheduleType,
    daysOfWeek: parseDaysOfWeek(
      typeof row?.daysOfWeek === "string"
        ? row.daysOfWeek
        : JSON.stringify(row?.daysOfWeek ?? [])
    ),
    runTime: asString(row?.runTime, "07:00") || "07:00",
    endDate: safeIso(row?.endDate, null),
    maxRuns: row?.maxRuns == null ? null : Number(row.maxRuns),
    runsCount: Number(row?.runsCount ?? 0) || 0,
    isActive: Boolean(row?.isActive),
    nextRunAt: safeIso(row?.nextRunAt, null),
    executionMode: row?.executionMode === "cloud" ? "cloud" : "extension",
    publishedPosts: asArray(row?.publishedPosts).map(toPublishedGroupPostDTO),
    createdAt: safeIso(row?.createdAt, now) || now,
    updatedAt: safeIso(row?.updatedAt, now) || now,
  };
}

export function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
