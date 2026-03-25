import { apiFetch } from "./client";

export interface SmtpSettings {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromName: string;
  fromEmail: string;
}

export const smtpApi = {
  get: (orgId: string) =>
    apiFetch<{ success: boolean; data: SmtpSettings | null }>(
      `/organizations/${orgId}/smtp-settings`,
    ),

  save: (orgId: string, data: SmtpSettings) =>
    apiFetch<{ success: boolean; message: string }>(
      `/organizations/${orgId}/smtp-settings`,
      {
        method: "PUT",
        body: JSON.stringify(data),
      },
    ),

  test: (orgId: string, testEmail: string) =>
    apiFetch<{ success: boolean; message: string }>(
      `/organizations/${orgId}/smtp-test`,
      {
        method: "POST",
        body: JSON.stringify({ testEmail }),
      },
    ),
};
