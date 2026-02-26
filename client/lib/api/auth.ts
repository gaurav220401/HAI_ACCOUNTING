import { apiFetch } from "./client";

// ─── Auth API ───────────────────────────────────────────────────────────

export interface UserProfile {
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
  roles: string[];
  activeCompany: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  user: UserProfile;
  isNew?: boolean;
}

export const authApi = {
  register: (data?: { name?: string; dob?: string; gender?: string }) =>
    apiFetch<AuthResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify(data || {}),
    }),

  getMe: () => apiFetch<{ user: UserProfile }>("/auth/me"),

  completeProfile: (data: { name: string; dob: string; gender: string }) =>
    apiFetch<{ user: UserProfile }>("/auth/complete-profile", {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  updateProfile: (
    data: Partial<{
      name: string;
      dob: string;
      gender: string;
      phone: string;
      photoURL: string;
    }>,
  ) =>
    apiFetch<{ user: UserProfile }>("/auth/profile", {
      method: "PUT",
      body: JSON.stringify(data),
    }),
};
