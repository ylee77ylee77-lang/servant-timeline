const fs = require("fs");
const path = require("path");

const pagePath = path.join(process.cwd(), "app", "page.tsx");
let source = fs.readFileSync(pagePath, "utf8");
let changed = false;

const replaceOnce = (label, from, to) => {
  if (source.includes(to)) {
    console.log("[checklist-flow-color] " + label + " already patched.");
    return;
  }

  if (!source.includes(from)) {
    console.warn("[checklist-flow-color] " + label + " target not found; skipped.");
    return;
  }

  source = source.replace(from, to);
  changed = true;
  console.log("[checklist-flow-color] " + label + " patched.");
};

replaceOnce(
  "timeline item variables",
  [
    "                        {node.checklist.map((item: any) => {",
    "                          return ("
  ].join("\n"),
  [
    "                        {node.checklist.map((item: any) => {",
    "                          const itemIsSpecial = isSpecialChecklistItem(item.id);",
    "                          const specialStyle = getServiceSpecialStyle(node.service_type || currentService);",
    "                          return ("
  ].join("\n")
);

replaceOnce(
  "timeline item color",
  [
    "                            <div key={item.id} className={`flex items-start gap-3 p-3.5 rounded-[16px] transition-all duration-200 ${",
    "                              item.is_completed ? 'bg-[#00B8B8]/5 border border-[#00B8B8]/20' : 'bg-white border border-[#E6EAF0] shadow-sm hover:border-[#6D55A3]/30'",
    "                            }`}>"
  ].join("\n"),
  [
    "                            <div key={item.id} className={`flex items-start gap-3 p-3.5 rounded-[16px] transition-all duration-200 ${",
    "                              itemIsSpecial",
    "                                ? specialStyle.panel + ' shadow-sm'",
    "                                : item.is_completed",
    "                                  ? 'bg-[#00B8B8]/5 border border-[#00B8B8]/20'",
    "                                  : 'bg-white border border-[#E6EAF0] shadow-sm hover:border-[#6D55A3]/30'",
    "                            }`}>"
  ].join("\n")
);

replaceOnce(
  "timeline special badge",
  [
    "                                    {renderInlineEdit('checklist', item.id, 'text', item.text, \"w-full\")}",
    "                                  </span>"
  ].join("\n"),
  [
    "                                    {renderInlineEdit('checklist', item.id, 'text', item.text, \"w-full\")}",
    "                                  </span>",
    "                                  {itemIsSpecial && (",
    "                                    <span className={\"ml-1.5 mt-0.5 shrink-0 px-2 py-0.5 rounded-full border text-[9px] font-black \" + specialStyle.badge}>",
    "                                      此堂特殊",
    "                                    </span>",
    "                                  )}"
  ].join("\n")
);

replaceOnce(
  "timeline special detail box",
  "                                  <div className=\"mt-1 text-xs text-[#7B7B74] bg-[#F3EEFF]/40 p-2 rounded-lg border border-dashed border-[#6D55A3]/20\">",
  "                                  <div className={\"mt-1 text-xs text-[#7B7B74] p-2 rounded-lg border border-dashed \" + (itemIsSpecial ? specialStyle.panel : \"bg-[#F3EEFF]/40 border-[#6D55A3]/20\")}>"
);

if (changed) {
  fs.writeFileSync(pagePath, source, "utf8");
  console.log("[checklist-flow-color] app/page.tsx patched for this build.");
} else {
  console.log("[checklist-flow-color] no changes needed.");
}
