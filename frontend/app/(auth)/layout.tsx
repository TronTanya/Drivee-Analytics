import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-surface-canvas">
      <div className="relative mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-14 sm:px-6">
        {children}
      </div>
    </div>
  );
}
