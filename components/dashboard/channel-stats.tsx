import type { ChannelStats } from "@/lib/channels-shared";

type ChannelStatsCardsProps = {
  stats: ChannelStats;
};

function formatNumber(n: number): string {
  return n.toLocaleString("he-IL");
}

const cards: {
  key: keyof ChannelStats;
  label: string;
  hint: string;
}[] = [
  {
    key: "totalChannels",
    label: "סה״כ קבוצות",
    hint: "כל הקבוצות שסונכרנו",
  },
  {
    key: "activeChannels",
    label: "קבוצות פעילות",
    hint: "זמינות להפצה",
  },
  {
    key: "totalReach",
    label: "חשיפה פוטנציאלית",
    hint: "סכום חברים בקבוצות פעילות",
  },
];

export function ChannelStatsCards({ stats }: ChannelStatsCardsProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {cards.map((card) => (
        <div
          key={card.key}
          className="rounded-lg border border-border bg-card px-4 py-3 text-right shadow-sm"
        >
          <p className="text-xs font-medium tracking-wide text-muted-foreground">
            {card.label}
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
            {formatNumber(stats[card.key])}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{card.hint}</p>
        </div>
      ))}
    </div>
  );
}
