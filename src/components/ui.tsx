import type { ComponentProps } from "react";

const base =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-base font-medium transition-colors disabled:opacity-50";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: "primary" | "secondary" | "ghost" }) {
  const styles = {
    primary: "bg-brand text-brand-fg hover:opacity-90",
    secondary: "border border-border bg-surface text-foreground hover:bg-background",
    ghost: "text-foreground hover:bg-surface",
  }[variant];
  return <button className={`${base} ${styles} ${className}`} {...props} />;
}

export const buttonClass = (variant: "primary" | "secondary" = "primary") =>
  `${base} ${variant === "primary" ? "bg-brand text-brand-fg hover:opacity-90" : "border border-border bg-surface hover:bg-background"}`;

export function Input({ className = "", ...props }: ComponentProps<"input">) {
  return (
    <input
      className={`min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-base text-foreground placeholder:text-muted ${className}`}
      {...props}
    />
  );
}

export function Card({ className = "", ...props }: ComponentProps<"div">) {
  return <div className={`rounded-2xl border border-border bg-surface p-4 ${className}`} {...props} />;
}
