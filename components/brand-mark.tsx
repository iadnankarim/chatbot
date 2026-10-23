import type { FC } from "react";
import { cn } from "@/lib/utils";

// Text-based placeholder logo until the official PLPA logo is available.
export const BrandMark: FC<{ className?: string }> = ({ className }) => (
  <span
    aria-hidden
    className={cn(
      "bg-primary text-primary-foreground inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-sm font-bold",
      className,
    )}
  >
    P
  </span>
);
