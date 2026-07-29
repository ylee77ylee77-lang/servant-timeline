export type MyServiceStatus = "upcoming" | "today" | "checked_in" | "completed";

export type MyServiceActionKind =
  | "check_in"
  | "go_to_report_location"
  | "view_timeline"
  | "wait"
  | "completed";

export type MyServiceDashboardState = {
  status: MyServiceStatus;
  statusLabel: string;
  nextAction: {
    kind: MyServiceActionKind;
    label: string;
    targetTab: "checkin" | "timeline" | null;
  };
};

type MyServiceDashboardInput = {
  today: string;
  serviceDate: string;
  serviceStatus: string;
  assignmentStatus: string;
  checkInStatus?: string | null;
};

const STATUS_LABELS: Record<MyServiceStatus, string> = {
  upcoming: "即將到來",
  today: "今天服事",
  checked_in: "已報到",
  completed: "已完成",
};

export function deriveMyServiceDashboardState({
  today,
  serviceDate,
  serviceStatus,
  assignmentStatus,
  checkInStatus,
}: MyServiceDashboardInput): MyServiceDashboardState {
  if (serviceStatus === "completed" || assignmentStatus === "completed") {
    return {
      status: "completed",
      statusLabel: STATUS_LABELS.completed,
      nextAction: {
        kind: "completed",
        label: "已完成今日服事",
        targetTab: null,
      },
    };
  }

  if (checkInStatus === "checked_in" || checkInStatus === "station_confirmed") {
    const stationConfirmed = checkInStatus === "station_confirmed";
    return {
      status: "checked_in",
      statusLabel: STATUS_LABELS.checked_in,
      nextAction: stationConfirmed
        ? {
            kind: "view_timeline",
            label: "查看今日時間軸",
            targetTab: "timeline",
          }
        : {
            kind: "go_to_report_location",
            label: "前往集合地點",
            targetTab: null,
          },
    };
  }

  if (serviceDate === today) {
    return {
      status: "today",
      statusLabel: STATUS_LABELS.today,
      nextAction: {
        kind: "check_in",
        label: "前往報到",
        targetTab: "checkin",
      },
    };
  }

  return {
    status: "upcoming",
    statusLabel: STATUS_LABELS.upcoming,
    nextAction: {
      kind: "wait",
      label: "等待開始",
      targetTab: null,
    },
  };
}
