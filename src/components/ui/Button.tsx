import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "text";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "account-primary",
  secondary: "button-secondary",
  text: "text-button",
};

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonProps) {
  const classes = [VARIANT_CLASSES[variant], className].filter(Boolean).join(" ");
  return <button {...props} className={classes} />;
}
