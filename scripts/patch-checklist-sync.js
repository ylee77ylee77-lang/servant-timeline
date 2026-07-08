const fs = require("fs");
const path = require("path");

const pagePath = path.join(process.cwd(), "app", "page.tsx");
let source = fs.readFileSync(pagePath, "utf8");
let changed = false;
const bt = String.fromCharCode(96);

const applyReplace = (label, from, to) => {
  if (source.includes(to)) {
    console.log("[checklist-sync] " + label + " already patched.");
    return;
  }

  if (!source.includes(from)) {
    console.warn("[checklist-sync] " + label + " target not found; skipped.");
    return;
  }

  source = source.replace(from, to);
  changed = true;
  console.log("[checklist-sync] " + label + " patched.");
};

const replaceText = (label, from, to) => {
  if (!source.includes(from)) return;
  source = source.split(from).join(to);
  changed = true;
  console.log("[checklist-sync] wording patched: " + label);
};

applyReplace(
  "sync state",
  `  const [newChecklistItem, setNewChecklistItem] = useState({ text: "", details: "" });
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);`,
  String.raw`  const [newChecklistItem, setNewChecklistItem] = useState({ text: "", details: "" });
  const CHECKLIST_SYNC_STORAGE_KEY = "shekinah_checklist_sync_modes_v1";
  const SPECIAL_TASK_BLOCK_STORAGE_KEY = "shekinah_special_task_blocks_v1";
  const [checklistSyncModeByNode, setChecklistSyncModeByNode] = useState<Record<string, "sync_all" | "special_only">>({});
  const [specialTaskBlocks, setSpecialTaskBlocks] = useState<Record<string, boolean>>({});
  const [checklistUndoSnapshot, setChecklistUndoSnapshot] = useState<any | null>(null);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const savedSyncModes = window.localStorage.getItem(CHECKLIST_SYNC_STORAGE_KEY);
      if (savedSyncModes) setChecklistSyncModeByNode(JSON.parse(savedSyncModes));

      const savedSpecialBlocks = window.localStorage.getItem(SPECIAL_TASK_BLOCK_STORAGE_KEY);
      if (savedSpecialBlocks) setSpecialTaskBlocks(JSON.parse(savedSpecialBlocks));
    } catch (err) {
      console.error("讀取任務清單連動設定失敗:", err);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      window.localStorage.setItem(CHECKLIST_SYNC_STORAGE_KEY, JSON.stringify(checklistSyncModeByNode));
      window.localStorage.setItem(SPECIAL_TASK_BLOCK_STORAGE_KEY, JSON.stringify(specialTaskBlocks));
    } catch (err) {
      console.error("儲存任務清單連動設定失敗:", err);
    }
  }, [checklistSyncModeByNode, specialTaskBlocks]);`
);

