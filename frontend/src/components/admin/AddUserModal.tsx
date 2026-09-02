import { FormEvent, useEffect, useState } from "react";
import { adminService, CreateUserPayload } from "../../services";
import { getErrorMessage } from "../../services/api";
import { Department, Role, UserStatus } from "../../types";
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
  password: string;
  confirm_password: string;
}

const initialForm: FormState = {
  full_name: "",
  email: "",
  phone_number: "",
  department_id: "",
  role: "STAFF",
  status: "ACTIVE",
  password: "",
  confirm_password: ""
};

interface FormErrors {
  full_name?: string;
  email?: string;
  phone_number?: string;
  department_id?: string;
  password?: string;
  confirm_password?: string;
  general?: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\+?[0-9\s\-()]{7,20}$/;

export function AddUserModal({
  open,
  onClose,
  departments,
  onCreated
}: {
  open: boolean;
  onClose: () => void;
  departments: Department[];
  onCreated: (user: { createdAtNotice: string }) => void;
}) {
  const [form, setForm] = useState<FormState>(initialForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(initialForm);
      setErrors({});
      setLoading(false);
    }
  }, [open]);

  function setField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function validate(): boolean {
    const next: FormErrors = {};
    if (form.full_name.trim().length < 2) {
      next.full_name = "Please enter a full name.";
    }
    if (!form.email.trim()) {
      next.email = "Email is required.";
    } else if (!EMAIL_REGEX.test(form.email.trim())) {
      next.email = "Please enter a valid email address.";
    }
    if (!form.phone_number.trim()) {
      next.phone_number = "Phone number is required.";
    } else if (!PHONE_REGEX.test(form.phone_number.trim())) {
      next.phone_number = "Please enter a valid phone number.";
    }
    if (!form.department_id) {
      next.department_id = "Please select a department.";
    }
    if (form.password.length < 8) {
      next.password = "Password must be at least 8 characters.";
    }
    if (form.confirm_password !== form.password) {
      next.confirm_password = "Passwords do not match.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    const payload: CreateUserPayload = {
      full_name: form.full_name.trim(),
      email: form.email.trim(),
      phone_number: form.phone_number.trim(),
      department_id: Number(form.department_id),
      role: form.role,
      status: form.status,
      password: form.password,
      confirm_password: form.confirm_password
    };

    setLoading(true);
    setErrors({});
    try {
      await adminService.createUser(payload);
      onCreated({ createdAtNotice: `Account created for ${payload.full_name}.` });
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
      title="Add User"
      description="Create a staff or administrator account directly."
    >
      <form onSubmit={handleSubmit}>
        {errors.general && (
          <div className="mb-3">
            <Alert variant="error" message={errors.general} />
          </div>
        )}

        <Input
          label="Full Name"
          placeholder="Jane Smith"
          value={form.full_name}
          onChange={(e) => setField("full_name", e.target.value)}
          error={errors.full_name}
          autoComplete="off"
        />
        <Input
          label="Email"
          type="email"
          placeholder="you@school.com"
          value={form.email}
          onChange={(e) => setField("email", e.target.value)}
          error={errors.email}
          autoComplete="off"
        />
        <Input
          label="Phone Number"
          type="tel"
          placeholder="+1 234 567 890"
          value={form.phone_number}
          onChange={(e) => setField("phone_number", e.target.value)}
          error={errors.phone_number}
          autoComplete="off"
        />
        <Select
          label="Department"
          placeholder="Select department"
          value={form.department_id}
          onChange={(e) => setField("department_id", e.target.value)}
          error={errors.department_id}
          disabled={departments.length === 0}
          options={departments.map((d) => ({ value: d.id, label: d.name }))}
        />
        <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
          <Select
            label="Role"
            value={form.role}
            onChange={(e) => setField("role", e.target.value as Role)}
            options={[
              { value: "STAFF", label: "Staff" },
              { value: "ADMIN", label: "Admin" }
            ]}
          />
          <Select
            label="Status"
            value={form.status}
            onChange={(e) => setField("status", e.target.value as UserStatus)}
            options={[
              { value: "PENDING", label: "Pending" },
              { value: "ACTIVE", label: "Active" },
              { value: "REJECTED", label: "Rejected" }
            ]}
          />
        </div>
        <Input
          label="Password"
          type="password"
          placeholder="Min. 8 characters"
          value={form.password}
          onChange={(e) => setField("password", e.target.value)}
          error={errors.password}
          hint="Use at least 8 characters."
          autoComplete="new-password"
        />
        <Input
          label="Confirm Password"
          type="password"
          placeholder="Re-enter password"
          value={form.confirm_password}
          onChange={(e) => setField("confirm_password", e.target.value)}
          error={errors.confirm_password}
          autoComplete="new-password"
        />

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" loading={loading} loadingText="Creating user...">
            Create User
          </Button>
        </div>
      </form>
    </Modal>
  );
}