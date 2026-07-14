const fs = require("fs");
const path = require("path");

const pagePath = path.join(process.cwd(), "app", "page.tsx");
let source = fs.readFileSync(pagePath, "utf8");
let changed = false;

const stationOptionPatches = [
  {
    from: `"總招", "電梯專招", "手扶梯專招"`,
    to: `"總招", "聖餐助手", "電梯專招", "手扶梯專招"`
  },
  {
    from: `"總招", "副總招", "電梯專招"`,
    to: `"總招", "副總招", "聖餐助手", "電梯專招"`
  }
];

stationOptionPatches.forEach(({ from, to }) => {
  if (!source.includes(to) && source.includes(from)) {
    source = source.replaceAll(from, to);
    changed = true;
    console.log("[status-dashboard] station option patched: " + to);
  }
});

const qrNeedle = `  const stationQrCodeExamples = [`;
const qrInsert = `  const stationQrCodeExamples = [
    { label: "主一堂 聖餐助手", value: "SHK|service=主一堂|station=聖餐助手|role=聖餐助手|tag=101C" },`;
if (!source.includes(`station=聖餐助手`) && source.includes(qrNeedle)) {
  source = source.replace(qrNeedle, qrInsert);
  changed = true;
  console.log("[status-dashboard] communion QR example added.");
}

const startMarker = "  const renderReviewView = () => {";
const endMarker = "\n  const renderPersonalSettingsView = () => {";

const startIndex = source.indexOf(startMarker);
const endIndex = startIndex === -1 ? -1 : source.indexOf(endMarker, startIndex);

