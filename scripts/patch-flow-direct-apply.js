const fs = require("fs");
const path = require("path");

const pagePath = path.join(process.cwd(), "app", "page.tsx");
let source = fs.readFileSync(pagePath, "utf8");
let changed = false;

const replaceAll = (label, from, to) => {
  if (!source.includes(from)) return;
  source = source.split(from).join(to);
  changed = true;
  console.log("[flow-direct-apply] " + label + " patched.");
};

replaceAll(
  "edit banner hint",
  "所有可修正內容已展開，點選文字即可修改。",
  "可直接在流程上修改任務清單，選擇連動三堂或此堂特殊後按套用。"
);

replaceAll(
  "draft title",
  "編輯任務清單",
  "流程上修改任務清單"
);

replaceAll(
  "save button",
  ">\n                                                  儲存\n                                                </button>",
  ">\n                                                  套用\n                                                </button>"
);

replaceAll(
  "save button compact",
  ">儲存</button>",
  ">套用</button>"
);

replaceAll(
  "tooltip wording",
  "點選編輯任務清單，儲存時可選擇連動三堂或此堂特殊",
  "直接在流程上修改任務清單，套用時可選擇連動三堂或此堂特殊"
);

replaceAll(
  "sync success message",
  "任務清單已儲存，並同步到另外 ",
  "任務清單已套用，並同步到另外 "
);

replaceAll(
  "special success message",
  "已儲存為此堂特殊任務清單，這一項會以特殊顏色標示。",
  "已套用為此堂特殊任務清單，這一項會以特殊顏色標示。"
);

replaceAll(
  "failure message",
  "儲存任務清單失敗：",
  "套用任務清單失敗："
);

if (changed) {
  fs.writeFileSync(pagePath, source, "utf8");
  console.log("[flow-direct-apply] app/page.tsx patched for this build.");
} else {
  console.log("[flow-direct-apply] no changes needed.");
}
