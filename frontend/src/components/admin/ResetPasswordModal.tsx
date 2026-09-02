import { FormEvent, useEffect, useState } from "react";
import { adminService } from "../../services";
import { getErrorMessage } from "../../services/api";
import { User } from "../../types";
import { Modal } from "../ui/Modal";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { Alert } from "../ui/Alert";

export function ResetPasswordModal({
  open,
  onClose,
  user,
  onReset
}: {
  open: boolean;
  onClose: () => void;
  user: User | null;
  onReset: () => void;
}) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setPassword("");
      setConfirmPassword("");
      setError(null);
      setLoading(false);
    }
  }, [open]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await adminService.resetPassword(user.id, password, confirmPassword);
      onReset();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Reset Password"
      description={
        user ? `Set a new password for ${user.fullName}.` : undefined
      }
    >
      <form onSubmit={handleSubmit}>
        {error && (
          <div className="mb-3">
            <Alert variant="error" message={error} />
          </div>
        )}

        <Input
          label="New Password"
          type="password"
          placeholder="Min. 8 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint="Use at least 8 characters."
          autoComplete="new-password"
        />
        <Input
          label="Confirm New Password"
          type="password"
          placeholder="Re-enter password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
        />

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" loading={loading} loadingText="Resetting password...">
            Reset Password
          </Button>
        </div>
      </form>
    </Modal>
  );
}