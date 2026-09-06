import { forwardRef, type SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          "h-11 min-h-[44px] w-full cursor-pointer appearance-none rounded-xl border border-input bg-tint px-3.5 pr-9 text-sm text-foreground transition-all duration-150",
          "focus:border-primary/60 focus:outline-none focus:ring-4 focus:ring-ring/15",
          "aria-[invalid=true]:border-destructive/60 aria-[invalid=true]:ring-destructive/15",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  )
);
Select.displayName = "Select";
