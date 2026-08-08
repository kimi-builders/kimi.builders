"use client";

/* 订阅按钮:乐观翻转(书签填充 + 文案),成功 toast 告知,失败回滚。 */
import { useRef, useState } from "react";
import { Bookmark } from "lucide-react";
import { t, type Locale } from "@/src/lib/i18n";
import { toast } from "@/src/lib/toast";
import { toggleSubscribeAction } from "../actions";

export default function SubscribeButton({
  postId,
  subscribed: initial,
  locale,
}: {
  postId: number;
  subscribed: boolean;
  locale: Locale;
}) {
  const [subscribed, setSubscribed] = useState(initial);
  const busy = useRef(false);

  const toggle = async () => {
    if (busy.current) return;
    busy.current = true;
    const next = !subscribed;
    setSubscribed(next);
    try {
      const fd = new FormData();
      fd.set("post_id", String(postId));
      await toggleSubscribeAction(fd);
      toast(t(locale, next ? "toast.subscribed" : "toast.unsubscribed"));
    } catch {
      setSubscribed(!next);
      toast(t(locale, "toast.failed"));
    } finally {
      busy.current = false;
    }
  };

  const label = t(locale, subscribed ? "post.subscribed" : "post.subscribe");
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={t(locale, subscribed ? "post.unsubscribe" : "post.subscribe")}
      title={t(locale, subscribed ? "post.unsubscribe" : "post.subscribe")}
      className={`inline-flex items-center gap-1.5 font-mono text-xs transition-colors ${
        subscribed ? "text-blue" : "text-grey hover:text-blue"
      }`}
    >
      <Bookmark size={14} fill={subscribed ? "currentColor" : "none"} />
      {label}
    </button>
  );
}
