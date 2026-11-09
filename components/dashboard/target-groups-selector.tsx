"use client";

import * as React from "react";

export type TargetGroup = {
  id: string;
  name: string;
  memberCount?: number;
};

type TargetGroupsSelectorProps = {
  groups: TargetGroup[];
  selectedGroupIds: string[];
  onSelectionChange: (ids: string[]) => void;
  disabled?: boolean;
};

export function TargetGroupsSelector({
  groups,
  selectedGroupIds,
  onSelectionChange,
  disabled,
}: TargetGroupsSelectorProps) {
  const [searchQuery, setSearchQuery] = React.useState("");

  const filteredGroups = React.useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return groups;
    return groups.filter((g) => g.name.toLowerCase().includes(q));
  }, [groups, searchQuery]);

  const toggleGroup = (id: string) => {
    if (disabled) return;
    if (selectedGroupIds.includes(id)) {
      onSelectionChange(selectedGroupIds.filter((item) => item !== id));
    } else {
      onSelectionChange([...selectedGroupIds, id]);
    }
  };

  const allFilteredSelected =
    filteredGroups.length > 0 &&
    filteredGroups.every((g) => selectedGroupIds.includes(g.id));

  const toggleSelectFiltered = () => {
    if (disabled) return;
    if (allFilteredSelected) {
      const filteredIds = new Set(filteredGroups.map((g) => g.id));
      onSelectionChange(selectedGroupIds.filter((id) => !filteredIds.has(id)));
    } else {
      const combined = new Set([
        ...selectedGroupIds,
        ...filteredGroups.map((g) => g.id),
      ]);
      onSelectionChange(Array.from(combined));
    }
  };

  return (
    <div
      dir="rtl"
      className="w-full rounded-xl border border-[#e4e6eb] bg-white p-4 text-right shadow-sm"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-[#050505]">
          קבוצות יעד ({selectedGroupIds.length}/{groups.length} נבחרו)
        </h4>
        <button
          type="button"
          onClick={toggleSelectFiltered}
          disabled={disabled || filteredGroups.length === 0}
          className="text-xs font-medium text-[#1877f2] hover:underline disabled:opacity-50"
        >
          {allFilteredSelected ? "בטל בחירה לתוצאות" : "בחר הכל מהתוצאות"}
        </button>
      </div>

      <div className="relative mb-3">
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="חפש קבוצה לפי שם..."
          disabled={disabled}
          className="w-full rounded-lg border border-transparent bg-[#f0f2f5] py-2 pr-9 pl-8 text-xs text-[#050505] outline-none transition-all placeholder:text-[#65676b] focus:border-[#1877f2] focus:bg-white disabled:opacity-50"
        />
        <span className="pointer-events-none absolute top-2.5 right-2.5 text-[#65676b]">
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </span>
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            disabled={disabled}
            className="absolute top-2.5 left-2.5 text-xs text-[#65676b] hover:text-[#050505] disabled:opacity-50"
            aria-label="נקה חיפוש"
          >
            ✕
          </button>
        )}
      </div>

      <div className="no-scrollbar max-h-60 space-y-1 overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {groups.length === 0 ? (
          <div className="py-6 text-center text-xs text-[#65676b]">
            אין קבוצות פעילות זמינות.
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="py-6 text-center text-xs text-[#65676b]">
            לא נמצאו קבוצות התואמות לחיפוש
            {searchQuery ? ` (“${searchQuery}”)` : ""}
          </div>
        ) : (
          filteredGroups.map((group) => {
            const isSelected = selectedGroupIds.includes(group.id);
            return (
              <label
                key={group.id}
                className={`flex cursor-pointer items-center justify-between rounded-lg p-2 text-xs transition-colors select-none ${
                  isSelected
                    ? "bg-[#e7f3ff] font-medium text-[#1877f2]"
                    : "text-[#050505] hover:bg-[#f0f2f5]"
                } ${disabled ? "pointer-events-none opacity-50" : ""}`}
              >
                <div className="flex min-w-0 items-center gap-2 truncate">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={disabled}
                    onChange={() => toggleGroup(group.id)}
                    className="h-4 w-4 cursor-pointer rounded accent-[#1877f2]"
                  />
                  <span className="truncate">{group.name}</span>
                </div>
                {typeof group.memberCount === "number" &&
                  group.memberCount > 0 && (
                    <span className="shrink-0 text-[11px] text-[#65676b]">
                      {group.memberCount.toLocaleString("he-IL")} חברים
                    </span>
                  )}
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}
