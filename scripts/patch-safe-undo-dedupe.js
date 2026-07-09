const fs = require("fs");
const path = require("path");

const pagePath = path.join(process.cwd(), "app", "page.tsx");
let source = fs.readFileSync(pagePath, "utf8");
let changed = false;

const startMarker = "  const restoreChecklistUndoSnapshot = async () => {";
const endMarker = "\n  const cancelChecklistEditing = () => {";

const startIndex = source.indexOf(startMarker);
const endIndex = startIndex === -1 ? -1 : source.indexOf(endMarker, startIndex);

if (startIndex === -1 || endIndex === -1) {
  console.warn("[safe-undo-dedupe] restoreChecklistUndoSnapshot target not found; skipped.");
} else {
  const replacement = String.raw`  const restoreChecklistUndoSnapshot = async () => {
    if (!checklistUndoSnapshot) {
      setCustomAlert({ isOpen: true, message: "目前沒有可回復的上一步。" });
      return;
    }

    const normalizeUndoText = (value: any) => String(value || "")
      .replace(/\s/g, "")
      .replace(/[：:｜|,，、。.!！\-＿_]/g, "")
      .toLowerCase();

    const dedupeSnapshotItems = (items: any[]) => {
      const seen = new Set<string>();
      return [...items]
        .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0))
        .filter((item: any) => {
          const key = normalizeUndoText(item.text) + "|" + normalizeUndoText(item.details);
          if (!key || key === "|") return false;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .map((item: any, index: number) => ({
          ...item,
          sort_order: index
        }));
    };

    setCustomConfirm({
      isOpen: true,
      message: "要回到上一步嗎？\n系統會先清除這個任務區塊目前的任務清單，再用去重後的上一步資料重建，避免重複清單。\n" + checklistUndoSnapshot.label,
      confirmLabel: "回上一步",
      onConfirm: async () => {
        try {
          for (const snapshotNode of checklistUndoSnapshot.nodes) {
            const restoredChecklist = dedupeSnapshotItems(snapshotNode.checklist || []);

            // 用 node_id 一次清空該任務區塊所有任務清單，避免逐筆刪除時因雲端回寫時間差造成重複。
            await supabaseFetch("checklist_items?node_id=eq." + snapshotNode.id, 'DELETE');

            for (const item of restoredChecklist) {
              await supabaseFetch('checklist_items', 'POST', {
                id: 'c_' + Math.random().toString(36).substr(2, 9),
                node_id: snapshotNode.id,
                text: item.text,
                details: item.details,
                is_completed: item.is_completed === true,
                completed_at: item.completed_at || null,
                sort_order: item.sort_order
              });
            }
          }

          setChecklistUndoSnapshot(null);
          setChecklistDraftEdit(null);
          await fetchData(true);
          setCustomAlert({ isOpen: true, message: "已回到上一步，並自動去除重複任務清單。" });
        } catch (err: any) {
          setCustomAlert({ isOpen: true, message: "回上一步失敗：" + err.message });
        }
      }
    });
  };
`;

  source = source.slice(0, startIndex) + replacement + source.slice(endIndex);
  changed = true;
  console.log("[safe-undo-dedupe] restoreChecklistUndoSnapshot replaced.");
}

if (changed) {
  fs.writeFileSync(pagePath, source, "utf8");
  console.log("[safe-undo-dedupe] app/page.tsx patched for this build.");
} else {
  console.log("[safe-undo-dedupe] no changes needed.");
}
