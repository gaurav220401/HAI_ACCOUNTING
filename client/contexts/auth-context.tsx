"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import {
  User as FirebaseUser,
  onIdTokenChanged,
  signOut as firebaseSignOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signInWithPhoneNumber,
  RecaptchaVerifier,
  ConfirmationResult,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  sendEmailVerification,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { registerUser, getMe } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────
export interface DbUser {
  id: string;
  firebaseUid: string;
  name: string;
  email: string | null;
  phone: string | null;
  dob: string | null;
  gender: string;
  photoURL: string;
  provider: string;
  profileComplete: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AuthResult {
  dbUser: DbUser | null;
}

interface AuthContextType {
  firebaseUser: FirebaseUser | null;
  dbUser: DbUser | null;
  loading: boolean;
  // Auth methods (all return { dbUser } so callers can check profileComplete)
  signUpWithEmail: (
    email: string,
    password: string,
    profile: { name: string; dob: string; gender: string }
  ) => Promise<AuthResult>;
  signInWithEmail: (email: string, password: string) => Promise<AuthResult>;
  sendEmailOtp: (email: string) => Promise<void>;
  sendPhoneOtp: (phoneNumber: string, container: HTMLElement) => Promise<ConfirmationResult>;
  confirmPhoneOtp: (confirmation: ConfirmationResult, code: string, profile?: { name?: string; dob?: string; gender?: string }) => Promise<AuthResult>;
  signInWithGoogle: (profile?: { name?: string; dob?: string; gender?: string }) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<DbUser | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

type RecaptchaEntry = {
  verifier: RecaptchaVerifier;
  renderPromise: Promise<number> | null;
};

// Reuse verifiers per DOM container to avoid
// "reCAPTCHA has already been rendered in this element" errors.
const recaptchaVerifierMap = new WeakMap<HTMLElement, RecaptchaEntry>();

function getOrCreateRecaptchaEntry(container: HTMLElement): RecaptchaEntry {
  const existing = recaptchaVerifierMap.get(container);
  if (existing) return existing;

  const verifier = new RecaptchaVerifier(auth, container, {
    size: "normal",
  });

  const entry: RecaptchaEntry = { verifier, renderPromise: null };
  recaptchaVerifierMap.set(container, entry);
  return entry;
}

// ── Provider ───────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [dbUser, setDbUser] = useState<DbUser | null>(null);
  const [loading, setLoading] = useState(true);

  // ── Helpers ──

  /** Just read from DB — does NOT create. Returns null if not found. */
  const fetchAndSetUser = async (): Promise<DbUser | null> => {
    try {
      const res = await getMe();
      const u = res.user ?? null;
      setDbUser(u);
      return u;
    } catch {
      setDbUser(null);
      return null;
    }
  };

  /** Create (or update) in DB then read back. Used by signup paths only. */
  const syncUser = async (profile?: { name?: string; dob?: string; gender?: string }): Promise<DbUser | null> => {
    try {
      await registerUser(profile);
    } catch {/* already exists — ok */}
    return fetchAndSetUser();
  };

  /**
   * LOGIN helper — fetches user from DB. If not found, signs out of Firebase
   * and throws a friendly error so the UI can say "no account, please sign up".
   */
  const loginFetch = async (): Promise<DbUser> => {
    const u = await fetchAndSetUser();
    if (!u) {
      await firebaseSignOut(auth);
      setFirebaseUser(null);
      throw new Error("No account found. Please sign up first.");
    }
    return u;
  };

