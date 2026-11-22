export const VOICE_STARTUP_CONFIRMATION = "語音助理已開啟。";

export function canTestVoiceBeforeCheckIn(roles: readonly string[]) {
  return roles.includes("coordinator") || roles.includes("admin");
}
