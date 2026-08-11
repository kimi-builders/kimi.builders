"use client";

/* 设置页页签壳(资料/偏好/隐私与公开/账号):面板常挂载、hidden 切换,
   未保存的表单状态不因切页签丢失;无 JS 时四面板顺序平铺(全部可读)。 */
import { useState, type ReactNode } from "react";

export default function SettingsTabs({
  tabs,
  children,
}: {
  tabs: { key: string; label: string }[];
  children: ReactNode[];
}) {
  const [active, setActive] = useState(tabs[0]?.key ?? "");
  return (
    <div>
      <div className="flex gap-5 border-b border-line" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active === tab.key}
            onClick={() => setActive(tab.key)}
            className={`-mb-px border-b-2 pb-2.5 text-[13px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue ${
              active === tab.key
                ? "border-blue font-medium text-paper"
                : "border-transparent text-grey hover:text-paper"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {children.map((child, index) => (
        <div
          key={tabs[index]?.key ?? index}
          hidden={tabs[index]?.key !== active}
          className="pt-5"
        >
          {child}
        </div>
      ))}
    </div>
  );
}
