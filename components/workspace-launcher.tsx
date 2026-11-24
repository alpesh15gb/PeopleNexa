"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Plus, Search } from "lucide-react";
import { Modal } from "@/components/ui/modal";

export type WorkspaceDestination = {
  href: string;
  label: string;
  group?: string;
  description?: string;
  icon: ReactNode;
};

export function WorkspaceLauncher({ actions, pages }: { actions: WorkspaceDestination[]; pages: WorkspaceDestination[] }) {
  const router = useRouter();
  const [actionsOnly, setActionsOnly] = useState(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const search = query.trim().toLowerCase().replace(/\s+/g, " ");
  const terms = search.split(" ").filter(Boolean);
  const rank = (destinations: WorkspaceDestination[]) => destinations.flatMap((destination) => {
    const { label, group, description } = destination;
    const name = label.toLowerCase();
    const searchable = `${name} ${group ?? ""} ${description ?? ""}`.toLowerCase();
    if (!terms.every((term) => searchable.includes(term))) return [];
    let score = 0;
    if (search) {
      if (name === search) score = 4;
      else if (name.startsWith(search)) score = 3;
      else if (name.includes(search)) score = 2;
      else if (terms.every((term) => name.includes(term))) score = 1;
    }
    return [{ destination, score }];
  }).sort((left, right) => right.score - left.score);
  const visibleActions = rank(actions);
  const visiblePages = rank(pages);
  const directory = pages.find((page) => page.href === "/admin/employee-master");
  const directoryResults = directory && search ? [{ score: -1, destination: {
    ...directory, href: directory.href + "?" + new URLSearchParams({ q: query.trim() }),
    label: "Search employee directory", description: query.trim(),
  } }] : [];
  const groups = [
    { title: "People", results: actionsOnly ? [] : directoryResults },
    { title: "Common actions", results: visibleActions },
    { title: "Workspace pages", results: actionsOnly ? [] : visiblePages },
  ].filter(({ results }) => results.length > 0)
    .sort((left, right) => right.results[0].score - left.results[0].score);
  const first = groups[0]?.results[0].destination;

  useEffect(() => {
    function openWithShortcut(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "k" || event.altKey || event.shiftKey) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      event.preventDefault();
      setActionsOnly(false);
      setQuery("");
      setOpen(true);
    }
    window.addEventListener("keydown", openWithShortcut);
    return () => window.removeEventListener("keydown", openWithShortcut);
  }, []);

  function openFirst(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!first) return;
    setOpen(false);
    router.push(first.href);
  }

  function destination(item: WorkspaceDestination) {
    return (
      <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className="group flex min-h-12 items-center gap-3 rounded-lg px-3 py-2 text-sm outline-none hover:bg-tint focus-visible:ring-2 focus-visible:ring-ring">
        <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">{item.icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{item.label}</span>
          {(item.description || item.group) && <span className="block truncate text-xs text-muted-foreground">{item.description || item.group}</span>}
        </span>
        <ArrowUpRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" />
      </Link>
    );
  }

  return (
    <>
      {actions.length > 0 && <button type="button" aria-label="Quick actions" title="Quick actions" aria-haspopup="dialog"
        className="hidden size-11 shrink-0 items-center justify-center rounded-lg border border-edge text-lg hover:bg-tint sm:flex"
        onClick={() => { setActionsOnly(true); setQuery(""); setOpen(true); }}><Plus aria-hidden="true" className="size-4" /></button>}
      <button type="button" aria-label="Find a page or action" aria-haspopup="dialog" aria-keyshortcuts="Control+K Meta+K" onClick={() => { setActionsOnly(false); setQuery(""); setOpen(true); }}
        className="flex h-11 shrink-0 items-center gap-2 rounded-lg border border-edge bg-card px-3 text-sm text-muted-foreground hover:border-primary/35 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Search aria-hidden="true" className="size-4" />
        <span className="hidden lg:inline">Search workspace</span>
        <kbd className="ml-2 hidden rounded border border-edge bg-tint px-1.5 py-0.5 text-[10px] xl:inline">Ctrl K</kbd>
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={actionsOnly ? "Quick actions" : "Find a page or action"} initialFocus={input} size="lg">
        <form onSubmit={openFirst}>
          <label className="sr-only" htmlFor="workspace-launcher-search">Search pages and actions</label>
          <input id="workspace-launcher-search" ref={input} type="search" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search pages and actions…"
            className="h-11 w-full rounded-lg border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </form>
        <div className="mt-4 space-y-4">
          {groups.map(({ title, results }) => (
            <section key={title} aria-label={title}>
              <h3 className="mb-1 px-3 text-xs font-semibold text-muted-foreground">{title}</h3>
              {results.map((result) => destination(result.destination))}
            </section>
          ))}
          {!first && <p role="status" className="px-3 py-5 text-sm text-muted-foreground">No pages or actions match your search.</p>}
        </div>
      </Modal>
    </>
  );
}
