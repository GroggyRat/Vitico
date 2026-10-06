import { cn } from "@/lib/cn";

const variants = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-600/50",
  secondary: "border border-line bg-surface text-ink hover:bg-canvas disabled:opacity-50",
  danger: "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-600/50",
  ghost: "text-ink-muted hover:bg-canvas hover:text-ink",
};
const sizes = { sm: "h-8 px-3 text-sm", md: "h-10 px-4 text-sm" };

export type ButtonProps = React.ComponentProps<"button"> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
};

export function buttonClass(variant: keyof typeof variants = "primary", size: keyof typeof sizes = "md") {
  return cn(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed",
    variants[variant],
    sizes[size],
  );
}

export function Button({ variant, size, className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonClass(variant, size), className)} {...props} />;
}