applyReplace(
  "sync helpers",
  `  const adminNodes = serviceNodes;
  const isNodeCompleted = (node: any) => node.checklist && node.checklist.length > 0 && node.checklist.every((c: any) => c.is_completed);

  const timeToMinutes = (tStr: string) => {`,
  String.raw`  const adminNodes = serviceNodes;
  const isNodeCompleted = (node: any) => node.checklist && node.checklist.length > 0 && node.checklist.every((c: any) => c.is_completed);

  const normalizeTaskBlockText = (value: any) => String(value || "")
    .replace(/\s/g, "")
    .replace(/[：:｜|,，、。.!！\-＿_]/g, "")
    .toLowerCase();

  const getTaskBlockKey = (node: any, includeAssignee = true) => {
    const titleKey = normalizeTaskBlockText(node?.title || "");
    if (!includeAssignee) return titleKey;
    return titleKey + "|" + normalizeTaskBlockText(node?.assignee || "");
  };

  const isSpecialTaskBlock = (nodeId: string) => specialTaskBlocks[nodeId] === true;

  const getTaskBlockSyncMode = (nodeId: string) => {
    if (isSpecialTaskBlock(nodeId)) return "special_only";
    return checklistSyncModeByNode[nodeId] || "sync_all";
  };

  const setTaskBlockSyncMode = (node: any, mode: "sync_all" | "special_only") => {
    if (!node?.id) return;

    setChecklistSyncModeByNode(prev => ({ ...prev, [node.id]: mode }));
    setSpecialTaskBlocks(prev => ({ ...prev, [node.id]: mode === "special_only" }));
  };

  const getServiceSpecialStyle = (serviceType: string) => {
    const styles: Record<string, any> = {
      "六晚崇": {
        panel: "bg-[#FFF7E6] border-[#F59E0B]/25",
        badge: "bg-[#F59E0B]/12 text-[#B45309] border-[#F59E0B]/25",
        activeButton: "bg-[#F59E0B] text-white border-[#F59E0B]"
      },
      "主一堂": {
        panel: "bg-[#EFFFFD] border-[#00B8B8]/25",
        badge: "bg-[#00B8B8]/12 text-[#008C8C] border-[#00B8B8]/25",
        activeButton: "bg-[#00B8B8] text-white border-[#00B8B8]"
      },
      "主二堂": {
        panel: "bg-[#F3EEFF] border-[#6D55A3]/20",
        badge: "bg-[#6D55A3]/12 text-[#6D55A3] border-[#6D55A3]/20",
        activeButton: "bg-[#6D55A3] text-white border-[#6D55A3]"
      }
    };

    return styles[serviceType] || styles["主一堂"];
  };

  const findLinkedTaskBlocks = (sourceNode: any) => {
    if (!sourceNode) return [];

    const strictKey = getTaskBlockKey(sourceNode, true);
    const titleKey = getTaskBlockKey(sourceNode, false);
    const candidates = nodes.filter((node: any) =>
      node.id !== sourceNode.id &&
      serviceOptions.includes(node.service_type) &&
      node.service_type !== sourceNode.service_type
    );

    const strictMatches = candidates.filter((node: any) => getTaskBlockKey(node, true) === strictKey);
    if (strictMatches.length > 0) return strictMatches;

    return candidates.filter((node: any) => getTaskBlockKey(node, false) === titleKey);
  };

  const getChecklistItemMatch = (targetNode: any, sourceItem: any) => {
    const checklist = targetNode?.checklist || [];
    if (!sourceItem) return null;

    return checklist.find((item: any) => item.sort_order === sourceItem.sort_order)
      || checklist.find((item: any) => normalizeTaskBlockText(item.text) === normalizeTaskBlockText(sourceItem.text))
      || null;
  };

  const buildChecklistUndoSnapshot = (sourceNode: any) => {
    if (!sourceNode) return null;

    const shouldIncludeLinked = getTaskBlockSyncMode(sourceNode.id) === "sync_all";
    const snapshotNodes = shouldIncludeLinked
      ? [sourceNode, ...findLinkedTaskBlocks(sourceNode).filter((node: any) => !isSpecialTaskBlock(node.id))]
      : [sourceNode];

    return {
      label: (sourceNode.service_type || "本堂") + "｜" + (sourceNode.title || "任務清單"),
      createdAt: new Date().toISOString(),
      nodes: snapshotNodes.map((node: any) => ({
        id: node.id,
        service_type: node.service_type,
        title: node.title,
        checklist: (node.checklist || []).map((item: any) => ({
          text: item.text || "",
          details: item.details || "",
          is_completed: item.is_completed === true,
          completed_at: item.completed_at || null,
          sort_order: item.sort_order || 0
        }))
      }))
    };
  };

  const saveChecklistUndoSnapshot = (sourceNode: any) => {
    const snapshot = buildChecklistUndoSnapshot(sourceNode);
    if (snapshot) setChecklistUndoSnapshot(snapshot);
  };

  const restoreChecklistUndoSnapshot = async () => {
    if (!checklistUndoSnapshot) {
      setCustomAlert({ isOpen: true, message: "目前沒有可回復的上一步。" });
      return;
    }

    setCustomConfirm({
      isOpen: true,
      message: "要回到上一步嗎？\n將復原最近一次任務清單修改：" + checklistUndoSnapshot.label,
      confirmLabel: "回上一步",
      onConfirm: async () => {
        try {
          for (const snapshotNode of checklistUndoSnapshot.nodes) {
            const currentNode = nodes.find((node: any) => node.id === snapshotNode.id);
            const currentChecklist = currentNode?.checklist || [];

            for (const item of currentChecklist) {
              await supabaseFetch("checklist_items?id=eq." + item.id, 'DELETE');
            }

            for (const item of snapshotNode.checklist) {
              await supabaseFetch('checklist_items', 'POST', {
                id: 'c_' + Math.random().toString(36).substr(2, 9),
                node_id: snapshotNode.id,
                text: item.text,
                details: item.details,
                is_completed: item.is_completed,
                completed_at: item.completed_at,
                sort_order: item.sort_order
              });
            }
          }

          setChecklistUndoSnapshot(null);
          await fetchData(true);
          setCustomAlert({ isOpen: true, message: "已回到上一步任務清單。" });
        } catch (err: any) {
          setCustomAlert({ isOpen: true, message: "回上一步失敗：" + err.message });
        }
      }
    });
  };

  const cancelChecklistEditing = () => {
    setActiveInlineEdit(null);
    setInlineEditValue("");
    setNewChecklistItem({ text: "", details: "" });
    void fetchData(true);
  };

  const syncChecklistEditAcrossServices = async (sourceNode: any, sourceItem: any, field: string, updatedValue: string) => {
    if (!sourceNode || !sourceItem) return 0;
    if (getTaskBlockSyncMode(sourceNode.id) !== "sync_all") return 0;

    const linkedNodes = findLinkedTaskBlocks(sourceNode).filter((node: any) => !isSpecialTaskBlock(node.id));
    let syncedCount = 0;

    for (const targetNode of linkedNodes) {
      const targetItem = getChecklistItemMatch(targetNode, sourceItem);
      if (!targetItem) continue;

      await supabaseFetch("checklist_items?id=eq." + targetItem.id, 'PATCH', { [field]: updatedValue });
      syncedCount += 1;
    }

    return syncedCount;
  };

  const syncChecklistAddAcrossServices = async (sourceNode: any, itemText: string, itemDetails: string, sourceSortOrder: number) => {
    if (!sourceNode) return 0;
    if (getTaskBlockSyncMode(sourceNode.id) !== "sync_all") return 0;

    const linkedNodes = findLinkedTaskBlocks(sourceNode).filter((node: any) => !isSpecialTaskBlock(node.id));
    let syncedCount = 0;

    for (const targetNode of linkedNodes) {
      const checklist = targetNode.checklist || [];
      const alreadyExists = checklist.some((item: any) => normalizeTaskBlockText(item.text) === normalizeTaskBlockText(itemText));
      if (alreadyExists) continue;

      const maxOrder = checklist.length > 0 ? Math.max(...checklist.map((c: any) => c.sort_order || 0)) : -1;
      await supabaseFetch('checklist_items', 'POST', {
        id: 'c_' + Math.random().toString(36).substr(2, 9),
        node_id: targetNode.id,
        text: itemText,
        details: itemDetails,
        is_completed: false,
        sort_order: Number.isFinite(sourceSortOrder) ? sourceSortOrder : maxOrder + 1
      });
      syncedCount += 1;
    }

    return syncedCount;
  };

  const syncChecklistDeleteAcrossServices = async (sourceNode: any, sourceItem: any) => {
    if (!sourceNode || !sourceItem) return 0;
    if (getTaskBlockSyncMode(sourceNode.id) !== "sync_all") return 0;

    const linkedNodes = findLinkedTaskBlocks(sourceNode).filter((node: any) => !isSpecialTaskBlock(node.id));
    let syncedCount = 0;

    for (const targetNode of linkedNodes) {
      const targetItem = getChecklistItemMatch(targetNode, sourceItem);
      if (!targetItem) continue;

      await supabaseFetch("checklist_items?id=eq." + targetItem.id, 'DELETE');
      syncedCount += 1;
    }

    return syncedCount;
  };

  const timeToMinutes = (tStr: string) => {`
);

