"use client";

import {useId,type ReactNode} from "react";

/** All editor groups use one controlled disclosure contract. No option art. */
export function AvatarOptionCard({title,summary,expanded,onToggle,disabled=false,children}:{
  title:string;
  summary:string;
  expanded:boolean;
  onToggle:()=>void;
  disabled?:boolean;
  children:ReactNode;
}) {
  const id=useId();
  return (
    <section className="rounded-2xl border border-[#E6EAF0] bg-white">
      <button type="button" aria-expanded={expanded} aria-controls={id}
        disabled={disabled} onClick={onToggle}
        className="flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6D55A3] disabled:opacity-50">
        <span className="shrink-0 font-bold text-[#1F2937]">{title}</span>
        <span className="min-w-0 flex-1 break-words text-right text-xs font-medium text-[#7B7B74]">{summary}</span>
        <span aria-hidden="true" className="shrink-0 font-bold text-[#6D55A3]">{expanded ? "−" : "+"}</span>
      </button>
      <div id={id} hidden={!expanded}>
        {expanded ? <div className="border-t border-[#E6EAF0] p-3">{children}</div> : null}
      </div>
    </section>
  );
}

export type AvatarTextChoice = {id:string;label:string;selected:boolean};
export function AvatarTextChoices<T extends AvatarTextChoice>({choices,onSelect,disabled=false}:{
  choices:readonly T[];
  onSelect:(choice:T)=>void;
  disabled?:boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {choices.map(choice=>(
        <button key={choice.id} type="button" aria-pressed={choice.selected}
          onClick={()=>onSelect(choice)} disabled={disabled}
          className={`min-h-11 rounded-xl border px-2 py-2 text-center text-sm font-bold transition disabled:opacity-50 ${choice.selected ? "border-[#6D55A3]/30 bg-[#F3EEFF] text-[#6D55A3]" : "border-[#E6EAF0] bg-white text-[#52545B]"}`}>
          {choice.selected ? "✓ " : ""}{choice.label}
        </button>
      ))}
    </div>
  );
}
