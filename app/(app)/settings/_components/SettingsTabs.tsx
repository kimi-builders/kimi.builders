"use client";

/* Settings tab shell (profile/preferences/privacy & publicity/
   account): panels stay mounted and switch via hidden — unsaved form
   state survives tab switches; without JS the four panels stack in
   order, all readable. */
import { useState, type ReactNode } from "react";

export default function SettingsTabs({
  tabs,
  initialKey,
  children,
}: {
  tabs: { key: string; label: string }[];
  /* An OAuth link receipt lands with the "account" tab expanded. */
  initialKey?: string;
  children: ReactNode[];
}) {
  const [active, setActive] = useState(
    initialKey && tabs.some((tab) => tab.key === initialKey) ? initialKey : (tabs[0]?.key ?? ""),
  );
  return (
    <div>
      <div className="flex gap-6 border-b border-line" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active === tab.key}
            onClick={() => setActive(tab.key)}
            className={`-mb-px border-b-2 pb-3 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue ${
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
          className="pt-6"
        >
          {child}
        </div>
      ))}
    </div>
  );
}
