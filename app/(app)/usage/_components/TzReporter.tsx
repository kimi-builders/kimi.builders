"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/* 把浏览器本地时区写进 kb_tz cookie(分钟,UTC 以东为正,北京 +480),
   服务端按它做本地日界/分时聚合。只在缺失或变化时写入并 refresh 一次;
   刷新后 cookie 与新值一致,条件不再成立,保证不会循环刷新。 */
export default function TzReporter() {
  const router = useRouter();
  useEffect(() => {
    const tz = -new Date().getTimezoneOffset();
    const match = /(?:^|;\s*)kb_tz=(-?\d{1,4})/.exec(document.cookie);
    if (match && Number(match[1]) === tz) return;
    document.cookie = `kb_tz=${tz}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }, [router]);
  return null;
}
