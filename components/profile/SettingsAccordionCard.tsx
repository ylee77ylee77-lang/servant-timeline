"use client";

import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

type SettingsAccordionCardProps = {
  panelId: string;
  title: string;
  summary: string;
  icon: ReactNode;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
};

/** One accessible, independently controlled card for all personal settings. */
export function SettingsAccordionCard({
  panelId,
  title,
  summary,
  icon,
  expanded,
  onToggle,
  children,
}: SettingsAccordionCardProps) {
  return (
    <section className="rounded-[24px] border border-[#E6EAF0] bg-white p-4 shadow-lg shadow-[#6D55A3]/5 sm:p-5">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={onToggle}
        className="flex min-h-[52px] w-full items-center gap-3 rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6D55A3] focus-visible:ring-offset-2"
      >
        <span className="shrink-0" aria-hidden="true">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-black text-[#1F2937]">{title}</span>
          <span className="mt-1 block text-xs font-medium leading-4 text-[#7B7B74]">{summary}</span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`h-5 w-5 shrink-0 text-[#6D55A3] transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
        />
      </button>
      <div id={panelId} hidden={!expanded} className={expanded ? "mt-4 border-t border-[#E6EAF0] pt-4" : undefined}>
        {expanded ? children : null}
      </div>
    </section>
  );
}
