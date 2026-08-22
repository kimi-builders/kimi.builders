"use client";

/* Profile-privacy switches (the settings "privacy & publicity" tab):
   avatar / display name / bio, three independent toggles — optimistic
   flip, toast on save, rollback + toast on failure (the AiPrefsForm
   pattern). Semantics: on = public (default), off = self only; gates
   the /u/[handle] display alone — avatars and names on posts/comments
   are public speech attribution and are not controlled here. */
import { useState } from "react";
import { t, type Locale } from "@/src/lib/i18n";
import { toast } from "@/src/lib/toast";
import { updateProfilePrivacyAction } from "../actions";
import Switch from "./Switch";

export default function ProfilePrivacyForm({
  showAvatar,
  showName,
  showBio,
  locale,
}: {
  showAvatar: boolean;
  showName: boolean;
  showBio: boolean;
  locale: Locale;
}) {
  const [avatar, setAvatar] = useState(showAvatar);
  const [name, setName] = useState(showName);
  const [bio, setBio] = useState(showBio);
  const [busy, setBusy] = useState(false);

  const flip = async (which: "avatar" | "name" | "bio") => {
    if (busy) return;
    const nextAvatar = which === "avatar" ? !avatar : avatar;
    const nextName = which === "name" ? !name : name;
    const nextBio = which === "bio" ? !bio : bio;
    setAvatar(nextAvatar);
    setName(nextName);
    setBio(nextBio);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("pd_avatar", nextAvatar ? "1" : "0");
      fd.set("pd_name", nextName ? "1" : "0");
      fd.set("pd_bio", nextBio ? "1" : "0");
      const res = await updateProfilePrivacyAction(fd);
      if (!res.ok) throw new Error("failed");
      toast(t(locale, "set.saved"));
    } catch {
      setAvatar(avatar);
      setName(name);
      setBio(bio);
      toast(t(locale, "toast.failed"), "error");
    } finally {
      setBusy(false);
    }
  };

  const rows = [
    {
      key: "avatar" as const,
      title: t(locale, "set.pdAvatar"),
      hint: t(locale, "set.pdAvatarHint"),
      on: avatar,
    },
    {
      key: "name" as const,
      title: t(locale, "set.pdName"),
      hint: t(locale, "set.pdNameHint"),
      on: name,
    },
    {
      key: "bio" as const,
      title: t(locale, "set.pdBio"),
      hint: t(locale, "set.pdBioHint"),
      on: bio,
    },
  ];

  return (
    <div className="divide-y divide-line">
      {rows.map((row) => (
        <div
          key={row.key}
          className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium text-paper">{row.title}</p>
            <p className="mt-1 max-w-md text-xs leading-relaxed text-grey">
              {row.hint}
            </p>
          </div>
          <Switch on={row.on} label={row.title} onFlip={() => flip(row.key)} />
        </div>
      ))}
    </div>
  );
}
