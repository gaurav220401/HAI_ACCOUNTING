"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * /accountant landing page — redirects to Chart of Accounts by default.
 */
export default function AccountantPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/accountant/chart-of-accounts");
  }, [router]);

  return (
    <div className="flex min-h-svh items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}
