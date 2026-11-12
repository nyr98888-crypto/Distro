"use client";

import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type RowSelectionState,
} from "@tanstack/react-table";
import { Search, Tag, Ban, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ChannelDTO } from "@/lib/channels-shared";

type ChannelTableProps = {
  channels: ChannelDTO[];
  accountId: string | null;
  onChannelsChange: React.Dispatch<React.SetStateAction<ChannelDTO[]>>;
};

function formatMembers(n: number): string {
  return n.toLocaleString("he-IL");
}

export function ChannelTable({
  channels,
  accountId,
  onChannelsChange,
}: ChannelTableProps) {
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  );
  const [nameFilter, setNameFilter] = React.useState("");
  const [tagFilter, setTagFilter] = React.useState<string>("__all__");
  const [bulkTag, setBulkTag] = React.useState("");
  const [showTagInput, setShowTagInput] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setColumnFilters([
      { id: "name", value: nameFilter },
      { id: "categoryTags", value: tagFilter },
    ]);
  }, [nameFilter, tagFilter]);

  const allTags = React.useMemo(() => {
    const set = new Set<string>();
    for (const ch of Array.isArray(channels) ? channels : []) {
      for (const tag of Array.isArray(ch?.categoryTags) ? ch.categoryTags : []) {
        if (tag) set.add(tag);
      }
    }
    return [...set].sort();
  }, [channels]);

  const patchChannels = React.useCallback(
    async (payload: {
      channelIds: string[];
      isActive?: boolean;
      addTags?: string[];
      categoryTags?: string[];
    }) => {
      if (!accountId) {
        setError("אין חשבון פעיל — התחברו תחילה כמשתמש בדיקה.");
        return null;
      }

      setPending(true);
      setError(null);
      try {
        const res = await fetch("/api/channels", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, accountId }),
        });
        const data = (await res.json()) as {
          success: boolean;
          error?: string;
          updated?: ChannelDTO[];
        };
        if (!res.ok || !data.success || !data.updated) {
          throw new Error(data.error ?? "העדכון נכשל");
        }

        const byId = new Map(data.updated.map((c) => [c.id, c]));
        onChannelsChange((prev) => prev.map((c) => byId.get(c.id) ?? c));
        return data.updated;
      } catch (err) {
        setError(err instanceof Error ? err.message : "העדכון נכשל");
        return null;
      } finally {
        setPending(false);
      }
    },
    [accountId, onChannelsChange]
  );

  const columns = React.useMemo<ColumnDef<ChannelDTO>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected()
                ? true
                : table.getIsSomePageRowsSelected()
                  ? "indeterminate"
                  : false
            }
            onCheckedChange={(value) => {
              table.toggleAllPageRowsSelected(!!value);
            }}
            aria-label="בחירת הכל"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => {
              row.toggleSelected(!!value);
            }}
            aria-label={`בחירת ${row.original.name}`}
          />
        ),
        enableSorting: false,
        size: 40,
      },
      {
        accessorKey: "name",
        header: "שם הקבוצה",
        cell: ({ row }) => (
          <div className="min-w-[10rem]">
            <p className="font-medium text-foreground">{row.original.name}</p>
            {row.original.isApprovalRequired && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                דורש אישור מנהל
              </p>
            )}
          </div>
        ),
        filterFn: (row, _id, value: string) => {
          if (!value) return true;
          return row.original.name
            .toLowerCase()
            .includes(String(value).toLowerCase());
        },
      },
      {
        accessorKey: "externalId",
        header: "מזהה קבוצה (ID)",
        cell: ({ getValue }) => (
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground" dir="ltr">
            {String(getValue())}
          </code>
        ),
      },
      {
        accessorKey: "memberCount",
        header: "חברים",
        cell: ({ getValue }) => (
          <span className="tabular-nums text-foreground">
            {formatMembers(Number(getValue()))}
          </span>
        ),
      },
      {
        accessorKey: "categoryTags",
        header: "תגיות",
        cell: ({ row }) => {
          const tags = row.original.categoryTags;
          if (tags.length === 0) {
            return (
              <span className="text-xs text-muted-foreground">אין תגיות</span>
            );
          }
          return (
            <div className="flex flex-wrap gap-1">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary">
                  {tag}
                </Badge>
              ))}
            </div>
          );
        },
        filterFn: (row, _id, value: string) => {
          if (!value || value === "__all__") return true;
          return row.original.categoryTags.includes(value);
        },
      },
      {
        accessorKey: "isActive",
        header: "סטטוס פעיל",
        cell: ({ row }) => (
          <Switch
            checked={row.original.isActive}
            disabled={pending || !accountId}
            onCheckedChange={(checked) => {
              void patchChannels({
                channelIds: [row.original.id],
                isActive: checked,
              });
            }}
            aria-label={`החלפת סטטוס ${row.original.name}`}
          />
        ),
      },
    ],
    [patchChannels, pending, accountId]
  );

  const table = useReactTable({
    data: channels,
    columns,
    state: {
      rowSelection,
      columnFilters,
    },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getRowId: (row) => row.id,
  });

  const selectedIds = table
    .getFilteredSelectedRowModel()
    .rows.map((r) => r.original.id);

  const handleAddTagToSelected = React.useCallback(async () => {
    const tag = bulkTag.trim();
    if (!tag || selectedIds.length === 0 || !accountId) return;
    const ok = await patchChannels({
      channelIds: selectedIds,
      addTags: [tag],
    });
    if (ok) {
      setBulkTag("");
      setShowTagInput(false);
      setRowSelection({});
    }
  }, [accountId, bulkTag, patchChannels, selectedIds]);

  const handleDeactivateSelected = React.useCallback(async () => {
    if (selectedIds.length === 0 || !accountId) return;
    const ok = await patchChannels({
      channelIds: selectedIds,
      isActive: false,
    });
    if (ok) setRowSelection({});
  }, [accountId, patchChannels, selectedIds]);

  const canMutate = Boolean(accountId) && !pending;

  return (
    <div className="space-y-4">
      {!accountId && (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          אין חשבון פעיל — עריכת קבוצות מושבתת עד להתחברות.
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="חיפוש לפי שם..."
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
            className="pr-8"
          />
        </div>

        <Select value={tagFilter} onValueChange={setTagFilter}>
          <SelectTrigger className="w-full sm:w-[11rem]">
            <SelectValue placeholder="סינון לפי תגית" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">כל התגיות</SelectItem>
            {allTags.map((tag) => (
              <SelectItem key={tag} value={tag}>
                {tag}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex flex-wrap items-center gap-2">
          {showTagInput ? (
            <div className="flex items-center gap-2">
              <Input
                placeholder="תגית חדשה"
                value={bulkTag}
                onChange={(e) => setBulkTag(e.target.value)}
                className="w-32"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleAddTagToSelected();
                  if (e.key === "Escape") setShowTagInput(false);
                }}
                autoFocus
              />
              <Button
                size="sm"
                disabled={
                  !canMutate || !bulkTag.trim() || selectedIds.length === 0
                }
                onClick={() => void handleAddTagToSelected()}
              >
                החל
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowTagInput(false)}
              >
                ביטול
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={!canMutate || selectedIds.length === 0}
              onClick={() => setShowTagInput(true)}
            >
              <Tag className="size-4" />
              הוסף תגית לנבחרים
              {selectedIds.length > 0 && (
                <span className="text-muted-foreground">
                  ({selectedIds.length})
                </span>
              )}
            </Button>
          )}

          <Button
            size="sm"
            variant="outline"
            disabled={!canMutate || selectedIds.length === 0}
            onClick={() => void handleDeactivateSelected()}
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Ban className="size-4" />
            )}
            השבת נבחרים
          </Button>
        </div>
      </div>

      {error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="text-right">
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  לא נמצאו קבוצות.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? "selected" : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="text-right">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
