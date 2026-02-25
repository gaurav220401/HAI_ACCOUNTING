"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { SignupForm } from "@/components/signup-form";

export default function SignupPage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();

  useEffect(() => {
    if (!loading && firebaseUser) {
      router.push("/dashboard");
    }
  }, [loading, firebaseUser, router]);

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      {/* Left: form — scrollable so it never clips */}
      <div className="flex items-start justify-center overflow-y-auto p-6 py-10 md:p-12">
        <div className="w-full max-w-sm">
          <SignupForm />
        </div>
      </div>

      {/* Right: brand panel */}
      <div className="relative hidden flex-col items-center justify-center gap-6 bg-primary p-12 lg:flex">
        <div className="relative z-10 flex flex-col items-center gap-4 text-center">
          <p className="max-w-xs text-lg font-medium text-primary-foreground/80">
            Join HAI Accounting and take control of your finances.
          </p>
        </div>
      </div>
    </div>
  );
}
