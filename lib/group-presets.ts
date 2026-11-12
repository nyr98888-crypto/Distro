import { parseStringArray } from "@/lib/json-fields";
import { asString, safeIso } from "@/lib/safe";

export type GroupPresetDTO = {
  id: string;
  name: string;
  groupIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type GroupPresetRow = {
  id: string;
  name: string;
  groupIds: string;
  createdAt: Date;
  updatedAt: Date;
};

export function toGroupPresetDTO(row: GroupPresetRow): GroupPresetDTO {
  const now = new Date().toISOString();
  return {
    id: asString(row?.id),
    name: asString(row?.name),
    groupIds: parseStringArray(row?.groupIds ?? "[]"),
    createdAt: safeIso(row?.createdAt, now) || now,
    updatedAt: safeIso(row?.updatedAt, now) || now,
  };
}
