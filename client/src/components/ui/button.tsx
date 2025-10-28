import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border border-white/15 bg-gradient-to-r from-sky-500/80 to-indigo-500/80 text-white shadow-lg shadow-blue-900/30 hover:from-sky-400/80 hover:to-indigo-400/80",
        destructive:
          "border border-rose-400/40 bg-rose-500/80 text-white shadow-lg shadow-rose-900/30 hover:bg-rose-500",
        outline:
          "border border-white/20 bg-slate-800 text-white shadow shadow-slate-950/30 hover:bg-slate-700",
        secondary:
          "border border-white/10 bg-white/10 text-blue-100 shadow-sm shadow-blue-900/20 hover:bg-white/20 hover:text-white",
        ghost:
          "text-blue-100 hover:bg-white/10 hover:text-white",
        link: "text-sky-300 underline-offset-4 hover:text-white hover:underline",
      },
      size: {
        default: "h-11 px-5",
        sm: "h-10 rounded-lg px-4",
        lg: "h-12 rounded-2xl px-7",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
