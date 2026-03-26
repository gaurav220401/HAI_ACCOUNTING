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
import { toast } from "sonner";
import { getAuthErrorMessage } from "@/lib/auth-error";

type Method = "email" | "phone";
type Step = "profile" | "credential" | "otp";

const COUNTRY_CODES = ["+91", "+1", "+44", "+61", "+971"];

export function SignupForm({ className }: { className?: string }) {
  const router = useRouter();
  const { signUpWithEmail, sendPhoneOtp, confirmPhoneOtp, signInWithGoogle } = useAuth();

  const [method, setMethod] = useState<Method>("email");
  const [step, setStep] = useState<Step>("profile");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Profile fields
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("");

  // Email
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");

  // Phone
  const [countryCode, setCountryCode] = useState("+91");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otp, setOtp] = useState("");
  const [confirm, setConfirm] = useState<ConfirmationResult | null>(null);
  const rcRef = useRef<HTMLDivElement>(null);

  const wrap = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr("");
    try {
      await fn();
    } catch (e: unknown) {
      const message = getAuthErrorMessage(e);
      setErr(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const handleProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !dob || !gender) {
      const message = "Please fill in all profile fields.";
      setErr(message);
      toast.error(message);
      return;
    }
    setErr("");
    setStep("credential");
  };

  const handleEmailSignup = (e: React.FormEvent) => {
    e.preventDefault();
    if (pass !== pass2) {
      const message = "Passwords do not match.";
      setErr(message);
      toast.error(message);
      return;
    }
    if (pass.length < 6) {
      const message = "Password must be at least 6 characters.";
      setErr(message);
      toast.error(message);
      return;
    }
    wrap(async () => {
      await signUpWithEmail(email, pass, { name, dob, gender });
      toast.success("Verification email sent. Please verify your email before signing in.");
      router.push("/login");
    });
  };

  const handleSendOtp = (e: React.FormEvent) => {
    e.preventDefault();
    wrap(async () => {
      if (!rcRef.current) throw new Error("reCAPTCHA not ready");
      const normalized = phoneNumber.replace(/\D/g, "");
      if (!normalized) throw new Error("Please enter a valid phone number");
      const c = await sendPhoneOtp(`${countryCode}${normalized}`, rcRef.current);
      setConfirm(c);
      setStep("otp");
      toast.success("OTP sent successfully");
    });
  };

  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    wrap(async () => {
      if (!confirm) return;
      await confirmPhoneOtp(confirm, otp, { name, dob, gender });
      router.push("/org-setup");
    });
  };

  const handleGoogle = () => {
    if (!name.trim() || !dob || !gender) {
      const message = "Fill in your name, date of birth, and gender to continue with Google.";
      setErr(message);
      toast.error(message);
      return;
    }
    wrap(async () => {
      await signInWithGoogle({ name, dob, gender });
      router.push("/org-setup");
    });
  };

  const showPhoneCaptcha = step === "credential" && method === "phone";

  return (
    <div className={cn("flex w-full flex-col gap-6", className)}>
      {/* Brand */}
      <div className="flex flex-col items-center gap-2">
        <Image src="/hailogo.png" alt="HAI Accounting" width={64} height={64} className="rounded-xl" />
        <h1 className="text-xl font-bold tracking-tight">HAI ACCOUNTING</h1>
        <p className="text-muted-foreground text-sm">Create your account</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-1">
        {["Profile Details", "Credentials"].map((label, i) => {
          const active = (i === 0 && step === "profile") || (i === 1 && step !== "profile");
          const done = i === 0 && step !== "profile";
          return (
            <div key={label} className="flex flex-1 items-center gap-1">
              <div className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                done || active ? "bg-primary text-primary-foreground" : "border border-muted-foreground text-muted-foreground"
              )}>
                {done ? "✓" : i + 1}
              </div>
              <span className={cn("text-xs font-medium", active ? "text-foreground" : "text-muted-foreground")}>{label}</span>
              {i === 0 && <div className="h-px flex-1 bg-border mx-1" />}
            </div>
          );
        })}
      </div>

      {/* ── Step 1: Profile ── */}
      {step === "profile" && (
        <form onSubmit={handleProfile} className="flex flex-col gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="s-name">Full Name</Label>
            <Input id="s-name" placeholder="John Doe" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-dob">Date of Birth</Label>
            <Input id="s-dob" type="date" required value={dob} onChange={(e) => setDob(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-gender">Gender</Label>
            <select
              id="s-gender"
              required
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">Select gender</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other / Prefer not to say</option>
            </select>
          </div>
          {err && <p className="text-destructive text-sm">{err}</p>}
          <Button type="submit" className="w-full">Continue →</Button>

          <div className="relative flex items-center gap-2">
            <div className="h-px flex-1 bg-border" />
            <span className="text-muted-foreground text-xs">or sign up with</span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <Button variant="outline" type="button" onClick={handleGoogle} disabled={busy} className="w-full gap-2">
            <GoogleIcon />
            Continue with Google
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <a href="/login" className="font-medium text-primary underline underline-offset-4">Sign in</a>
          </p>
        </form>
      )}

      {/* ── Step 2: Credentials ── */}
      {step === "credential" && (
        <>
          <div className="flex rounded-lg border p-1 gap-1">
            {(["email", "phone"] as Method[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMethod(m); setErr(""); }}
                className={cn(
                  "flex-1 rounded-md py-1.5 text-xs font-medium transition-colors",
                  method === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {m === "email" ? "Email & Password" : "Phone OTP"}
              </button>
            ))}
          </div>

          {method === "email" && (
            <form onSubmit={handleEmailSignup} className="flex flex-col gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="s-email">Email</Label>
                <Input id="s-email" type="email" placeholder="you@example.com" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="s-pass">Password</Label>
                <Input id="s-pass" type="password" placeholder="Min. 6 characters" required value={pass} onChange={(e) => setPass(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="s-pass2">Confirm Password</Label>
                <Input id="s-pass2" type="password" placeholder="Re-enter password" required value={pass2} onChange={(e) => setPass2(e.target.value)} />
              </div>
              {err && <p className="text-destructive text-sm">{err}</p>}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => { setStep("profile"); setErr(""); }} className="flex-1">← Back</Button>
                <Button type="submit" disabled={busy} className="flex-1">{busy ? "Creating…" : "Create Account"}</Button>
              </div>
            </form>
          )}

          {method === "phone" && (
            <form onSubmit={handleSendOtp} className="flex flex-col gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="s-phone">Phone Number</Label>
                <div className="flex gap-2">
                  <select
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value)}
                    className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                  >
                    {COUNTRY_CODES.map((code) => (
                      <option key={code} value={code}>{code}</option>
                    ))}
                  </select>
                  <Input
                    id="s-phone"
                    type="tel"
                    placeholder="9876543210"
                    required
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                  />
                </div>
                {/* <p className="text-muted-foreground text-xs">Default is +91. You can change it.</p> */}
              </div>
              {err && <p className="text-destructive text-sm">{err}</p>}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => { setStep("profile"); setErr(""); }} className="flex-1">← Back</Button>
                <Button type="submit" disabled={busy} className="flex-1">{busy ? "Sending OTP…" : "Send OTP"}</Button>
              </div>
            </form>
          )}
        </>
      )}

      {/* ── Step 3: OTP verify ── */}
      {step === "otp" && (
        <form onSubmit={handleVerifyOtp} className="flex flex-col gap-4">
          <div className="rounded-lg border bg-muted/40 p-3 text-center">
            <p className="text-sm font-medium">OTP sent to {countryCode}{phoneNumber.replace(/\D/g, "")}</p>
            <p className="text-muted-foreground text-xs">Enter the 6-digit code below</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-otp">OTP Code</Label>
            <Input
              id="s-otp"
              inputMode="numeric"
              maxLength={6}
              placeholder="1 2 3 4 5 6"
              required
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              className="text-center text-xl tracking-[0.4em]"
            />
          </div>
          {err && <p className="text-destructive text-sm">{err}</p>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Verifying…" : "Verify & Create Account"}
          </Button>
          <button type="button" className="text-xs text-muted-foreground underline" onClick={() => { setStep("credential"); setConfirm(null); setErr(""); }}>
            ← Change number
          </button>
        </form>
      )}

      <div className={cn("rounded-md border p-2", showPhoneCaptcha ? "block" : "hidden")}>
        <p className="text-muted-foreground mb-2 text-xs">Complete captcha to continue</p>
        <div ref={rcRef} id="recaptcha-signup" />
      </div>
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

