"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
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
      {/* Left: form */}
      <div className="flex items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-sm">
          <LoginForm />
        </div>
      </div>

      {/* Right: brand panel */}
      <div className="relative hidden flex-col items-center justify-center gap-6 overflow-hidden bg-primary p-12 lg:flex">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary via-primary to-primary/80" />
        <div className="relative z-10 flex flex-col items-center gap-4 text-center">
          <p className="max-w-xs text-lg font-medium text-primary-foreground/80">
            Manage your accounts with confidence and clarity.
          </p>
        </div>
      </div>
    </div>
  );
}
