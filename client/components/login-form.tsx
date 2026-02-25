"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ConfirmationResult } from "firebase/auth";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Tab = "email" | "phone" | "emaillink";

export function LoginForm({ className }: { className?: string }) {
  const router = useRouter();
  const { signInWithEmail, sendEmailOtp, sendPhoneOtp, confirmPhoneOtp, signInWithGoogle } =
    useAuth();

  const [tab, setTab] = useState<Tab>("email");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // email/pass
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");

  // email magic link
  const [mlEmail, setMlEmail] = useState("");
  const [mlSent, setMlSent] = useState(false);

  // phone
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [confirm, setConfirm] = useState<ConfirmationResult | null>(null);
  const rcRef = useRef<HTMLDivElement>(null);

  const go = () => {
    router.push("/dashboard");
  };

  const wrap = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr("");
    try {
      await fn();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const handleEmail = (e: React.FormEvent) => {
    e.preventDefault();
    wrap(async () => {
      const { dbUser } = await signInWithEmail(email, pass);
      void dbUser;
      go();
    });
  };

  const handleSendMl = (e: React.FormEvent) => {
    e.preventDefault();
    wrap(async () => {
      await sendEmailOtp(mlEmail);
      setMlSent(true);
    });
  };

  const handleSendOtp = (e: React.FormEvent) => {
    e.preventDefault();
    wrap(async () => {
      if (!rcRef.current) throw new Error("reCAPTCHA not ready");
      const c = await sendPhoneOtp(phone, rcRef.current);
      setConfirm(c);
    });
  };

  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    wrap(async () => {
      if (!confirm) return;
      const { dbUser } = await confirmPhoneOtp(confirm, otp);
      void dbUser;
      go();
    });
  };

  const handleGoogle = () => {
    wrap(async () => {
      await signInWithGoogle();
      go();
    });
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "email", label: "Email" },
    { key: "phone", label: "Phone OTP" },
    { key: "emaillink", label: "Magic Link" },
  ];

  return (
    <div className={cn("flex w-full flex-col gap-6", className)}>
      {/* Logo */}
      <div className="flex flex-col items-center gap-2">
        <Image src="/hailogo.png" alt="HAI Accounting" width={64} height={64} className="rounded-xl" />
        <h1 className="text-xl font-bold tracking-tight">HAI ACCOUNTING</h1>
        <p className="text-muted-foreground text-sm">Sign in to your account</p>
      </div>

      {/* Google */}
      <Button variant="outline" type="button" onClick={handleGoogle} disabled={busy} className="w-full gap-2">
        <GoogleIcon />
        Continue with Google
      </Button>

      <div className="relative flex items-center gap-2">
        <div className="h-px flex-1 bg-border" />
        <span className="text-muted-foreground text-xs">or sign in with</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      {/* Tabs */}
      <div className="flex rounded-lg border p-1 gap-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => { setTab(t.key); setErr(""); }}
            className={cn(
              "flex-1 rounded-md py-1.5 text-xs font-medium transition-colors",
              tab === t.key
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Email / Password ── */}
      {tab === "email" && (
        <form onSubmit={handleEmail} className="flex flex-col gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="l-email">Email</Label>
            <Input id="l-email" type="email" placeholder="you@example.com" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="l-pass">Password</Label>
            <Input id="l-pass" type="password" placeholder="••••••••" required value={pass} onChange={(e) => setPass(e.target.value)} />
          </div>
          {err && <p className="text-destructive text-sm">{err}</p>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Signing in…" : "Sign In"}
          </Button>
        </form>
      )}

      {/* ── Phone OTP ── */}
      {tab === "phone" && (
        <form onSubmit={confirm ? handleVerifyOtp : handleSendOtp} className="flex flex-col gap-4">
          {!confirm ? (
            <div className="space-y-1.5">
              <Label htmlFor="l-phone">Phone Number</Label>
              <Input id="l-phone" type="tel" placeholder="+91 98765 43210" required value={phone} onChange={(e) => setPhone(e.target.value)} />
              <p className="text-muted-foreground text-xs">Include country code e.g. +91</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="l-otp">Enter OTP</Label>
              <Input id="l-otp" type="text" inputMode="numeric" maxLength={6} placeholder="123456" required value={otp} onChange={(e) => setOtp(e.target.value)} />
              <p className="text-muted-foreground text-xs">6-digit code sent to {phone}</p>
            </div>
          )}
          {err && <p className="text-destructive text-sm">{err}</p>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? (confirm ? "Verifying…" : "Sending OTP…") : (confirm ? "Verify OTP" : "Send OTP")}
          </Button>
          {confirm && (
            <button type="button" className="text-muted-foreground text-xs underline" onClick={() => setConfirm(null)}>
              Change number
            </button>
          )}
        </form>
      )}

      {/* ── Magic Link ── */}
      {tab === "emaillink" && (
        <form onSubmit={handleSendMl} className="flex flex-col gap-4">
          {!mlSent ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="l-ml">Email</Label>
                <Input id="l-ml" type="email" placeholder="you@example.com" required value={mlEmail} onChange={(e) => setMlEmail(e.target.value)} />
              </div>
              {err && <p className="text-destructive text-sm">{err}</p>}
              <Button type="submit" disabled={busy} className="w-full">
                {busy ? "Sending…" : "Send Sign-in Link"}
              </Button>
            </>
          ) : (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-center dark:border-green-900 dark:bg-green-950">
              <p className="text-sm font-medium text-green-800 dark:text-green-200">Link sent!</p>
              <p className="mt-1 text-xs text-green-700 dark:text-green-300">
                Check your inbox for <strong>{mlEmail}</strong> and click the link to sign in.
              </p>
            </div>
          )}
        </form>
      )}

      <p className="text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <a href="/signup" className="font-medium text-primary underline underline-offset-4">
          Sign up
        </a>
      </p>

      {/* Invisible reCAPTCHA container */}
      <div ref={rcRef} id="recaptcha-login" />
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-4 w-4">
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.9z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2A12 12 0 0 1 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3a12 12 0 0 1-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.7-.4-3.9z" />
    </svg>
  );
}
