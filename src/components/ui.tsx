import type { ComponentProps, ReactNode } from "react";

/*
 * Interactive elements share one visual language: 48px tall (above the 44px
 * minimum tap target), pill-shaped, a 3px ink border and a hard shadow.
 * Hover and press move the button into its shadow, so the state change
 * doesn't rely on colour alone.
 */
const buttonBase =
  "inline-flex min-h-12 items-center justify-center gap-2 px-6 text-base font-bold no-underline disabled:cursor-not-allowed disabled:opacity-50";

const neo =
  "rounded-full border-3 border-ink font-display shadow-neo-sm transition-[translate,box-shadow] duration-150 hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-neo-xs active:translate-x-1 active:translate-y-1 active:shadow-none disabled:translate-none disabled:shadow-neo-sm";

const buttonVariants = {
  primary: `${neo} bg-pink text-on-brand hover:text-on-brand`,
  secondary: `${neo} bg-mat text-ink hover:text-ink`,
  quiet: "px-3 text-accent underline decoration-2 underline-offset-4 hover:text-accent-strong hover:decoration-4",
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
      className={`min-h-13 w-full rounded-field border-3 border-rule-strong bg-mat shadow-neo-sm px-4 text-base text-ink placeholder:text-ink-muted focus-visible:outline-offset-2 ${className}`}
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

/** Page opening: mint label, display title, optional lede at reading width. */
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

/** A 3px ink line for structural divisions. */
export function Rule({ className = "" }: { className?: string }) {
  return <hr className={`border-0 border-t-3 border-rule ${className}`} />;
}

/** A mounted photograph: a card with a hard shadow and photo corners. */
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

/** Inline status message. "notice" is the orange "please check" tone used across the app. */
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
      ? "border-l-[12px] border-l-orange bg-notice"
      : "bg-accent-tint";
  return (
    <div role={role} className={`measure rounded-field border-3 border-ink px-5 py-4 text-ink shadow-neo-sm ${styles}`}>
      {children}
    </div>
  );
}
