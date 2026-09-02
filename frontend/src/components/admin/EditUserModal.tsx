import { FormEvent, useEffect, useState } from "react";
import { adminService, UpdateUserPayload } from "../../services";
import { getErrorMessage } from "../../services/api";
import { Department, Role, User, UserStatus } from "../../types";
import { Modal } from "../ui/Modal";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import { Button } from "../ui/Button";
import { Alert } from "../ui/Alert";

interface FormState {
  full_name: string;
  email: string;
  phone_number: string;
  department_id: string;
  role: Role;
  status: UserStatus;
}

interface FormErrors {
  general?: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\+?[0-9\s\-()]{7,20}$/;

export function EditUserModal({
  open,
  onClose,
  user,
  departments,
  onUpdated
}: {
  open: boolean;
  onClose: () => void;
  user: User | null;
  departments: Department[];
  onUpdated: () => void;
}) {
  const [form, setForm] = useState<FormState | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && user) {
      setForm({
        full_name: user.fullName,
        email: user.email,
        phone_number: user.phoneNumber,
        department_id: String(user.departmentId),
        role: user.role,
        status: user.status
      });
      setErrors({});
      setLoading(false);
    }
  }, [open, user]);

  if (!form) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setLoading(true);
    setErrors({});

    const payload: UpdateUserPayload = {};

    const trimmedName = form.full_name.trim();
    const trimmedEmail = form.email.trim();
    const trimmedPhone = form.phone_number.trim();

    if (trimmedName.length < 2) {
      setErrors({ general: "Full name must be at least 2 characters." });
      setLoading(false);
      return;
    }
    if (!EMAIL_REGEX.test(trimmedEmail)) {
      setErrors({ general: "Please enter a valid email address." });
      setLoading(false);
      return;
    }
    if (!PHONE_REGEX.test(trimmedPhone)) {
      setErrors({ general: "Please enter a valid phone number." });
      setLoading(false);
      return;
    }

    payload.full_name = trimmedName;
    payload.email = trimmedEmail;
    payload.phone_number = trimmedPhone;
    payload.department_id = Number(form.department_id);
    payload.role = form.role;
    payload.status = form.status;

    try {
      await adminService.updateUser(user!.id, payload);
      onUpdated();
      onClose();
    } catch (err) {
      setErrors({ general: getErrorMessage(err) });
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit User"
      description={
        user?.role === "ADMIN"
          ? "Changing role or status may be restricted to keep at least one active administrator."
          : undefined
      }
    >
      <form onSubmit={handleSubmit}>
        {errors.general && (
          <div className="mb-3">
            <Alert variant="error" message={errors.general} />
          </div>
        )}

        <Input
          label="Full Name"
          value={form.full_name}
          onChange={(e) => setForm({ ...form, full_name: e.target.value })}
        />
        <Input
          label="Email"
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <Input
          label="Phone Number"
          type="tel"
          value={form.phone_number}
          onChange={(e) => setForm({ ...form, phone_number: e.target.value })}
        />
        <Select
          label="Department"
          value={form.department_id}
          onChange={(e) => setForm({ ...form, department_id: e.target.value })}
          options={departments.map((d) => ({ value: d.id, label: d.name }))}
        />
        <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
          <Select
            label="Role"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
            options={[
              { value: "STAFF", label: "Staff" },
              { value: "ADMIN", label: "Admin" }
            ]}
          />
          <Select
            label="Status"
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value as UserStatus })}
            options={[
              { value: "PENDING", label: "Pending" },
              { value: "ACTIVE", label: "Active" },
              { value: "REJECTED", label: "Rejected" }
            ]}
          />
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" loading={loading} loadingText="Saving changes...">
            Save Changes
          </Button>
        </div>
      </form>
    </Modal>
  );
}