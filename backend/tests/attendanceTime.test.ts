import {
  buildAttendanceTiming,
  getSchoolToday,
  parseCalendarDate,
  utcCalendarDate
} from "../src/services/attendanceTime";

describe("buildAttendanceTiming (Africa/Kigali school timezone)", () => {
  it("derives the attendance date from the Kigali calendar date (UTC+02:00)", () => {
    // 2026-08-27T23:00Z is 2026-08-28T01:00 in Africa/Kigali.
    const candidate = new Date("2026-08-27T23:00:00.000Z");
    const timing = buildAttendanceTiming(candidate);

    expect(timing.attendanceDate.toISOString().slice(0, 10)).toBe("2026-08-28");
    expect(timing.checkInTime.getTime()).toBe(candidate.getTime());
  });

  it("does not cross into the previous day for evening Kigali check-ins", () => {
    // 2026-08-28T21:30Z is 2026-08-28T23:30 in Africa/Kigali.
    const candidate = new Date("2026-08-28T21:30:00.000Z");
    const timing = buildAttendanceTiming(candidate);
    expect(timing.attendanceDate.toISOString().slice(0, 10)).toBe("2026-08-28");
  });

  it("marks check-in at/after LATE_AFTER_TIME as LATE (Kigali clock)", () => {
    // Default env late threshold 08:00 Kigali == 06:00 UTC.
    expect(
      buildAttendanceTiming(new Date("2026-08-28T05:59:00.000Z")).status
    ).toBe("PRESENT");
    expect(
      buildAttendanceTiming(new Date("2026-08-28T06:00:00.000Z")).status
    ).toBe("LATE");
    expect(
      buildAttendanceTiming(new Date("2026-08-28T07:00:00.000Z")).status
    ).toBe("LATE");
  });

  it("uses an explicit late_after_time when provided", () => {
    // 07:00 Kigali == 05:00 UTC.
    expect(
      buildAttendanceTiming(new Date("2026-08-28T05:00:00.000Z"), "07:00").status
    ).toBe("LATE");
    expect(
      buildAttendanceTiming(new Date("2026-08-28T04:59:00.000Z"), "07:00").status
    ).toBe("PRESENT");
  });
});

describe("getSchoolToday (Africa/Kigali)", () => {
  it("returns the Kigali calendar date for a given instant", () => {
    // 2026-08-27T23:30Z is 2026-08-28T01:30 in Africa/Kigali.
    expect(getSchoolToday(new Date("2026-08-27T23:30:00.000Z")).toISOString().slice(0, 10)).toBe(
      "2026-08-28"
    );
    expect(getSchoolToday(new Date("2026-08-28T09:00:00.000Z")).toISOString().slice(0, 10)).toBe(
      "2026-08-28"
    );
  });
});

describe("parseCalendarDate", () => {
  it("parses YYYY-MM-DD as that exact UTC calendar date", () => {
    const d = parseCalendarDate("2026-01-15");
    expect(d.toISOString()).toBe("2026-01-15T00:00:00.000Z");
  });

  it("utcCalendarDate builds the requested calendar date in UTC", () => {
    const d = utcCalendarDate(2026, 7, 28);
    expect(d.toISOString()).toBe("2026-08-28T00:00:00.000Z");
  });
});