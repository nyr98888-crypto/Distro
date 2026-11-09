import { redirect } from "next/navigation";

type ComposePageProps = {
  searchParams?: Promise<{ edit?: string; new?: string; date?: string; tab?: string }>;
};

/** Legacy compose URL → campaigns home (wizard opens via ?new=1 / ?edit=). */
export default async function ComposePage({ searchParams }: ComposePageProps) {
  const params = (await searchParams) || {};
  const qs = new URLSearchParams();
  if (params.edit) qs.set("edit", params.edit);
  else if (params.tab === "manage") {
    /* manage is now the campaigns table */
  } else {
    qs.set("new", "1");
  }
  if (params.date) qs.set("date", params.date);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  redirect(`/dashboard/campaigns${suffix}`);
}
