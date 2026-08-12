import { Check } from "lucide-react";
import { forwardRef, type ComponentPropsWithoutRef } from "react";

export type CheckboxControlProps = Omit<
  ComponentPropsWithoutRef<"input">,
  "type" | "className"
> & {
  className?: string;
};

/**
 * Shared square checkbox treatment. The native input keeps form, keyboard, and
 * assistive-technology semantics; only its visual presentation is replaced.
 */
const CheckboxControl = forwardRef<HTMLInputElement, CheckboxControlProps>(
  function CheckboxControl({ className = "", ...props }, ref) {
    return (
      <span className={`relative inline-flex size-4 shrink-0 ${className}`}>
      <input
        ref={ref}
        type="checkbox"
        {...props}
        className="kb-checkbox-input peer absolute inset-0 z-10 m-0 size-4 cursor-[inherit] appearance-none opacity-0"
      />
        <span
          aria-hidden="true"
          className="kb-checkbox-box pointer-events-none grid size-4 place-items-center rounded-[5px] border-[1.5px] border-line text-transparent transition-colors peer-hover:border-paper/30 peer-checked:border-blue peer-checked:bg-blue peer-checked:text-white peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-blue peer-disabled:opacity-40"
        >
          <Check size={11} strokeWidth={3} />
        </span>
      </span>
    );
  },
);

export default CheckboxControl;
