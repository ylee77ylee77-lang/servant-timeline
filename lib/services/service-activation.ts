import type { ServiceType } from "@/lib/services/catalog";

export const SERVICE_TIME_ZONE = "Asia/Taipei";

export const SERVICE_RUNTIME_CONFIG: Record<ServiceType, {
  reportTime: string;
  startsAt: string;
  location: string;
}> = {
  "六晚崇": {
    reportTime: "18:00",
    startsAt: "19:00",
    location: "夏凱納靈糧堂",
  },
  "主一堂": {
    reportTime: "08:00",
    startsAt: "09:00",
    location: "夏凱納靈糧堂",
  },
  "主二堂": {
    reportTime: "10:00",
    startsAt: "11:00",
    location: "夏凱納靈糧堂",
  },
};

export type ServiceActivationState = {
  dateKey: string;
  dayOfWeek: number;
  minuteOfDay: number;
  provisionServiceTypes: ServiceType[];
  activeServiceTypes: ServiceType[];
  defaultServiceType: ServiceType | null;
};

function getTaipeiParts(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SERVICE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));

  return {
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
    dayOfWeek: weekdayMap[get("weekday")] ?? -1,
    minuteOfDay: hour * 60 + minute,
  };
}

export function getServiceActivationState(now = new Date()): ServiceActivationState {
  const { dateKey, dayOfWeek, minuteOfDay } = getTaipeiParts(now);

  if (dayOfWeek === 6) {
    const active = minuteOfDay >= 17 * 60 && minuteOfDay < 21 * 60 + 45;
    return {
      dateKey,
      dayOfWeek,
      minuteOfDay,
      provisionServiceTypes: ["六晚崇"],
      activeServiceTypes: active ? ["六晚崇"] : [],
      defaultServiceType: active ? "六晚崇" : null,
    };
  }

  if (dayOfWeek === 0) {
    const firstServiceActive = minuteOfDay < 12 * 60 + 45;
    const secondServiceActive = minuteOfDay >= 10 * 60 && minuteOfDay < 12 * 60 + 45;
    const activeServiceTypes: ServiceType[] = [];

    if (firstServiceActive) activeServiceTypes.push("主一堂");
    if (secondServiceActive) activeServiceTypes.push("主二堂");

    return {
      dateKey,
      dayOfWeek,
      minuteOfDay,
      provisionServiceTypes: ["主一堂", "主二堂"],
      activeServiceTypes,
      defaultServiceType: secondServiceActive
        ? "主二堂"
        : firstServiceActive
          ? "主一堂"
          : null,
    };
  }

  return {
    dateKey,
    dayOfWeek,
    minuteOfDay,
    provisionServiceTypes: [],
    activeServiceTypes: [],
    defaultServiceType: null,
  };
}

export function isServiceActiveNow(serviceType: ServiceType, now = new Date()) {
  return getServiceActivationState(now).activeServiceTypes.includes(serviceType);
}
