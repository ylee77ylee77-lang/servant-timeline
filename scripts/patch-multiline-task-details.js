const fs = require("fs");
const path = require("path");

const pagePath = path.join(process.cwd(), "app", "page.tsx");
let source = fs.readFileSync(pagePath, "utf8");
let changed = false;

const replaceOnce = (label, from, to) => {
  if (source.includes(to)) {
    console.log("[multiline-task-details] " + label + " already patched.");
    return;
  }
  if (!source.includes(from)) {
    console.warn("[multiline-task-details] " + label + " target not found; skipped.");
    return;
  }
  source = source.replace(from, to);
  changed = true;
  console.log("[multiline-task-details] " + label + " patched.");
};

replaceOnce(
  "inline textarea allows paragraphs",
  `            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleInlineBlur();
              }
            }}
            className="border-2 border-[#6D55A3] rounded-lg p-2 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-[#6D55A3]/30 w-full resize-none"
            autoFocus
`,
  `            onKeyDown={e => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                handleInlineBlur();
              }
              if (e.key === 'Escape') setActiveInlineEdit(null);
            }}
            className="border-2 border-[#6D55A3] rounded-lg p-2 bg-white text-slate-800 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#6D55A3]/30 w-full min-h-[96px] resize-y whitespace-pre-wrap"
            rows={4}
            autoFocus
`
);

replaceOnce(
  "inline display preserves details paragraphs",
  '        className={`${styleClass} border-b-2 border-dashed border-[#6D55A3]/30 hover:border-[#6D55A3] hover:bg-[#F3EEFF]/80 cursor-pointer px-1 rounded transition-colors inline-block`}\n',
  '        className={`${styleClass} border-b-2 border-dashed border-[#6D55A3]/30 hover:border-[#6D55A3] hover:bg-[#F3EEFF]/80 cursor-pointer px-1 rounded transition-colors inline-block whitespace-pre-line`}\n'
);

replaceOnce(
  "node edit details textarea taller",
  `                          rows={2} 
                          value={editForm.details} 
                          onChange={e => setEditForm({...editForm, details: e.target.value})} 
                          className="w-full px-2 py-1.5 bg-[#F3EEFF]/40 border border-[#E6EAF0] rounded-[10px] text-xs font-bold text-[#1F2937] focus:outline-none resize-none" 
`,
  `                          rows={4} 
                          value={editForm.details} 
                          onChange={e => setEditForm({...editForm, details: e.target.value})} 
                          placeholder="可分段輸入，每一行會保留換行"
                          className="w-full px-2 py-2 bg-[#F3EEFF]/40 border border-[#E6EAF0] rounded-[10px] text-xs font-bold leading-relaxed text-[#1F2937] focus:outline-none resize-y whitespace-pre-wrap" 
`
);

replaceOnce(
  "new checklist details input to textarea",
  `                                <input 
                                  type="text"
                                  placeholder="細節備註 (可選)"
                                  value={newChecklistItem.details}
                                  onChange={e => setNewChecklistItem({ ...newChecklistItem, details: e.target.value })}
                                  className="w-full px-2.5 py-1.5 bg-white border border-[#E6EAF0] rounded-xl text-xs font-bold text-[#1F2937] focus:outline-none"
                                />
`,
  `                                <textarea
                                  placeholder="細節備註 (可選，可分段輸入)"
                                  value={newChecklistItem.details}
                                  onChange={e => setNewChecklistItem({ ...newChecklistItem, details: e.target.value })}
                                  rows={4}
                                  className="w-full px-2.5 py-2 bg-white border border-[#E6EAF0] rounded-xl text-xs font-bold leading-relaxed text-[#1F2937] focus:outline-none resize-y whitespace-pre-wrap"
                                />
`
);

replaceOnce(
  "admin checklist details display preserves paragraphs",
  `                                          <div className="text-[10px] text-slate-500 font-medium">
                                            {renderInlineEdit('checklist', item.id, 'details', item.details || "點選填寫詳細細節說明", "w-full block", "textarea")}
                                          </div>
`,
  `                                          <div className="text-[10px] text-slate-500 font-medium whitespace-pre-line">
                                            {renderInlineEdit('checklist', item.id, 'details', item.details || "點選填寫詳細細節說明", "w-full block", "textarea")}
                                          </div>
`
);

if (changed) {
  fs.writeFileSync(pagePath, source, "utf8");
  console.log("[multiline-task-details] app/page.tsx patched for this build.");
} else {
  console.log("[multiline-task-details] no changes needed.");
}
