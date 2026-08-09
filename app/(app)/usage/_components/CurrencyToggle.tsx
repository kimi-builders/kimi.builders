"use client";

import { useRouter } from "next/navigation";
import type { UsageDisplayCurrency } from "@/src/lib/usage/pricing";

/* 展示币种切换:写 kb_usage_ccy cookie 后整页 refresh(服务端按 cookie 重渲染)。
   已选中的币种下再点是 no-op,避免无谓的往返。 */
/* cookie 写在组件外:组件作用域内直接给 document.cookie 赋值会触发
   react-hooks/immutability(组件被假定可并发渲染,不许有可见副作用)。 */
function writeCurrencyCookie(value: UsageDisplayCurrency) {
  document.cookie = `kb_usage_ccy=${value}; path=/; max-age=31536000; samesite=lax`;
}

export default function CurrencyToggle({
  currency,
  label,
}: {
  currency: UsageDisplayCurrency;
  label: string;
}) {
  const router = useRouter();
  const select = (value: UsageDisplayCurrency) => {
    if (value === currency) return;
    writeCurrencyCookie(value);
    router.refresh();
  };
  const items: { id: UsageDisplayCurrency; text: string }[] = [
    { id: "usd", text: "$" },
    { id: "cny", text: "¥" },
  ];
  return (
    <span className="inline-flex items-center border border-line" role="group" aria-label={label}>
      {items.map((item, index) => (
        <button
          key={item.id}
          type="button"
          onClick={() => select(item.id)}
          aria-pressed={currency === item.id}
          title={item.id.toUpperCase()}
          className={`inline-flex min-h-11 min-w-11 items-center justify-center px-3 font-mono text-[11px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue ${
            index > 0 ? "border-l border-line" : ""
          } ${currency === item.id ? "bg-paper text-bg" : "text-grey hover:text-paper"}`}
        >
          {item.text}
        </button>
      ))}
    </span>
  );
}
