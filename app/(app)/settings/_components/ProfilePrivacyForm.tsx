"use client";

/* 资料展示隐私开关(设置页「隐私与公开」页签):头像 / 显示名 / 简介三个独立开关,
   点按即切换 —— 乐观翻转,落库成功 toast,失败回退并 toast(同 AiPrefsForm 模式)。
   语义(20260829_profile_privacy):开 = 公开(默认),关 = 仅自己;仅影响个人主页
   /u/[handle] 的展示,帖子/评论区的头像昵称是公开发言标识,不受这里控制。 */
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
