import { forwardRef, useId, type InputHTMLAttributes, type TextareaHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const base =
  "w-full rounded-[11px] border border-input bg-card px-3.5 text-base text-foreground placeholder:text-muted-foreground/55 transition-all duration-150 focus:border-primary/70 focus:outline-none focus:ring-4 focus:ring-ring/15 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(base, "h-10", className)} {...props} />
);
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => <textarea ref={ref} className={cn(base, "min-h-[90px] py-2.5", className)} {...props} />
);
Textarea.displayName = "Textarea";

export function Field({
  label,
  hint,
  error,
  children,
  className,
  htmlFor,
}: {
  label?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  const autoId = useId();
  const fieldId = htmlFor ?? `field-${autoId}`;
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <label htmlFor={fieldId} className="block text-[12px] font-semibold tracking-[0.01em] text-foreground/75">
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p role="alert" className="text-xs text-rose-400">{error}</p>
      ) : hint ? (
        <p className="text-[12px] leading-relaxed text-muted-foreground/75">{hint}</p>
      ) : null}
    </div>
  );
}
