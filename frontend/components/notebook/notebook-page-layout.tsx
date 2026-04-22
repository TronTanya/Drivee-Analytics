import type { PropsWithChildren, ReactNode } from "react";
import { PageHeader } from "@/components/layout/page-header";

type NotebookPageLayoutProps = PropsWithChildren<{
  title: string;
  subtitle?: string;
  toolbar?: ReactNode;
}>;

/**
 * Consistent shell for notebook list/detail: header + optional toolbar + main content.
 */
export function NotebookPageLayout({ title, subtitle, toolbar, children }: NotebookPageLayoutProps) {
  return (
    <div className="space-y-5">
      <PageHeader title={title} subtitle={subtitle} />
      {toolbar ? <div className="flex flex-wrap items-center gap-2">{toolbar}</div> : null}
      {children}
    </div>
  );
}
