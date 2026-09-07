import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "success";
type Size = "sm" | "md" | "lg" | "icon";

const variants: Record<Variant, string> = {
  primary:
    "bg-primary text-primary-foreground shadow-[0_4px_12px_-6px_rgba(37,99,235,0.55)] hover:bg-primary/90 hover:shadow-[0_8px_18px_-8px_rgba(37,99,235,0.6)] active:translate-y-px active:scale-[0.97]",
  secondary: "border border-edge bg-muted text-foreground hover:bg-tint-strong hover:border-edge-strong",
  outline: "border border-edge-strong bg-card text-foreground hover:bg-tint",
  ghost: "bg-transparent text-muted-foreground hover:bg-tint hover:text-foreground",
  danger: "bg-rose-500/90 text-white hover:bg-rose-500",
  success: "bg-emerald-500/90 text-white hover:bg-emerald-500",
};

const sizes: Record<Size, string> = {
  // a11y: sm stays h-8 (32px) — passes WCAG 2.2 AA (24px min).
  // AAA 44px exception for dense tables; icon targets are always 44px.
  sm: "h-8 px-3 text-xs rounded-lg gap-1.5",
  md: "h-11 min-h-[44px] px-4 text-sm rounded-xl gap-2",
  lg: "h-12 min-h-[44px] px-6 text-sm rounded-xl gap-2",
  icon: "h-11 w-11 min-h-[44px] min-w-[44px] rounded-lg",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", loading, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex cursor-pointer select-none items-center justify-center font-medium transition-all duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {loading && (
        <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
      )}
      {children}
    </button>
  )
);
Button.displayName = "Button";
