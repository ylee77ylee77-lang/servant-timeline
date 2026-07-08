const fs = require("fs");
const path = require("path");

const pagePath = path.join(process.cwd(), "app", "page.tsx");
let source = fs.readFileSync(pagePath, "utf8");
let changed = false;

const replaceOnce = (label, from, to) => {
  if (source.includes(to)) {
    console.log("[checklist-draft] " + label + " already patched.");
    return;
  }

  if (!source.includes(from)) {
    console.warn("[checklist-draft] " + label + " target not found; skipped.");
    return;
  }

  source = source.replace(from, to);
  changed = true;
  console.log("[checklist-draft] " + label + " patched.");
};

replaceOnce(
  "draft state",
  `  const [checklistUndoSnapshot, setChecklistUndoSnapshot] = useState<any | null>(null);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);`,
  `  const [checklistUndoSnapshot, setChecklistUndoSnapshot] = useState<any | null>(null);
  const [checklistDraftEdit, setChecklistDraftEdit] = useState<any | null>(null);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);`
);

replaceOnce(
  "cancel draft reset",
  `  const cancelChecklistEditing = () => {
    setActiveInlineEdit(null);
    setInlineEditValue("");
    setNewChecklistItem({ text: "", details: "" });
    void fetchData(true);
  };`,
  String.raw`  const cancelChecklistEditing = () => {
    setActiveInlineEdit(null);
    setInlineEditValue("");
    setChecklistDraftEdit(null);
    setNewChecklistItem({ text: "", details: "" });
    void fetchData(true);
  };

  const openChecklistDraftEdit = (itemId: string) => {
    const sourceNode = nodes.find((node: any) => (node.checklist || []).some((item: any) => item.id === itemId));
    const sourceItem = sourceNode?.checklist?.find((item: any) => item.id === itemId) || null;
    if (!sourceNode || !sourceItem) return;

    setActiveInlineEdit(null);
    setInlineEditValue("");
    setChecklistDraftEdit({
      nodeId: sourceNode.id,
      itemId,
      text: sourceItem.text || "",
      details: sourceItem.details || "",
      mode: getTaskBlockSyncMode(sourceNode.id)
    });
  };

  const saveChecklistDraftEdit = async () => {
    if (!checklistDraftEdit) return;

    const sourceNode = nodes.find((node: any) => node.id === checklistDraftEdit.nodeId);
    const sourceItem = sourceNode?.checklist?.find((item: any) => item.id === checklistDraftEdit.itemId) || null;
    const nextText = String(checklistDraftEdit.text || "").trim();
    const nextDetails = String(checklistDraftEdit.details || "").trim();
    const nextMode = checklistDraftEdit.mode === "special_only" ? "special_only" : "sync_all";

    if (!sourceNode || !sourceItem) return;
    if (!nextText) {
      setCustomAlert({ isOpen: true, message: "請輸入任務清單內容。" });
      return;
    }

    try {
      saveChecklistUndoSnapshot(sourceNode);
      setTaskBlockSyncMode(sourceNode, nextMode);

      await supabaseFetch("checklist_items?id=eq." + sourceItem.id, 'PATCH', {
        text: nextText,
        details: nextDetails
      });

      let syncedCount = 0;
      if (nextMode === "sync_all") {
        const linkedNodes = findLinkedTaskBlocks(sourceNode).filter((node: any) => !isSpecialTaskBlock(node.id));

        for (const targetNode of linkedNodes) {
          const targetItem = getChecklistItemMatch(targetNode, sourceItem);
          if (!targetItem) continue;

          await supabaseFetch("checklist_items?id=eq." + targetItem.id, 'PATCH', {
            text: nextText,
            details: nextDetails
          });
          syncedCount += 1;
        }
      }

      setChecklistDraftEdit(null);
      await fetchData(true);
      setCustomAlert({
        isOpen: true,
        message: nextMode === "sync_all"
          ? "任務清單已儲存，並同步到另外 " + syncedCount + " 堂。"
          : "已儲存為此堂特殊任務清單，不會連動另外兩堂。"
      });
    } catch (err: any) {
      setCustomAlert({ isOpen: true, message: "儲存任務清單失敗：" + err.message });
    }
  };`
);

