import { useEffect, useState } from "react";
import { Save, MapPin, Clock } from "lucide-react";
import { settingsService, UpdateSettingsPayload } from "../../services";
import { getErrorMessage } from "../../services/api";
import { Button } from "../../components/ui/Button";
import { Alert } from "../../components/ui/Alert";
import { Input } from "../../components/ui/Input";
import { SchoolSettings } from "../../types";

export function SettingsPage() {
  const [settings, setSettings] = useState<SchoolSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [schoolName, setSchoolName] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [geofenceRadius, setGeofenceRadius] = useState("");
  const [attendanceStartTime, setAttendanceStartTime] = useState("");
  const [lateAfterTime, setLateAfterTime] = useState("");

  useEffect(() => {
    let active = true;
    settingsService
      .getSettings()
      .then((data) => {
        if (!active) return;
        setSettings(data);
        setSchoolName(data.schoolName);
        setLatitude(String(data.latitude));
        setLongitude(String(data.longitude));
        setGeofenceRadius(String(data.geofenceRadius));
        setAttendanceStartTime(data.attendanceStartTime);
        setLateAfterTime(data.lateAfterTime);
      })
      .catch((err) => {
        if (active) setError(getErrorMessage(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleSave() {
    setNotice(null);
    setError(null);

    const radius = Number(geofenceRadius);
    const lat = Number(latitude);
    const lon = Number(longitude);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      setError("Latitude must be a number between -90 and 90.");
      return;
    }
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
      setError("Longitude must be a number between -180 and 180.");
      return;
    }
    if (!Number.isFinite(radius) || radius < 10 || radius > 1000) {
      setError("Geofence radius must be between 10 and 1000 meters.");
      return;
    }

    const payload: UpdateSettingsPayload = {
      school_name: schoolName.trim(),
      latitude: lat,
      longitude: lon,
      geofence_radius: radius,
      attendance_start_time: attendanceStartTime,
      late_after_time: lateAfterTime
    };

    setSaving(true);
    try {
      const updated = await settingsService.updateSettings(payload);
      setSettings(updated);
      setNotice("School settings saved.");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">
          School Settings
        </h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted))]">
          Location, geofence and attendance windows used by every staff check-in
        </p>
      </div>

      {notice && (
        <div className="mb-4">
          <Alert variant="success" message={notice} />
        </div>
      )}
      {error && (
        <div className="mb-4">
          <Alert variant="error" message={error} />
        </div>
      )}

      {loading ? (
        <p className="py-10 text-center text-sm text-[hsl(var(--muted))]">
          Loading settings...
        </p>
      ) : settings ? (
        <div className="space-y-5">
          <section className="card p-5" aria-label="School information">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-bold text-[hsl(var(--foreground))]">
                School information
              </h2>
              <MapPin className="h-5 w-5 text-[hsl(var(--muted))]" aria-hidden />
            </div>
            <Input
              label="School name"
              value={schoolName}
              onChange={(e) => setSchoolName(e.target.value)}
              maxLength={200}
            />
          </section>

          <section className="card p-5" aria-label="Attendance location">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-bold text-[hsl(var(--foreground))]">
                Attendance location
              </h2>
              <MapPin className="h-5 w-5 text-[hsl(var(--muted))]" aria-hidden />
            </div>
            <p className="mb-4 text-sm text-[hsl(var(--muted))]">
              Staff can only check in within this radius of the school
              coordinates.
            </p>
            <Input
              label="Latitude"
              type="number"
              step="any"
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
              hint="Decimal degrees, between -90 and 90"
            />
            <Input
              label="Longitude"
              type="number"
              step="any"
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
              hint="Decimal degrees, between -180 and 180"
            />
            <Input
              label="Geofence radius (meters)"
              type="number"
              value={geofenceRadius}
              onChange={(e) => setGeofenceRadius(e.target.value)}
              hint="Between 10 and 1000 meters"
            />
          </section>

          <section className="card p-5" aria-label="Attendance window">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-bold text-[hsl(var(--foreground))]">
                Attendance window
              </h2>
              <Clock className="h-5 w-5 text-[hsl(var(--muted))]" aria-hidden />
            </div>
            <p className="mb-4 text-sm text-[hsl(var(--muted))]">
              Times use the school timezone (Africa/Kigali).
            </p>
            <Input
              label="Attendance start time"
              type="time"
              value={attendanceStartTime}
              onChange={(e) => setAttendanceStartTime(e.target.value)}
            />
            <Input
              label="Late after time"
              type="time"
              value={lateAfterTime}
              onChange={(e) => setLateAfterTime(e.target.value)}
            />
          </section>

          <Button onClick={handleSave} loading={saving} loadingText="Saving..." className="w-full sm:w-auto">
            <Save className="h-4 w-4" aria-hidden />
            Save settings
          </Button>
        </div>
      ) : null}
    </div>
  );
}