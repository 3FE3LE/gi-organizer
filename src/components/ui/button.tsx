import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

/**
 * The app's buttons, on shadcn's component.
 *
 * The variants below are not the ones the CLI shipped. This app already had a
 * button — a gold gradient with a glow under it for the one loud control on a
 * screen, a bordered parchment one for everything else — and those were a
 * design decision, not a default nobody had got round to changing. So the
 * component is the primitive's (focus ring, disabled handling, icon sizing,
 * `render` for links) and the paint is ours.
 *
 * `default` is the gradient because "primary" and "there can be one" are the
 * same rule; `outline` is the ordinary button; `ghost` is the one that only
 * appears when you are already looking at it, like the close in a dialog.
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-[linear-gradient(180deg,color-mix(in_oklab,var(--accent)_88%,white),var(--accent))] text-on-accent shadow-[var(--shadow-accent)] hover:bg-[linear-gradient(180deg,color-mix(in_oklab,var(--accent)_75%,white),color-mix(in_oklab,var(--accent)_95%,white))]",
        outline:
          "border-edge bg-surface-2 text-text hover:border-[color-mix(in_oklab,var(--accent)_60%,var(--edge))] hover:bg-raised",
        secondary:
          "border-edge bg-surface text-muted hover:border-edge-strong hover:text-text",
        ghost:
          "border-transparent bg-transparent text-muted hover:bg-surface-2 hover:text-text",
        destructive:
          "border-transparent bg-transparent text-muted hover:bg-surface-2 hover:text-bad",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