replaceOnce(
  "handle inline click checklist draft",
  `  const handleInlineClick = (type: 'node' | 'checklist', id: string, field: string, currentValue: string) => {
    if (!isAdminUnlocked || !isTimelineEditMode) return; 
    setActiveInlineEdit({ type, id, field });
    setInlineEditValue(currentValue);
  };`,
  String.raw`  const handleInlineClick = (type: 'node' | 'checklist', id: string, field: string, currentValue: string) => {
    if (!isAdminUnlocked || !isTimelineEditMode) return;

    if (type === 'checklist') {
      openChecklistDraftEdit(id);
      return;
    }

    setActiveInlineEdit({ type, id, field });
    setInlineEditValue(currentValue);
  };`
);

replaceOnce(
  "clear draft when leaving edit mode",
  `      setActiveInlineEdit(null);
      setInlineEditValue("");
      setIsTimelineEditMode(false);`,
  `      setActiveInlineEdit(null);
      setInlineEditValue("");
      setChecklistDraftEdit(null);
      setIsTimelineEditMode(false);`
);

replaceOnce(
  "clear draft in top cancel",
  `                  setActiveInlineEdit(null);
                  setInlineEditValue("");
                  setEditingNodeId(null);`,
  `                  setActiveInlineEdit(null);
                  setInlineEditValue("");
                  setChecklistDraftEdit(null);
                  setEditingNodeId(null);`
);

replaceOnce(
  "map draft variable",
  `                                node.checklist.map((item: any, idx: number) => {
                                  return (`,
  `                                node.checklist.map((item: any, idx: number) => {
                                  const isDraftingChecklistItem = checklistDraftEdit?.itemId === item.id;
                                  return (`
);

replaceOnce(
  "checklist item draft editor",
  String.raw`                                        <div className="flex-1 min-w-0">
                                          <div className="text-xs font-bold text-slate-800">
                                            {renderInlineEdit('checklist', item.id, 'text', item.text, "w-full")}
                                          </div>
                                          <div className="text-[10px] text-slate-500 font-medium">
                                            {renderInlineEdit('checklist', item.id, 'details', item.details || "點選填寫任務細節", "w-full block", "textarea")}
                                          </div>
                                        </div>`,
  String.raw`                                        <div className="flex-1 min-w-0">
                                          {isDraftingChecklistItem ? (
                                            <div className={"p-3 rounded-2xl border space-y-2 " + (checklistDraftEdit?.mode === "special_only" ? specialStyle.panel : "bg-white border-[#E6EAF0]")}>
                                              <div className="text-[10px] font-black text-[#6D55A3] tracking-widest">編輯任務清單</div>
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
                                              <div className="grid grid-cols-3 gap-2">
                                                <button
                                                  type="button"
                                                  onClick={() => setChecklistDraftEdit(null)}
                                                  className="py-2 rounded-xl bg-white text-[#7B7B74] border border-[#E6EAF0] text-[11px] font-black"
                                                >
                                                  取消修改
                                                </button>
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
                                                  儲存
                                                </button>
                                              </div>
                                            </div>
                                          ) : (
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                if (isAdminUnlocked && isTimelineEditMode) openChecklistDraftEdit(item.id);
                                              }}
                                              className="w-full text-left rounded-xl px-1 py-1 hover:bg-[#F3EEFF]/70 transition-colors"
                                              title="點選編輯任務清單，儲存時可選擇連動三堂或此堂特殊"
                                            >
                                              <div className="text-xs font-bold text-slate-800 border-b-2 border-dashed border-[#6D55A3]/20 inline-block">
                                                {item.text || "(點選填寫任務清單)"}
                                              </div>
                                              <div className="text-[10px] text-slate-500 font-medium mt-0.5">
                                                {item.details || "點選填寫任務細節"}
                                              </div>
                                            </button>
                                          )}
                                        </div>`
);

if (changed) {
  fs.writeFileSync(pagePath, source, "utf8");
  console.log("[checklist-draft] app/page.tsx patched for this build.");
} else {
  console.log("[checklist-draft] no changes needed.");
}
