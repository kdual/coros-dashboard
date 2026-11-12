import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { ButtonHTMLAttributes } from "react";

const styles = cva("btn", {
  variants: {
    variant: { default: "primary", outline: "outline", ghost: "ghost" },
  },
  defaultVariants: { variant: "outline" },
});
export function Button({
  asChild,
  variant,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof styles> & { asChild?: boolean }) {
  const Component = asChild ? Slot : "button";
  return (
    <Component
      className={twMerge(clsx(styles({ variant }), className))}
      {...props}
    />
  );
}