const checklistPatchTarget = "        await supabaseFetch(" + bt + "checklist_items?id=eq.${id}" + bt + ", 'PATCH', { [field]: updatedValue });";
applyReplace(
  "inline checklist sync",
  checklistPatchTarget,
  String.raw`        const sourceNode = nodes.find((node: any) => (node.checklist || []).some((item: any) => item.id === id));
        const sourceChecklistItem = sourceNode?.checklist?.find((item: any) => item.id === id) || null;
        saveChecklistUndoSnapshot(sourceNode);
` + checklistPatchTarget + String.raw`
        const syncedCount = await syncChecklistEditAcrossServices(sourceNode, sourceChecklistItem, field, updatedValue);
        if (syncedCount > 0) {
          setCustomAlert({ isOpen: true, message: "已同步更新另外 " + syncedCount + " 堂的相同任務清單。" });
        }`
);

applyReplace(
  "add checklist undo and sync",
  `      await supabaseFetch('checklist_items', 'POST', {
        id: newItemId,
        node_id: nodeId,
        text: newChecklistItem.text.trim(),
        details: newChecklistItem.details.trim() || '',
        is_completed: false,
        sort_order: maxOrder + 1
      });
      setNewChecklistItem({ text: "", details: "" });
      fetchData(true);`,
  String.raw`      saveChecklistUndoSnapshot(node);
      await supabaseFetch('checklist_items', 'POST', {
        id: newItemId,
        node_id: nodeId,
        text: newChecklistItem.text.trim(),
        details: newChecklistItem.details.trim() || '',
        is_completed: false,
        sort_order: maxOrder + 1
      });
      const syncedCount = await syncChecklistAddAcrossServices(node, newChecklistItem.text.trim(), newChecklistItem.details.trim() || '', maxOrder + 1);
      setNewChecklistItem({ text: "", details: "" });
      await fetchData(true);
      if (syncedCount > 0) {
        setCustomAlert({ isOpen: true, message: "已新增，並同步到另外 " + syncedCount + " 堂的相同任務清單。" });
      }`
);

