export const SERVICE_TYPES = ["六晚崇", "主一堂", "主二堂"] as const;

export type ServiceType = (typeof SERVICE_TYPES)[number];

export const SERVICE_DAY_BY_TYPE: Record<ServiceType, number> = {
  六晚崇: 6,
  主一堂: 0,
  主二堂: 0,
};

export const STATION_OPTIONS_BY_SERVICE: Record<ServiceType, readonly string[]> = {
  六晚崇: [
    "總招", "聖餐助手", "電梯專招", "手扶梯專招", "2樓外場專招", "2樓大堂專招",
    "1A 區塊牧招", "1B 區塊牧招", "2A 區塊牧招", "2B 區塊牧招", "2C 區塊牧招",
    "3A 區塊牧招", "3B 區塊牧招", "3C 區塊牧招", "4A 區塊牧招", "4B 區塊牧招",
    "4C 區塊牧招", "5 區塊牧招",
  ],
  主一堂: [
    "總招", "副總招", "聖餐助手", "電梯專招", "手扶梯專招", "2樓外場專招", "2樓大堂專招",
    "3樓大堂專招", "1A 區塊牧招", "1B 區塊牧招", "2A 區塊牧招", "2B 區塊牧招",
    "2C 區塊牧招", "3A 區塊牧招", "3B 區塊牧招", "3C 區塊牧招", "4A 區塊牧招",
    "4B 區塊牧招", "4C 區塊牧招", "5 區塊牧招", "6 區塊牧招", "7A 區塊牧招",
    "7B 區塊牧招", "8 區塊牧招", "9A 區塊牧招",
  ],
  主二堂: [
    "總招", "副總招", "聖餐助手", "電梯專招", "手扶梯專招", "2樓外場專招", "2樓大堂專招",
    "3樓大堂專招", "1A 區塊牧招", "1B 區塊牧招", "2A 區塊牧招", "2B 區塊牧招",
    "2C 區塊牧招", "3A 區塊牧招", "3B 區塊牧招", "3C 區塊牧招", "4A 區塊牧招",
    "4B 區塊牧招", "4C 區塊牧招", "5 區塊牧招", "6 區塊牧招", "7A 區塊牧招",
    "7B 區塊牧招", "8 區塊牧招", "9A 區塊牧招", "10 區塊牧招",
  ],
};

export function isServiceType(value: unknown): value is ServiceType {
  return SERVICE_TYPES.includes(String(value) as ServiceType);
}

export function inferStationRole(station: string) {
  if (station.includes("副總招")) return "副總招";
  if (station.includes("總招")) return "總招";
  if (station.includes("聖餐")) return "聖餐助手";
  if (station.includes("牧招")) return "牧招";
  return "專招";
}
