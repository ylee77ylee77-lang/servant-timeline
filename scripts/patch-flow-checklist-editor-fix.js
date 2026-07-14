const fs = require("fs");
const path = require("path");

const pagePath = path.join(process.cwd(), "app", "page.tsx");
let source = fs.readFileSync(pagePath, "utf8");
let changed = false;

const replaceOnce = (label, from, to) => {
  if (source.includes(to)) {
    console.log("[flow-editor-fix] " + label + " already patched.");
    return;
  }
  if (!source.includes(from)) {
    console.warn("[flow-editor-fix] " + label + " target not found; skipped.");
    return;
  }
  source = source.replace(from, to);
  changed = true;
  console.log("[flow-editor-fix] " + label + " patched.");
};

replaceOnce(
  "timeline special variables include draft and block fallback",
  `                        {node.checklist.map((item: any) => {
                          const itemIsSpecial = isSpecialChecklistItem(item.id);
                          const specialStyle = getServiceSpecialStyle(node.service_type || currentService);
                          return (`,
  `                        {node.checklist.map((item: any) => {
                          const isDraftingChecklistItem = checklistDraftEdit?.itemId === item.id;
                          const itemIsSpecial = isSpecialChecklistItem(item.id) || isSpecialTaskBlock(node.id);
                          const specialStyle = getServiceSpecialStyle(node.service_type || currentService);
                          return (`
);

replaceOnce(
  "timeline editor display",
  String.raw`                                  <span className={`text-[14px] font-semibold leading-relaxed transition-all ${
                                    item.is_completed ? 'text-[#7B7B74] line-through opacity-70' : 'text-[#1F2937]'
                                  } ${(!isTimelineEditMode && item.details) ? 'group-hover:text-[#F25D6B]' : ''}`}>
                                    {renderInlineEdit('checklist', item.id, 'text', item.text, "w-full")}
                                  </span>
                                  {itemIsSpecial && (
                                    <span className={"ml-1.5 mt-0.5 shrink-0 px-2 py-0.5 rounded-full border text-[9px] font-black " + specialStyle.badge}>
                                      此堂特殊
                                    </span>
                                  )}`,
  String.raw`                                  {isDraftingChecklistItem ? (
                                    <div className={"w-full p-3 rounded-2xl border space-y-2 " + (checklistDraftEdit?.mode === "special_only" ? specialStyle.panel : "bg-white border-[#E6EAF0]")}>
                                      <div className="flex items-center justify-between gap-2">
                                        <div className="text-[10px] font-black text-[#6D55A3] tracking-widest">流程上修改任務清單</div>
                                        {checklistDraftEdit?.mode === "special_only" && (
                                          <span className={"px-2 py-0.5 rounded-full border text-[9px] font-black " + specialStyle.badge}>此堂特殊</span>
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
                                          className={"py-2 rounded-xl border text-[11px] font-black " + (checklistDraftEdit.mode === "special_only" ? specialStyle.activeButton : "bg-white text-[#7B7B74] border-[#E6EAF0]")}
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
                                  ) : (
                                    <>
                                      <span className={`text-[14px] font-semibold leading-relaxed transition-all ${
                                        item.is_completed ? 'text-[#7B7B74] line-through opacity-70' : 'text-[#1F2937]'
                                      } ${(!isTimelineEditMode && item.details) ? 'group-hover:text-[#F25D6B]' : ''}`}>
                                        {renderInlineEdit('checklist', item.id, 'text', item.text, "w-full")}
                                      </span>
                                      {itemIsSpecial && (
                                        <span className={"ml-1.5 mt-0.5 shrink-0 px-2 py-0.5 rounded-full border text-[9px] font-black " + specialStyle.badge}>
                                          此堂特殊
                                        </span>
                                      )}
                                    </>
                                  )}`
);

replaceOnce(
  "hide duplicate details while drafting",
  `                                {isTimelineEditMode && (
                                  <div className={"mt-1 text-xs text-[#7B7B74] p-2 rounded-lg border border-dashed " + (itemIsSpecial ? specialStyle.panel : "bg-[#F3EEFF]/40 border-[#6D55A3]/20")}>`,
  `                                {isTimelineEditMode && !isDraftingChecklistItem && (
                                  <div className={"mt-1 text-xs text-[#7B7B74] p-2 rounded-lg border border-dashed " + (itemIsSpecial ? specialStyle.panel : "bg-[#F3EEFF]/40 border-[#6D55A3]/20")}>`
);

if (changed) {
  fs.writeFileSync(pagePath, source, "utf8");
  console.log("[flow-editor-fix] app/page.tsx patched for this build.");
} else {
  console.log("[flow-editor-fix] no changes needed.");
}
