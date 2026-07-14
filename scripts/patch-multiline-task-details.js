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
  if (!source.includes(from)) return;
  source = source.replace(from, to);
  changed = true;
  console.log("[multiline-task-details] " + label + " patched.");
};

const replaceAllSafe = (label, from, to) => {
  if (!source.includes(from)) return;
  source = source.split(from).join(to);
  changed = true;
  console.log("[multiline-task-details] " + label + " patched.");
};

replaceOnce(
  "add newline helper",
  `  const renderInlineEdit = (type: 'node' | 'checklist', id: string, field: string, currentValue: string, styleClass: string, inputType: 'text' | 'time' | 'textarea' = 'text') => {
`,
  `  const insertInlineLineBreak = () => {
    setInlineEditValue(prev => prev ? "${""}" + prev + "" : "");
  };

  const renderInlineEdit = (type: 'node' | 'checklist', id: string, field: string, currentValue: string, styleClass: string, inputType: 'text' | 'time' | 'textarea' = 'text') => {
`.replace('prev ? "" + prev + "" : ""', 'prev ? prev + "\\n" : ""')
);

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
  "inline textarea mobile newline button",
  `          <textarea
            value={inlineEditValue}
            onChange={e => setInlineEditValue(e.target.value)}
            onBlur={handleInlineBlur}
            onKeyDown={e => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                handleInlineBlur();
              }
              if (e.key === 'Escape') setActiveInlineEdit(null);
            }}
            className="border-2 border-[#6D55A3] rounded-lg p-2 bg-white text-slate-800 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#6D55A3]/30 w-full min-h-[96px] resize-y whitespace-pre-wrap"
            rows={4}
            autoFocus
          />
`,
  `          <div className="w-full space-y-2">
            <textarea
              value={inlineEditValue}
              onChange={e => setInlineEditValue(e.target.value)}
              onBlur={handleInlineBlur}
              onKeyDown={e => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  handleInlineBlur();
                }
                if (e.key === 'Escape') setActiveInlineEdit(null);
              }}
              className="border-2 border-[#6D55A3] rounded-lg p-2 bg-white text-slate-800 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#6D55A3]/30 w-full min-h-[96px] resize-y whitespace-pre-wrap"
              rows={4}
              autoFocus
            />
            <button
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={insertInlineLineBreak}
              className="w-full py-2 rounded-xl bg-[#F3EEFF] text-[#6D55A3] border border-[#6D55A3]/20 text-xs font-black"
            >
              插入換行
            </button>
          </div>
`
);

replaceOnce(
  "inline display preserves paragraphs",
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
  "node edit details mobile newline button",
  `                          placeholder="可分段輸入，每一行會保留換行"
                          className="w-full px-2 py-2 bg-[#F3EEFF]/40 border border-[#E6EAF0] rounded-[10px] text-xs font-bold leading-relaxed text-[#1F2937] focus:outline-none resize-y whitespace-pre-wrap" 
                        />
`,
  `                          placeholder="可分段輸入，每一行會保留換行"
                          className="w-full px-2 py-2 bg-[#F3EEFF]/40 border border-[#E6EAF0] rounded-[10px] text-xs font-bold leading-relaxed text-[#1F2937] focus:outline-none resize-y whitespace-pre-wrap" 
                        />
                        <button
                          type="button"
                          onClick={() => setEditForm(prev => ({ ...prev, details: prev.details ? prev.details + "\\n" : "" }))}
                          className="mt-2 w-full py-2 rounded-xl bg-[#F3EEFF] text-[#6D55A3] border border-[#6D55A3]/20 text-xs font-black"
                        >
                          插入換行
                        </button>
`
);

replaceOnce(
  "flow checklist draft textarea mobile newline",
  `          <textarea
            rows={2}
            value={checklistDraftEdit.details}
            onChange={e => setChecklistDraftEdit((prev: any) => prev ? { ...prev, details: e.target.value } : prev)}
            className="w-full px-2.5 py-2 bg-white border border-[#E6EAF0] rounded-xl text-[11px] font-bold text-[#1F2937] focus:outline-none resize-none"
            placeholder="任務細節"
          />
`,
  `          <textarea
            rows={4}
            value={checklistDraftEdit.details}
            onChange={e => setChecklistDraftEdit((prev: any) => prev ? { ...prev, details: e.target.value } : prev)}
            className="w-full px-2.5 py-2 bg-white border border-[#E6EAF0] rounded-xl text-[11px] font-bold leading-relaxed text-[#1F2937] focus:outline-none resize-y whitespace-pre-wrap"
            placeholder="任務細節，可分段輸入"
          />
          <button
            type="button"
            onClick={() => setChecklistDraftEdit((prev: any) => prev ? { ...prev, details: prev.details ? prev.details + "\\n" : "" } : prev)}
            className="w-full py-2 rounded-xl bg-[#F3EEFF] text-[#6D55A3] border border-[#6D55A3]/20 text-xs font-black"
          >
            插入換行
          </button>
`
);

replaceAllSafe("fix duplicate reset password wording", "設定新密碼新密碼", "設定新密碼");
replaceOnce(
  "remove duplicate today service line",
  `                  <p className="text-sm font-bold text-[#6D55A3] mt-1">今日堂次：{todayService}</p>
                  <p className="text-[11px] font-bold text-[#00B8B8] mt-1">
                    今日堂次：{todayService} {checkedInService ? "已鎖定" : "待確認"}
                  </p>
`,
  `                  <p className="text-sm font-bold text-[#6D55A3] mt-1">
                    今日堂次：{todayService} {checkedInService ? "已鎖定" : "待確認"}
                  </p>
`
);

if (changed) {
  fs.writeFileSync(pagePath, source, "utf8");
  console.log("[multiline-task-details] app/page.tsx patched for this build.");
} else {
  console.log("[multiline-task-details] no changes needed.");
}
