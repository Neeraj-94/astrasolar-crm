"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, Upload, Loader2 } from "lucide-react";

const PHONE_LABELS = ["mobile", "work", "home", "other"] as const;
const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5MB
const ACCEPTED_AVATAR_TYPES = ["image/jpeg", "image/png"];

interface PhoneRow {
  id: string; // local id (cuid for new rows)
  label: string;
  number: string;
  isPrimary: boolean;
}

interface Props {
  user: {
    email: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  phones: PhoneRow[];
}

function randomId() {
  return "new_" + Math.random().toString(36).slice(2, 10);
}

export function ProfileForm({ user, phones: initialPhones }: Props) {
  const router = useRouter();

  // --- Display name + phones ---
  const [displayName, setDisplayName] = useState(user.displayName ?? "");
  const [phones, setPhones] = useState<PhoneRow[]>(
    initialPhones.length > 0
      ? initialPhones
      : [{ id: randomId(), label: "mobile", number: "", isPrimary: true }],
  );
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailsMsg, setDetailsMsg] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);

  // --- Avatar ---
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user.avatarUrl);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarErr, setAvatarErr] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // --- Password ---
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);

  // -------------------------- avatar handlers --------------------------
  async function handleAvatarChange(
    e: React.ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting same file
    if (!file) return;

    setAvatarErr(null);
    if (!ACCEPTED_AVATAR_TYPES.includes(file.type)) {
      setAvatarErr("Please choose a JPG or PNG image.");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarErr("Image must be 5MB or smaller.");
      return;
    }

    setUploadingAvatar(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/profile/avatar", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Upload failed");
      }
      setAvatarUrl(data.avatarUrl);
      router.refresh();
    } catch (err) {
      setAvatarErr(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingAvatar(false);
    }
  }

  // -------------------------- phone handlers --------------------------
  function addPhone() {
    setPhones((p) => [
      ...p,
      {
        id: randomId(),
        label: "mobile",
        number: "",
        isPrimary: p.length === 0,
      },
    ]);
  }

  function removePhone(id: string) {
    setPhones((p) => {
      const next = p.filter((x) => x.id !== id);
      if (next.length > 0 && !next.some((x) => x.isPrimary)) {
        next[0].isPrimary = true;
      }
      return next;
    });
  }

  function updatePhone(id: string, patch: Partial<PhoneRow>) {
    setPhones((p) =>
      p.map((x) => (x.id === id ? { ...x, ...patch } : x)),
    );
  }

  function setPrimary(id: string) {
    setPhones((p) =>
      p.map((x) => ({ ...x, isPrimary: x.id === id })),
    );
  }

  // -------------------------- details save --------------------------
  async function saveDetails(e: React.FormEvent) {
    e.preventDefault();
    setDetailsMsg(null);

    const trimmedName = displayName.trim();
    if (trimmedName.length === 0) {
      setDetailsMsg({ kind: "error", text: "Display name is required." });
      return;
    }

    // Drop rows with empty numbers before sending.
    const cleanedPhones = phones
      .map((p) => ({ ...p, number: p.number.trim() }))
      .filter((p) => p.number.length > 0);

    setSavingDetails(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          displayName: trimmedName,
          phones: cleanedPhones.map((p) => ({
            label: p.label,
            number: p.number,
            isPrimary: p.isPrimary,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setDetailsMsg({ kind: "ok", text: "Profile updated." });
      router.refresh();
    } catch (err) {
      setDetailsMsg({
        kind: "error",
        text: err instanceof Error ? err.message : "Failed to save",
      });
    } finally {
      setSavingDetails(false);
    }
  }

  // -------------------------- password save --------------------------
  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordMsg(null);

    if (newPassword.length < 8) {
      setPasswordMsg({
        kind: "error",
        text: "New password must be at least 8 characters.",
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({
        kind: "error",
        text: "New password and confirmation do not match.",
      });
      return;
    }

    setSavingPassword(true);
    try {
      // The API verifies the current password (bcrypt) before changing it.
      const res = await fetch("/api/profile/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (data as { error?: string }).error || "Failed to update password.",
        );
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMsg({ kind: "ok", text: "Password updated." });
    } catch (err) {
      setPasswordMsg({
        kind: "error",
        text: err instanceof Error ? err.message : "Failed to update password.",
      });
    } finally {
      setSavingPassword(false);
    }
  }

  const initials =
    (displayName || user.email)
      .split(/\s|@/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join("") || "U";

  return (
    <div className="space-y-6">
      {/* Avatar */}
      <Card>
        <CardHeader>
          <CardTitle>Profile photo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt=""
                className="h-20 w-20 rounded-full object-cover border"
              />
            ) : (
              <span className="h-20 w-20 rounded-full bg-primary/10 text-primary text-xl font-medium flex items-center justify-center border">
                {initials}
              </span>
            )}
            <div className="flex flex-col gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_AVATAR_TYPES.join(",")}
                onChange={handleAvatarChange}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploadingAvatar}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploadingAvatar ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploading…
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    {avatarUrl ? "Change photo" : "Upload photo"}
                  </>
                )}
              </Button>
              <p className="text-xs text-muted-foreground">
                JPG or PNG, up to 5MB.
              </p>
              {avatarErr && (
                <p className="text-xs text-destructive">{avatarErr}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Display name + phones */}
      <Card>
        <CardHeader>
          <CardTitle>Account details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveDetails} className="space-y-5">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={user.email} disabled />
              <p className="text-xs text-muted-foreground">
                Email is managed via your sign-in provider and can&apos;t be
                changed here.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="displayName">Display name</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                maxLength={120}
                required
              />
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label>Phone numbers</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={addPhone}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
              </div>

              {phones.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No phone numbers yet. Click Add to create one.
                </p>
              )}

              <div className="space-y-2">
                {phones.map((p) => (
                  <div
                    key={p.id}
                    className="flex flex-wrap items-center gap-2 rounded-md border p-2"
                  >
                    <select
                      value={p.label}
                      onChange={(e) =>
                        updatePhone(p.id, { label: e.target.value })
                      }
                      className="h-9 rounded-md border bg-background px-2 text-sm"
                      aria-label="Phone label"
                    >
                      {PHONE_LABELS.map((l) => (
                        <option key={l} value={l}>
                          {l[0].toUpperCase() + l.slice(1)}
                        </option>
                      ))}
                    </select>
                    <Input
                      type="tel"
                      inputMode="tel"
                      placeholder="e.g. +61 400 123 456"
                      value={p.number}
                      onChange={(e) =>
                        updatePhone(p.id, { number: e.target.value })
                      }
                      className="flex-1 min-w-[180px]"
                    />
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground select-none">
                      <input
                        type="radio"
                        name="primary-phone"
                        checked={p.isPrimary}
                        onChange={() => setPrimary(p.id)}
                      />
                      Primary
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removePhone(p.id)}
                      aria-label="Remove phone"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={savingDetails}>
                {savingDetails && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Save changes
              </Button>
              {detailsMsg && (
                <p
                  className={
                    detailsMsg.kind === "ok"
                      ? "text-sm text-green-600 dark:text-green-400"
                      : "text-sm text-destructive"
                  }
                >
                  {detailsMsg.text}
                </p>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Password */}
      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={savePassword} className="space-y-4 max-w-md">
            <div className="grid gap-2">
              <Label htmlFor="currentPassword">Current password</Label>
              <Input
                id="currentPassword"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="newPassword">New password</Label>
              <Input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={8}
                required
              />
              <p className="text-xs text-muted-foreground">
                At least 8 characters.
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="confirmPassword">Confirm new password</Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={savingPassword}>
                {savingPassword && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Update password
              </Button>
              {passwordMsg && (
                <p
                  className={
                    passwordMsg.kind === "ok"
                      ? "text-sm text-green-600 dark:text-green-400"
                      : "text-sm text-destructive"
                  }
                >
                  {passwordMsg.text}
                </p>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
