import { cloneElement, forwardRef, isValidElement, useId, type InputHTMLAttributes, type ReactElement, type TextareaHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const base =
  "w-full rounded-[11px] border border-input bg-card px-3.5 text-base text-foreground placeholder:text-muted-foreground transition-all duration-150 focus:border-primary/70 focus:outline-none focus:ring-4 focus:ring-ring/15 aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/15 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(base, "h-11 min-h-[44px]", className)} {...props} />
);
Input.displayName = "Input";

type NumberInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> & {
  value: number | null | undefined;
  onValueChange: (value: number | null) => void;
};

/** Keeps an empty numeric field empty instead of coercing it to zero. */
export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  ({ onValueChange, ...props }, ref) => (
    <Input
      ref={ref}
      {...props}
      type="number"
      value={props.value ?? ""}
      onChange={(event) => onValueChange(event.currentTarget.value === "" || !Number.isFinite(event.currentTarget.valueAsNumber) ? null : event.currentTarget.valueAsNumber)}
    />
  )
);
NumberInput.displayName = "NumberInput";

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
  let fieldChild = children;
  try {
    if (isValidElement(children)) {
      const childProps = (children.props ?? {}) as { id?: unknown };
      if (typeof childProps.id !== "string" || childProps.id.length === 0) {
        fieldChild = cloneElement(children as ReactElement<Record<string, unknown>>, { id: fieldId });
      }
    }
  } catch {
    fieldChild = children;
  }
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <label htmlFor={fieldId} className="block text-[12px] font-semibold tracking-[0.01em] text-foreground/75">
          {label}
        </label>
      )}
      {fieldChild}
      {error ? (
        <p role="alert" className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-[12px] leading-relaxed text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
