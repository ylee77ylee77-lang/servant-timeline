const fs = require("fs");
const path = require("path");

const pagePath = path.join(process.cwd(), "app", "page.tsx");
let source = fs.readFileSync(pagePath, "utf8");
let changed = false;

const replaceOnce = (label, from, to) => {
  if (source.includes(to)) {
    console.log("[flow-inline-editor] " + label + " already patched.");
    return;
  }
  if (!source.includes(from)) {
    console.warn("[flow-inline-editor] " + label + " target not found; skipped.");
    return;
  }
  source = source.replace(from, to);
  changed = true;
  console.log("[flow-inline-editor] " + label + " patched.");
};

const replaceAllSafe = (label, from, to) => {
  if (!source.includes(from)) return;
  source = source.split(from).join(to);
  changed = true;
  console.log("[flow-inline-editor] " + label + " patched.");
};

replaceAllSafe(
  "remove block-level special fallback",
  "const itemIsSpecial = isSpecialChecklistItem(item.id) || isSpecialTaskBlock(node.id);",
  "const itemIsSpecial = isSpecialChecklistItem(item.id);"
);

replaceOnce(
  "shared checklist draft editor",
  `    if (!isAdminUnlocked || !isTimelineEditMode) {
      return <span className={styleClass}>{currentValue || "(未填寫)"}</span>;
    }

    if (isEditing) {`,
  String.raw`    if (!isAdminUnlocked || !isTimelineEditMode) {
      return <span className={styleClass}>{currentValue || "(未填寫)"}</span>;
    }

    if (type === 'checklist' && field === 'text' && checklistDraftEdit?.itemId === id) {
      const sourceNodeForDraft = nodes.find((node: any) => (node.checklist || []).some((item: any) => item.id === id));
      const draftSpecialStyle = getServiceSpecialStyle(sourceNodeForDraft?.service_type || currentService);

      return (
        <div className={"w-full p-3 rounded-2xl border space-y-2 " + (checklistDraftEdit?.mode === "special_only" ? draftSpecialStyle.panel : "bg-white border-[#E6EAF0]")}>
          <div className="flex items-center justify-between gap-2">
            <div className="text-[10px] font-black text-[#6D55A3] tracking-widest">流程上修改任務清單</div>
            {checklistDraftEdit?.mode === "special_only" && (
              <span className={"px-2 py-0.5 rounded-full border text-[9px] font-black " + draftSpecialStyle.badge}>此堂特殊</span>
            )}
          </div>
          <input
            type="text"
            value={checklistDraftEdit.text}
            onChange={e => setChecklistDraftEdit((prev: any) => prev ? { ...prev, text: e.target.value } : prev)}
            className="w-full px-2.5 py-2 bg-white border border-[#E6EAF0] rounded-xl text-xs font-bold text-[#1F2937] focus:outline-none"
            placeholder="任務清單"
            autoFocus
          />
          <textarea
            rows={2}
            value={checklistDraftEdit.details}
            onChange={e => setChecklistDraftEdit((prev: any) => prev ? { ...prev, details: e.target.value } : prev)}
            className="w-full px-2.5 py-2 bg-white border border-[#E6EAF0] rounded-xl text-[11px] font-bold text-[#1F2937] focus:outline-none resize-none"
            placeholder="任務細節"
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setChecklistDraftEdit((prev: any) => prev ? { ...prev, mode: "sync_all" } : prev)}
              className={"py-2 rounded-xl border text-[11px] font-black " + (checklistDraftEdit.mode === "sync_all" ? "bg-[#00B8B8] text-white border-[#00B8B8]" : "bg-white text-[#00B8B8] border-[#00B8B8]/20")}
            >
              連動三堂
            </button>
            <button
              type="button"
              onClick={() => setChecklistDraftEdit((prev: any) => prev ? { ...prev, mode: "special_only" } : prev)}
              className={"py-2 rounded-xl border text-[11px] font-black " + (checklistDraftEdit.mode === "special_only" ? draftSpecialStyle.activeButton : "bg-white text-[#7B7B74] border-[#E6EAF0]")}
            >
              此堂特殊
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void restoreChecklistUndoSnapshot()}
              disabled={!checklistUndoSnapshot}
              className="py-2 rounded-xl bg-white text-[#F25D6B] border border-[#F25D6B]/20 text-[11px] font-black disabled:opacity-40"
            >
              回上一步
            </button>
            <button
              type="button"
              onClick={() => void saveChecklistDraftEdit()}
              className="py-2 rounded-xl bg-gradient-to-r from-[#00B8B8] to-[#6D55A3] text-white text-[11px] font-black"
            >
              套用
            </button>
          </div>
        </div>
      );
    }

    if (isEditing) {`
);

if (changed) {
  fs.writeFileSync(pagePath, source, "utf8");
  console.log("[flow-inline-editor] app/page.tsx patched for this build.");
} else {
  console.log("[flow-inline-editor] no changes needed.");
}
