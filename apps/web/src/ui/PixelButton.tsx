// Block button with a hard side face and a single press motion. Variants:
// primary (filled), secondary (outline), danger (sindoor). `big` is the citizen thumb-zone size.
import type { ButtonHTMLAttributes, JSX } from "react";
import styles from "./ui.module.css";

type Variant = "primary" | "secondary" | "danger";

export type PixelButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  big?: boolean;
};

export function PixelButton({
  variant = "primary",
  big,
  className,
  ...rest
}: PixelButtonProps): JSX.Element {
  const classes = [
    styles.button,
    variant === "secondary" ? styles.secondary : "",
    variant === "danger" ? styles.danger : "",
    big ? styles.big : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return <button className={classes} {...rest} />;
}
