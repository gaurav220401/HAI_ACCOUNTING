const AUTH_ERROR_MESSAGES: Record<string, string> = {
  "auth/email-already-in-use": "This email is already in use. Please sign in instead.",
  "auth/invalid-email": "Please enter a valid email address.",
  "auth/user-not-found": "Account not found. Please sign up first.",
  "auth/wrong-password": "Incorrect password. Please try again.",
  "auth/invalid-credential": "Invalid email or password.",
  "auth/too-many-requests": "Too many attempts. Please try again later.",
  "auth/network-request-failed": "Network error. Check your internet and try again.",
  "auth/popup-closed-by-user": "Google sign-in was canceled.",
  "auth/popup-blocked": "Popup was blocked. Please allow popups and try again.",
  "auth/account-exists-with-different-credential": "An account already exists with a different sign-in method.",
  "auth/invalid-phone-number": "Please enter a valid phone number.",
  "auth/missing-phone-number": "Please enter your phone number.",
  "auth/invalid-verification-code": "Invalid OTP code. Please try again.",
  "auth/code-expired": "OTP has expired. Please request a new one.",
  "auth/missing-verification-code": "Please enter the OTP code.",
  "auth/email-not-verified": "Please verify your email first. Check your inbox and then sign in.",
  "auth/captcha-check-failed": "Verification failed. Please try again.",
  "auth/quota-exceeded": "SMS quota exceeded. Please try again later.",
  "auth/operation-not-allowed": "This sign-in method is currently disabled.",
};

const parseFirebaseCode = (message: string): string | null => {
  const codeMatch = message.match(/auth\/[a-z0-9-]+/i);
  return codeMatch ? codeMatch[0].toLowerCase() : null;
};

export const getAuthErrorMessage = (error: unknown): string => {
  const fallback = "Something went wrong. Please try again.";

  if (!error) return fallback;

  if (typeof error === "string") {
    const code = parseFirebaseCode(error);
    if (code && AUTH_ERROR_MESSAGES[code]) return AUTH_ERROR_MESSAGES[code];
    return error.replace(/^firebase:\s*/i, "").replace(/^error:\s*/i, "").trim() || fallback;
  }

  if (error instanceof Error) {
    const anyError = error as Error & { code?: string };
    const explicitCode = anyError.code?.toLowerCase();
    if (explicitCode && AUTH_ERROR_MESSAGES[explicitCode]) {
      return AUTH_ERROR_MESSAGES[explicitCode];
    }

    const codeFromMessage = parseFirebaseCode(error.message);
    if (codeFromMessage && AUTH_ERROR_MESSAGES[codeFromMessage]) {
      return AUTH_ERROR_MESSAGES[codeFromMessage];
    }

    const cleaned = error.message
      .replace(/^firebase:\s*/i, "")
      .replace(/^error:\s*/i, "")
      .replace(/\(auth\/[a-z0-9-]+\)\.?/gi, "")
      .trim();

    return cleaned || fallback;
  }

  return fallback;
};