import { parseStringArray } from "@/lib/json-fields";

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
  return {
    id: row.id,
    name: row.name,
    groupIds: parseStringArray(row.groupIds),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
