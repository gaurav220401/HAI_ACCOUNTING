"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { SignupForm } from "@/components/signup-form";

export default function SignupPage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();

  const isUnverifiedEmailPasswordUser =
    !!firebaseUser &&
    firebaseUser.providerData.some((p) => p.providerId === "password") &&
    !firebaseUser.emailVerified;

  useEffect(() => {
    if (!loading && firebaseUser && !isUnverifiedEmailPasswordUser) {
      router.push("/dashboard");
    }
  }, [loading, firebaseUser, isUnverifiedEmailPasswordUser, router]);

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

      {/* Right: brand panel (Full bleed dashboard graphic) */}
      <div className="relative hidden overflow-hidden border-l border-slate-100 lg:flex w-full h-full bg-slate-50">
        <img
          src="/login_accounting_graphic_full.png"
          alt="HAI Accounting Platform"
          className="absolute inset-0 w-full h-full object-cover object-center"
        />
        {/* Subtle premium dark gradient overlay for text readability and SaaS aesthetic */}
        <div className="absolute inset-0 bg-gradient-to-t from-teal-950/80 via-slate-900/40 to-transparent" />
        <div className="absolute bottom-12 left-12 right-12 z-10 text-white text-left">
          <div className="flex items-center gap-2 mb-3">
            <img src="/hailogo.png" alt="HAI logo" className="h-9 w-9 rounded-lg border border-white/20 bg-white/10 backdrop-blur-sm p-1" />
            <span className="text-lg font-bold tracking-tight">HAI ACCOUNTING</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-white mb-2">Control Your Business Finances</h2>
          <p className="text-sm text-white/80 max-w-md leading-relaxed font-medium">
            Create a free account to raise professional GST invoices, trace inventory assets, and streamline bookkeeping.
          </p>
        </div>
      </div>
    </div>
  );
}
