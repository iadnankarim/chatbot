import Image from "next/image";
import type { FC } from "react";
import { cn } from "@/lib/utils";

// Official PLPA seal (public/logo.png). logo-256.png is a small copy for the UI.
export const BrandMark: FC<{ className?: string }> = ({ className }) => (
  <Image
    src="/logo-256.png"
    alt="Pakistan Land Port Authority"
    width={256}
    height={256}
    priority
    className={cn("size-7 shrink-0 rounded-full object-cover", className)}
  />
);