  // ── Auth state listener (restore session on page load) ──
  useEffect(() => {
    const unsub = onIdTokenChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        // Restore existing session — do NOT auto-create (signup handles that)
        await fetchAndSetUser();
      } else {
        setDbUser(null);
      }
      setLoading(false);
    });
    return () => unsub();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Magic-link: detect finish sign-in on page load (login path) ──
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isSignInWithEmailLink(auth, window.location.href)) return;
    const savedEmail = localStorage.getItem("emailForSignIn");
    if (!savedEmail) return;
    signInWithEmailLink(auth, savedEmail, window.location.href)
      .then(async () => {
        localStorage.removeItem("emailForSignIn");
        // Magic link is login-only — if no account, sign out
        await loginFetch();
      })
      .catch(console.error);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auth methods ──

  /** SIGNUP: create Firebase account + create DB record with full profile */
  const signUpWithEmail = async (
    email: string,
    password: string,
    profile: { name: string; dob: string; gender: string }
  ): Promise<AuthResult> => {
    const creds = await createUserWithEmailAndPassword(auth, email, password);
    await sendEmailVerification(creds.user);
    await auth.currentUser?.getIdToken(true);
    const u = await syncUser(profile);
    await firebaseSignOut(auth);
    setFirebaseUser(null);
    setDbUser(null);
    return { dbUser: u };
  };

  /** LOGIN: sign in to Firebase, then require existing DB account */
  const signInWithEmail = async (email: string, password: string): Promise<AuthResult> => {
    const creds = await signInWithEmailAndPassword(auth, email, password);
    await creds.user.reload();
    if (!creds.user.emailVerified) {
      await sendEmailVerification(creds.user).catch(() => undefined);
      await firebaseSignOut(auth);
      setFirebaseUser(null);
      setDbUser(null);
      const error = new Error("Please verify your email first. A verification email has been sent.") as Error & { code?: string };
      error.code = "auth/email-not-verified";
      throw error;
    }
    await auth.currentUser?.getIdToken(true);
    const u = await loginFetch();
    return { dbUser: u };
  };

  const sendEmailOtp = async (email: string): Promise<void> => {
    const actionCodeSettings = {
      url: `${window.location.origin}/login?finishSignIn=true`,
      handleCodeInApp: true,
    };
    await sendSignInLinkToEmail(auth, email, actionCodeSettings);
    localStorage.setItem("emailForSignIn", email);
  };

  const sendPhoneOtp = async (
    phoneNumber: string,
    container: HTMLElement
  ): Promise<ConfirmationResult> => {
    if (!container.isConnected) {
      throw new Error("reCAPTCHA is not ready. Please wait and try again.");
    }

    const entry = getOrCreateRecaptchaEntry(container);
    if (!entry.renderPromise) {
      entry.renderPromise = entry.verifier.render();
    }

    await entry.renderPromise;
    return signInWithPhoneNumber(auth, phoneNumber, entry.verifier);
  };

  /**
   * If profile is provided → SIGNUP path (create DB record).
   * If no profile → LOGIN path (require existing DB account).
   */
  const confirmPhoneOtp = async (
    confirmation: ConfirmationResult,
    code: string,
    profile?: { name?: string; dob?: string; gender?: string }
  ): Promise<AuthResult> => {
    await confirmation.confirm(code);
    await auth.currentUser?.getIdToken(true);
    const u = profile ? await syncUser(profile) : await loginFetch();
    return { dbUser: u };
  };

  /**
   * If profile is provided → SIGNUP path (create DB record with profile).
   * If no profile → LOGIN path (require existing DB account).
   */
  const signInWithGoogle = async (profile?: { name?: string; dob?: string; gender?: string }): Promise<AuthResult> => {
    const provider = new GoogleAuthProvider();
    provider.addScope("profile");
    provider.addScope("email");
    await signInWithPopup(auth, provider);
    await auth.currentUser?.getIdToken(true);
    const u = profile ? await syncUser(profile) : await loginFetch();
    return { dbUser: u };
  };

  const signOut = async (): Promise<void> => {
    await firebaseSignOut(auth);
    setFirebaseUser(null);
    setDbUser(null);
  };

  const refreshProfile = async (): Promise<DbUser | null> => {
    return fetchAndSetUser();
  };

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        dbUser,
        loading,
        signUpWithEmail,
        signInWithEmail,
        sendEmailOtp,
        sendPhoneOtp,
        confirmPhoneOtp,
        signInWithGoogle,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}