if (startIndex === -1 || endIndex === -1) {
  console.warn("[status-dashboard] renderReviewView target not found; skipped.");
} else {
  const replacement = String.raw`  const renderReviewView = () => {
    const allTasks = filteredNodes.flatMap((node: any) => node.checklist || []);
    const completedTasks = allTasks.filter((task: any) => task.is_completed);
    const completionRate = calculateRate(completedTasks.length, allTasks.length);
    const isCheckedIn = checkinStatus !== "not_checked_in";
    const stationReady = checkinStatus === "station_confirmed";
    const targetService = checkedInService || currentService || "今日堂次";
    const currentStation = confirmedStation || assignedStation || personalSettings.role || "尚未確認";
    const currentMinute = timeToMinutes(currentTime || "00:00");
    const todayForRules = currentDate || new Date();
    const isCommunionWeek = todayForRules.getDate() <= 7;
    const communionScheduleByService: Record<string, any> = {
      "六晚崇": { doorClose: "19:12", communionStart: "19:25", communionEnd: "19:37", newsStart: "19:37", newsEnd: "19:42", reportStart: "19:42", reportEnd: "19:46" },
      "主一堂": { doorClose: "09:12", communionStart: "09:25", communionEnd: "09:37", newsStart: "09:37", newsEnd: "09:42", reportStart: "09:42", reportEnd: "09:46" },
      "主二堂": { doorClose: "11:12", communionStart: "11:25", communionEnd: "11:37", newsStart: "11:37", newsEnd: "11:42", reportStart: "11:42", reportEnd: "11:46" }
    };
    const communionSchedule = communionScheduleByService[targetService];
    const isCommunionMode = Boolean(isCommunionWeek && communionSchedule);
    const isEightDoorClosed = isCommunionMode && currentMinute >= timeToMinutes(communionSchedule.doorClose);
    const communionFlowItems = isCommunionMode
      ? [
          { id: "communion-service", time: communionSchedule.communionStart, end: communionSchedule.communionEnd, title: "領聖餐", location: "大堂", assignee: "聖餐助手、專招、牧招" },
          { id: "communion-news", time: communionSchedule.newsStart, end: communionSchedule.newsEnd, title: "News", location: "大堂", assignee: "控場與招待團隊" },
          { id: "communion-report", time: communionSchedule.reportStart, end: communionSchedule.reportEnd, title: "特別報告", location: "大堂", assignee: "控場與招待團隊" }
        ]
      : [];
    const nextCommunionStep = communionFlowItems.find((item) => currentMinute <= timeToMinutes(item.end));
    const sortedNodes = [...filteredNodes].sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
    const nextNode = sortedNodes.find((node: any) => timeToMinutes(node.time) >= currentMinute) || sortedNodes[0] || null;
    const nextDisplay = nextCommunionStep || nextNode;
    const nextDisplayChecklist = nextNode?.checklist || [];
    const nextNodeIncompleteCount = nextDisplayChecklist.filter((item: any) => !item.is_completed).length;
    const nextDisplayRoles = nextDisplay
      ? String((nextDisplay as any).assignee || "未指定")
          .split(/[、,，/]/)
          .map((item) => item.trim())
          .filter(Boolean)
          .join("、")
      : "尚無流程";
    const nextDisplayTime = nextCommunionStep
      ? nextCommunionStep.time + "-" + nextCommunionStep.end
      : nextNode
        ? nextNode.time
        : "尚無流程";
    const nextDisplayTitle = nextDisplay ? (nextDisplay as any).title : "目前沒有後續流程";
    const stationOptions = getStationOptionsForService(targetService);
    const specialistStations = stationOptions.filter((station) => station.includes("專招"));
    const communionSpecialItems = isCommunionMode
      ? [
          { id: "communion-2f-outside", title: "2樓外場專招", time: "聖餐週", assignee: "二樓1號門", description: "聖餐週站位：二樓1號門" },
          { id: "communion-3f-hall", title: "3樓大堂專招", time: "聖餐週", assignee: "三樓1號門", description: "聖餐週站位：三樓1號門" },
          {
            id: "communion-2c-3c",
            title: "牧招2C、3C",
            time: communionSchedule.doorClose,
            assignee: isEightDoorClosed ? "回原崗位2C、3C" : "二樓8號門",
            description: isEightDoorClosed
              ? "8號門已關閉，請回到原服事崗位2C、3C"
              : "先站位二樓8號門，" + communionSchedule.doorClose + "關閉後回原崗位2C、3C"
          }
        ]
      : [];
    const specialistTaskGapItems = filteredNodes
      .filter((node: any) => String(node.assignee || "").includes("專招"))
      .filter((node: any) => {
        const checklist = node.checklist || [];
        const hasIncompleteChecklist = checklist.length > 0 && checklist.some((item: any) => !item.is_completed);
        const isNextSpecialistNode = nextNode && nextNode.id === node.id;
        return hasIncompleteChecklist || isNextSpecialistNode;
      })
      .map((node: any) => ({
        id: node.id,
        title: node.title,
        time: node.time,
        assignee: node.assignee || "未指定專招",
        description: node.location || node.details || "請總招留意此專招相關任務"
      }));
    const specialistGapItems = [...communionSpecialItems, ...specialistTaskGapItems].slice(0, 6);

    const statusCards = [
      {
        title: "報到狀態",
        value: isCheckedIn ? "已報到" : "尚未報到",
        meta: isCheckedIn ? ((displayCheckinName || "服事同工") + (checkedInAt ? "｜" + checkedInAt : "")) : "請先完成 Wi-Fi 報到",
        accent: isCheckedIn ? "text-[#00B8B8]" : "text-[#F25D6B]",
        bg: isCheckedIn ? "bg-[#00B8B8]/10 border-[#00B8B8]/20" : "bg-[#FFF2F4] border-[#F25D6B]/20"
      },
      {
        title: "崗位確認",
        value: stationReady ? "已確認" : isCheckedIn ? "待確認" : "未報到",
        meta: stationReady ? currentStation : "掃描崗位名牌後確認",
        accent: stationReady ? "text-[#00B8B8]" : "text-[#F25D6B]",
        bg: stationReady ? "bg-[#00B8B8]/10 border-[#00B8B8]/20" : "bg-[#FFF2F4] border-[#F25D6B]/20"
      },
      {
        title: "專招缺口",
        value: specialistGapItems.length === 0 ? "目前穩定" : specialistGapItems.length + " 項待注意",
        meta: isCommunionMode ? "聖餐週特殊站位已啟用" : specialistStations.length > 0 ? "專招崗位 " + specialistStations.length + " 個" : "本堂次未設定專招崗位",
        accent: specialistGapItems.length === 0 ? "text-[#00B8B8]" : "text-[#F25D6B]",
        bg: specialistGapItems.length === 0 ? "bg-[#00B8B8]/10 border-[#00B8B8]/20" : "bg-[#FFF2F4] border-[#F25D6B]/20"
      },
      {
        title: "下一個流程",
        value: nextDisplayTime,
        meta: nextDisplayTitle,
        accent: isCommunionMode ? "text-[#F25D6B]" : "text-[#6D55A3]",
        bg: isCommunionMode ? "bg-[#FFF2F4] border-[#F25D6B]/20" : "bg-[#F3EEFF] border-[#6D55A3]/20"
      }
    ];

    return (
      <div className="flex-1 overflow-y-auto pb-28 px-5 pt-6 bg-[#FFF9F3]">
        <div className="mb-6 px-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-extrabold text-[#1F2937] tracking-tight">現場狀態</h2>
              <p className="text-sm font-medium text-[#7B7B74] mt-1.5 flex items-center gap-1.5">
                <BarChart2 className="w-4 h-4 text-[#6D55A3]" /> 總招快速掌握現場重點（{targetService}）
              </p>
            </div>
            {isCommunionMode && (
              <span className="shrink-0 px-3 py-1.5 rounded-full bg-[#FFF2F4] text-[#F25D6B] text-[11px] font-black border border-[#F25D6B]/20">
                聖餐週
              </span>
            )}
          </div>
        </div>

        {isCommunionMode && (
          <div className="mb-5 p-4 rounded-[22px] bg-gradient-to-r from-[#FFF2F4] to-[#F3EEFF] border border-[#F25D6B]/15 shadow-sm">
            <div className="text-[12px] font-black text-[#F25D6B] tracking-widest mb-1">聖餐週規則</div>
            <div className="text-sm font-black text-[#1F2937] leading-relaxed">
              2樓外場：二樓1號門｜3樓大堂：三樓1號門｜牧招2C、3C：{isEightDoorClosed ? "回原崗位2C、3C" : "先站二樓8號門，" + communionSchedule.doorClose + "後回原崗位"}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mb-6">
          {statusCards.map((item) => (
            <div key={item.title} className={"p-4 rounded-[22px] border shadow-sm " + item.bg}>
              <div className="text-[11px] font-black tracking-widest text-[#7B7B74] mb-2">{item.title}</div>
              <div className={"text-[20px] leading-tight font-black " + item.accent}>{item.value}</div>
              <div className="mt-1.5 text-[11px] leading-relaxed font-bold text-[#7B7B74] line-clamp-2">{item.meta}</div>
            </div>
          ))}
        </div>

        <div className="p-5 mb-5 bg-white rounded-[24px] border border-[#E6EAF0] shadow-lg shadow-[#6D55A3]/5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-[15px] font-black text-[#1F2937] flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-[#F25D6B]" /> 專招缺口
              </h3>
              <p className="text-[11px] font-bold text-[#7B7B74] mt-1">只列需要總招立刻注意的專招與聖餐週站位</p>
            </div>
            <span className="px-3 py-1 rounded-full bg-[#FFF2F4] text-[#F25D6B] text-[10px] font-black border border-[#F25D6B]/15">
              {specialistGapItems.length === 0 ? "穩定" : "待處理"}
            </span>
          </div>

          {specialistGapItems.length === 0 ? (
            <div className="p-4 rounded-[18px] bg-[#00B8B8]/10 border border-[#00B8B8]/20 text-[#00B8B8] text-sm font-black text-center">
              目前沒有明顯專招缺口
            </div>
          ) : (
            <div className="space-y-2.5">
              {specialistGapItems.map((item: any) => (
                <div key={item.id} className="p-3.5 rounded-[18px] bg-[#FFF2F4]/70 border border-[#F25D6B]/15">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-black text-[#1F2937] leading-snug">{item.title}</div>
                      <div className="text-[11px] font-bold text-[#7B7B74] mt-1 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {item.time}｜{item.assignee}
                      </div>
                      <div className="text-[11px] font-bold text-[#7B7B74] mt-1 leading-relaxed">{item.description}</div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full bg-white text-[#F25D6B] text-[10px] font-black border border-[#F25D6B]/10 shrink-0">
                      注意
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-5 mb-5 bg-gradient-to-br from-white to-[#F3EEFF]/55 rounded-[24px] border border-[#E6EAF0] shadow-lg shadow-[#6D55A3]/5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-[15px] font-black text-[#1F2937] flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#6D55A3]" /> 下一個流程
              </h3>
              <p className="text-[11px] font-bold text-[#7B7B74] mt-1">聖餐週會優先顯示領聖餐、News、特別報告</p>
            </div>
            <span className="px-3 py-1 rounded-full bg-white text-[#6D55A3] text-[12px] font-black border border-[#6D55A3]/15">
              {nextDisplayTime === "尚無流程" ? "--:--" : nextDisplayTime}
            </span>
          </div>

          {nextDisplay ? (
            <div className="space-y-3">
              <div className="p-4 rounded-[18px] bg-white border border-[#E6EAF0]">
                <div className="text-base font-black text-[#1F2937] leading-snug">{nextDisplayTitle}</div>
                <div className="mt-2 grid grid-cols-1 gap-1.5 text-[12px] font-bold text-[#7B7B74]">
                  <div className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-[#F25D6B]" /> {(nextDisplay as any).location || "未指定地點"}</div>
                  <div className="flex items-center gap-1.5"><User className="w-3.5 h-3.5 text-[#6D55A3]" /> {nextDisplayRoles}</div>
                </div>
              </div>
              <div className="flex items-center justify-between text-[12px] font-black text-[#7B7B74]">
                <span>任務完成率</span>
                <span>{completedTasks.length}/{allTasks.length}</span>
              </div>
              <div className="w-full h-2.5 overflow-hidden rounded-full bg-[#E6EAF0]">
                <div className="h-full bg-gradient-to-r from-[#F25D6B] to-[#6D55A3] rounded-full transition-all duration-700" style={{ width: String(allTasks.length === 0 ? 0 : completionRate) + "%" }} />
              </div>
              {nextNodeIncompleteCount > 0 && !nextCommunionStep && (
                <div className="text-[11px] font-bold text-[#F25D6B] bg-[#FFF2F4] border border-[#F25D6B]/10 rounded-[14px] px-3 py-2">
                  下一個流程仍有 {nextNodeIncompleteCount} 項確認事項未完成
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 rounded-[18px] bg-white border border-[#E6EAF0] text-center text-sm font-bold text-[#7B7B74]">
              目前沒有後續流程
            </div>
          )}
        </div>

        <div className="p-4 rounded-[20px] bg-white/70 border border-[#E6EAF0] text-[11px] leading-relaxed font-bold text-[#7B7B74]">
          現場狀態不再依角色分組；需要查個別人員時，請使用「同工狀態」。{isCommunionMode ? " 本週已套用聖餐週規則。" : ""}
        </div>
      </div>
    );
  };
`;

  source = source.slice(0, startIndex) + replacement + source.slice(endIndex);
  changed = true;
  console.log("[status-dashboard] renderReviewView replaced.");
}

const labelNeedle = `{ key: "status", label: "狀態", icon: BarChart2, color: "purple" }`;
const labelReplacement = `{ key: "status", label: "現場", icon: BarChart2, color: "purple" }`;
if (source.includes(labelReplacement)) {
  console.log("[status-dashboard] nav label already updated.");
} else if (source.includes(labelNeedle)) {
  source = source.replace(labelNeedle, labelReplacement);
  changed = true;
  console.log("[status-dashboard] nav label updated.");
} else {
  console.warn("[status-dashboard] nav label target not found; skipped.");
}

source = source.replace(/今日同工/g, "同工狀態");

if (changed) {
  fs.writeFileSync(pagePath, source, "utf8");
  console.log("[status-dashboard] app/page.tsx patched for this build.");
} else {
  console.log("[status-dashboard] no changes needed.");
}
