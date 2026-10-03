"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface SwitchProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "onChange"> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(
  ({ checked, onCheckedChange, className, onClick, ...props }, ref) => (
    <button
      {...props}
      ref={ref}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) onCheckedChange(!checked);
      }}
      className={cn(
        "inline-flex h-11 w-12 shrink-0 cursor-pointer items-center justify-center rounded-lg p-0",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "relative block h-6 w-11 shrink-0 overflow-hidden rounded-full ring-1 ring-inset transition-colors motion-reduce:transition-none",
          checked ? "bg-primary ring-primary" : "bg-muted ring-edge-strong",
        )}
      >
        <span
          className={cn(
            "absolute left-0.5 top-0.5 block h-5 w-5 rounded-full bg-white shadow-sm transition-transform motion-reduce:transition-none",
            checked ? "translate-x-5" : "translate-x-0",
          )}
        />
      </span>
    </button>
  ),
);

Switch.displayName = "Switch";
