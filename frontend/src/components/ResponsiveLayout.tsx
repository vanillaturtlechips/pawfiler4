import { cn } from "@/lib/utils";

interface ResponsiveContainerProps {
  children: React.ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg" | "xl" | "full";
}

const sizeClasses = {
  sm: "max-w-screen-sm",
  md: "max-w-screen-md",
  lg: "max-w-screen-lg",
  xl: "max-w-screen-xl",
  full: "max-w-full",
};

export function ResponsiveContainer({ 
  children, 
  className, 
  size = "xl" 
}: ResponsiveContainerProps) {
  return (
    <div className={cn(
      "mx-auto w-full px-4 sm:px-6 md:px-8 lg:px-10 xl:px-12",
      sizeClasses[size],
      className
    )}>
      {children}
    </div>
  );
}

export function ResponsiveGrid({ 
  children, 
  className,
  cols = { xs: 1, sm: 2, md: 3, lg: 4 }
}: { 
  children: React.ReactNode; 
  className?: string;
  cols?: { xs?: number; sm?: number; md?: number; lg?: number; xl?: number };
}) {
  const gridCols = cn(
    "grid gap-4",
    cols.xs && `grid-cols-${cols.xs}`,
    cols.sm && `sm:grid-cols-${cols.sm}`,
    cols.md && `md:grid-cols-${cols.md}`,
    cols.lg && `lg:grid-cols-${cols.lg}`,
    cols.xl && `xl:grid-cols-${cols.xl}`,
    className
  );

  return <div className={gridCols}>{children}</div>;
}

export function ResponsiveStack({ 
  children, 
  className,
  direction = "vertical"
}: { 
  children: React.ReactNode; 
  className?: string;
  direction?: "vertical" | "horizontal" | "responsive";
}) {
  const stackClasses = cn(
    "flex gap-4",
    direction === "vertical" && "flex-col",
    direction === "horizontal" && "flex-row",
    direction === "responsive" && "flex-col md:flex-row",
    className
  );

  return <div className={stackClasses}>{children}</div>;
}
