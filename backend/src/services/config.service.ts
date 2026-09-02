import { getOrCreateSettings } from "./settings.service";
import { SCHOOL_TIMEZONE } from "./attendanceTime";

export interface AppConfig {
  schoolName: string;
  attendanceStartTime: string;
  lateAfterTime: string;
  timezone: string;
  serverTime: string;
}

export async function getAppConfig(): Promise<AppConfig> {
  const settings = await getOrCreateSettings();
  return {
    schoolName: settings.schoolName,
    attendanceStartTime: settings.attendanceStartTime,
    lateAfterTime: settings.lateAfterTime,
    timezone: SCHOOL_TIMEZONE,
    serverTime: new Date().toISOString()
  };
}