applyReplace(
  "delete checklist source",
  `  const handleDeleteChecklistItem = async (itemId: string) => {
    setCustomConfirm({`,
  String.raw`  const handleDeleteChecklistItem = async (itemId: string) => {
    const sourceNode = nodes.find((node: any) => (node.checklist || []).some((item: any) => item.id === itemId));
    const sourceItem = sourceNode?.checklist?.find((item: any) => item.id === itemId) || null;
    const willSync = sourceNode && getTaskBlockSyncMode(sourceNode.id) === "sync_all" && findLinkedTaskBlocks(sourceNode).length > 0;

    setCustomConfirm({`
);

applyReplace(
  "delete checklist message",
  `      message: "確定要刪除這筆任務清單細項嗎？",
      onConfirm: async () => {`,
  String.raw`      message: willSync
        ? "確定要刪除這筆任務清單嗎？\n目前設定為連動三堂，會同步刪除另外兩堂相同任務清單。"
        : "確定要刪除這筆任務清單嗎？",
      confirmLabel: willSync ? "刪除並同步" : "確認刪除",
      onConfirm: async () => {`
);

const deleteTarget = "          await supabaseFetch(" + bt + "checklist_items?id=eq.${itemId}" + bt + ", 'DELETE');\n          fetchData(true);";
applyReplace(
  "delete checklist sync",
  deleteTarget,
  "          saveChecklistUndoSnapshot(sourceNode);\n" +
  "          const syncedCount = await syncChecklistDeleteAcrossServices(sourceNode, sourceItem);\n" +
  "          await supabaseFetch(" + bt + "checklist_items?id=eq.${itemId}" + bt + ", 'DELETE');\n" +
  "          await fetchData(true);\n" +
  "          if (syncedCount > 0) {\n" +
  "            setCustomAlert({ isOpen: true, message: \"已刪除，並同步刪除另外 \" + syncedCount + \" 堂的對應任務清單。\" });\n" +
  "          }"
);

applyReplace(
  "admin map variables only",
  String.raw`            {adminNodes.map(node => {
              const isEditing = editingNodeId === node.id;
              const isChecklistExpanded = expandedChecklistNodeId === node.id;
              return (
                <div key={node.id} className="p-4 bg-white border border-[#E6EAF0] rounded-[24px] shadow-sm transition-all duration-300">`,
  String.raw`            {adminNodes.map(node => {
              const isEditing = editingNodeId === node.id;
              const isChecklistExpanded = expandedChecklistNodeId === node.id;
              const linkedTaskBlocks = findLinkedTaskBlocks(node);
              const checklistSyncMode = getTaskBlockSyncMode(node.id);
              const nodeIsSpecial = isSpecialTaskBlock(node.id);
              const specialStyle = getServiceSpecialStyle(node.service_type);
              return (
                <div key={node.id} className="p-4 bg-white border border-[#E6EAF0] rounded-[24px] shadow-sm transition-all duration-300">`
);

