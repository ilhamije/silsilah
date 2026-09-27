import type { ComponentProps, ReactNode } from "react";

/*
 * Interactive elements share one visual language: Heritage Blue, 48px tall
 * (above the 44px minimum tap target), square-ish corners, and a hover state
 * that changes colour AND underline so it doesn't rely on colour alone.
 */
const buttonBase =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-[4px] px-6 text-base font-semibold no-underline transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50";

const buttonVariants = {
  primary:
    "bg-accent text-white hover:bg-accent-strong hover:text-white hover:underline hover:decoration-1 hover:underline-offset-4",
  secondary:
    "border-[1.5px] border-accent bg-transparent text-accent hover:bg-accent-tint hover:text-accent-strong hover:underline hover:decoration-1 hover:underline-offset-4",
  quiet: "px-3 text-accent underline decoration-1 underline-offset-4 hover:text-accent-strong hover:decoration-2",
} as const;

type ButtonVariant = keyof typeof buttonVariants;

export const buttonClass = (variant: ButtonVariant = "primary", className = "") =>
  `${buttonBase} ${buttonVariants[variant]} ${className}`;

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return <button className={buttonClass(variant, className)} {...props} />;
}

export function Input({ className = "", ...props }: ComponentProps<"input">) {
  return (
    <input
      className={`min-h-13 w-full rounded-[4px] border border-rule-strong bg-mat px-4 text-base text-ink placeholder:text-ink-muted/80 focus:border-accent focus-visible:outline-offset-1 ${className}`}
      {...props}
    />
  );
}

/** Label above, optional hint below: the label is always visible, never a placeholder. */
export function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="font-semibold">
        {label}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-ink-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

/** Page opening: small archival label, serif title, optional lede at reading width. */
export function PageHeader({
  eyebrow,
  title,
  lede,
  children,
}: {
  eyebrow?: string;
  title: ReactNode;
  lede?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 pb-10">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h1>{title}</h1>
      {lede && <p className="measure text-lg text-ink-muted">{lede}</p>}
      {children}
    </header>
  );
}

/** A 1px hairline for structural divisions. */
export function Rule({ className = "" }: { className?: string }) {
  return <hr className={`border-0 border-t border-rule ${className}`} />;
}

/** A mounted photograph: white mat, hairline edge and photo corners. */
export function AlbumFrame({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`album-frame ${className}`}>
      <span aria-hidden className="corner tl" />
      <span aria-hidden className="corner tr" />
      <span aria-hidden className="corner bl" />
      <span aria-hidden className="corner br" />
      {children}
    </div>
  );
}

/** Inline status message. "notice" is the amber "please check" tone used across the app. */
export function Notice({
  tone = "info",
  children,
  role,
}: {
  tone?: "info" | "notice";
  children: ReactNode;
  role?: "alert" | "status";
}) {
  const styles =
    tone === "notice"
      ? "border-l-[3px] border-notice-ink bg-notice text-notice-ink"
      : "border-l-[3px] border-accent bg-accent-tint text-ink";
  return (
    <div role={role} className={`measure px-5 py-4 ${styles}`}>
      {children}
    </div>
  );
}
