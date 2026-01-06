"use client"

import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils"

function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

/**
 * TabsList with optional actions slot
 * Usage:
 * <TabsList>
 *   <TabsTrigger>Tab 1</TabsTrigger>
 *   <TabsTrigger>Tab 2</TabsTrigger>
 *   <TabsActions>
 *     <Button>Action</Button>
 *   </TabsActions>
 * </TabsList>
 */
function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "inline-flex h-auto w-full items-center gap-1.5 pb-3 border-b border-border/60 overflow-x-auto flex-nowrap",
        className
      )}
      {...props}
    />
  )
}

/**
 * TabsActions - A slot for placing action buttons inside TabsList
 * Automatically adds a divider before the actions
 */
function TabsActions({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="tabs-actions"
      className={cn("flex items-center gap-2 ml-1", className)}
      {...props}
    >
      <div className="h-5 w-px bg-border/60" />
      {children}
    </div>
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all cursor-pointer",
        "text-muted-foreground bg-muted hover:bg-muted/80",
        "data-[state=active]:bg-gradient-to-br data-[state=active]:from-slate-50 data-[state=active]:to-slate-100",
        "dark:data-[state=active]:from-slate-900 dark:data-[state=active]:to-slate-800",
        "data-[state=active]:text-slate-700 dark:data-[state=active]:text-slate-300",
        "data-[state=active]:ring-2 data-[state=active]:ring-inset data-[state=active]:ring-slate-400/50 dark:data-[state=active]:ring-slate-500/50",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        "disabled:pointer-events-none disabled:opacity-50",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, TabsActions }
