"use client";

/* iOS 式开关(20260819 抽取):AiPrefsForm / ProfilePrivacyForm 此前各持有一份
   逐字相同的 Switch,收编为设置页共享件。点按即存语义由调用方承载。 */
export default function Switch({
  on,
  label,
  onFlip,
}: {
  on: boolean;
  label: string;
  onFlip: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onFlip}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue ${
        on ? "bg-blue" : "bg-paper/15"
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow transition-transform ${
          on ? "translate-x-5" : ""
        }`}
      />
    </button>
  );
}
