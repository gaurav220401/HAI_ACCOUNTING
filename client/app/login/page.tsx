"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading } = useOrganization();

  const isUnverifiedEmailPasswordUser =
    !!firebaseUser &&
    firebaseUser.providerData.some((p) => p.providerId === "password") &&
    !firebaseUser.emailVerified;

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && !isUnverifiedEmailPasswordUser) {
      router.replace(needsOrgSetup ? "/org-setup" : "/dashboard");
    }
  }, [loading, orgLoading, firebaseUser, isUnverifiedEmailPasswordUser, needsOrgSetup, router]);

  if (loading || (firebaseUser && orgLoading)) {
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
      
          <h2 className="text-2xl font-bold tracking-tight text-white mb-2">Perfect Simple Accounting Software</h2>
          <p className="text-sm text-white/80 max-w-md leading-relaxed font-medium">
            Manage invoices, track purchase orders, and monitor your expenses seamlessly with real-time financial tracking.
          </p>
        </div>
      </div>
    </div>
  );
}