applyReplace(
  "sync panel",
  String.raw`                            <div className="bg-[#F3EEFF]/30 p-3 rounded-2xl border border-[#E6EAF0]">`,
  String.raw`                            <div className={"p-3 rounded-2xl border " + (nodeIsSpecial ? specialStyle.panel : "bg-[#F3EEFF]/30 border-[#E6EAF0]")}>
                              <div className="flex items-start justify-between gap-3 mb-3">
                                <div>
                                  <p className="text-[10px] font-black text-[#6D55A3] tracking-widest">任務清單連動</p>
                                  <p className="text-[10px] font-bold text-[#7B7B74] mt-1 leading-relaxed">
                                    {linkedTaskBlocks.length > 0
                                      ? "找到另外 " + linkedTaskBlocks.length + " 堂相同任務區塊：" + linkedTaskBlocks.map((item: any) => item.service_type).join("、")
                                      : "目前沒有找到其他堂的相同任務區塊"}
                                  </p>
                                </div>
                                {nodeIsSpecial && (
                                  <span className={"shrink-0 px-2 py-1 rounded-full border text-[9px] font-black " + specialStyle.badge}>
                                    此堂特殊任務清單
                                  </span>
                                )}
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <button
                                  type="button"
                                  onClick={() => setTaskBlockSyncMode(node, "sync_all")}
                                  className={"py-2 rounded-xl border text-[11px] font-black transition-all " + (checklistSyncMode === "sync_all" ? "bg-[#00B8B8] text-white border-[#00B8B8]" : "bg-white text-[#00B8B8] border-[#00B8B8]/20")}
                                >
                                  連動三堂
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setTaskBlockSyncMode(node, "special_only")}
                                  className={"py-2 rounded-xl border text-[11px] font-black transition-all " + (checklistSyncMode === "special_only" ? specialStyle.activeButton : "bg-white text-[#7B7B74] border-[#E6EAF0]")}
                                >
                                  此堂特殊
                                </button>
                              </div>
                              <div className="grid grid-cols-2 gap-2 mt-2">
                                <button
                                  type="button"
                                  onClick={cancelChecklistEditing}
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
                              </div>
                            </div>

                            <div className="bg-[#F3EEFF]/30 p-3 rounded-2xl border border-[#E6EAF0]">`
);

applyReplace(
  "admin edit cancel button",
  String.raw`          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleToggleTimelineEditMode}`,
  String.raw`          <div className="flex items-center gap-2">
            {isTimelineEditMode && (
              <button
                type="button"
                onClick={() => {
                  setActiveInlineEdit(null);
                  setInlineEditValue("");
                  setEditingNodeId(null);
                  setExpandedChecklistNodeId(null);
                  setIsTimelineEditMode(false);
                  void fetchData(true);
                }}
                className="px-3 py-1.5 text-xs font-bold rounded-xl bg-white text-[#7B7B74] border border-[#E6EAF0] hover:bg-[#FFF2F4] hover:text-[#F25D6B] transition-all"
              >
                取消修改
              </button>
            )}
            <button
              type="button"
              onClick={handleToggleTimelineEditMode}`
);

replaceText("完成修改", "完成修正", "完成修改");
replaceText("修改內容", "修正內容", "修改內容");
replaceText("任務細節", "任務提醒", "任務細節");
replaceText("任務細節", "備註細節", "任務細節");
replaceText("任務細節", "詳細備註", "任務細節");
replaceText("任務細節", "細節備註", "任務細節");
replaceText("任務細節", "詳細細節說明", "任務細節");
replaceText("任務清單", "確認清單項目", "任務清單");
replaceText("任務清單", "確認項目細項", "任務清單");
replaceText("任務清單", "確認細項", "任務清單");
replaceText("任務清單", "確認項目", "任務清單");
replaceText("任務清單", "確認事項", "任務清單");
replaceText("任務清單", "清單細項", "任務清單");
replaceText("點選填寫任務細節", "點選填寫任務細節說明", "點選填寫任務細節");

if (changed) {
  fs.writeFileSync(pagePath, source, "utf8");
  console.log("[checklist-sync] app/page.tsx patched for this build.");
} else {
  console.log("[checklist-sync] no changes needed.");
}
