"use client";

import { useRouter } from "next/navigation";
import type { UsageDisplayCurrency } from "@/src/lib/usage/pricing";
import {
  SEG_ITEM,
  SEG_ITEM_ACTIVE,
  SEG_ITEM_IDLE,
  SEG_WRAP,
} from "@/components/seg-classes";

/* Display currency toggle: writes the kb_usage_ccy cookie then
   refreshes the whole page (the server re-renders per the cookie).
   Clicking the already-selected currency is a no-op — no wasted round
   trip. */
/* The cookie write lives outside the component: assigning
   document.cookie inside the component scope trips
   react-hooks/immutability (components are assumed concurrently
   renderable — no visible side effects). */
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
    <span className={`${SEG_WRAP} max-sm:w-full`} role="group" aria-label={label}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => select(item.id)}
          aria-pressed={currency === item.id}
          title={item.id.toUpperCase()}
          className={`${SEG_ITEM} min-w-9 justify-center max-sm:flex-1 ${
            currency === item.id ? SEG_ITEM_ACTIVE : SEG_ITEM_IDLE
          }`}
        >
          {item.text}
        </button>
      ))}
    </span>
  );
}
