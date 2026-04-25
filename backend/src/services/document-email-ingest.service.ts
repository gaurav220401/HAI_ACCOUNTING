import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import Organization from "../models/organization.model";
import DocumentMailbox from "../models/document-mailbox.model";
import { uploadBuffer } from "../utils/cloudinary";
import { ingestEmailPayload } from "../controllers/document.controller";

let running = false;
let timer: NodeJS.Timeout | null = null;
const orgBackoff = new Map<string, { failures: number; retryAfter: number }>();

function inferImapHost(smtpHost: string): string {
  const host = String(smtpHost || "").trim().toLowerCase();
  if (!host) return "";

  if (host === "smtp.office365.com") return "outlook.office365.com";
  if (host.includes("gmail.com")) return "imap.gmail.com";
  if (host.includes("yahoo.")) return "imap.mail.yahoo.com";
  if (host.includes("icloud.com") || host.includes("me.com") || host.includes("mac.com")) {
    return "imap.mail.me.com";
  }
  if (host.startsWith("smtp.")) return host.replace(/^smtp\./, "imap.");

  return host;
}

function parseOptionalBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return undefined;
}

function readOptionalPositiveNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
  return numeric;
}

function maskEmail(value: string): string {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  const [localPart, domainPart] = trimmed.split("@");
  if (!domainPart) return "***";
  if (localPart.length <= 1) return `${localPart || "*"}***@${domainPart}`;
  return `${localPart[0]}***@${domainPart}`;
}

type ImapConnectionConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
};

function resolveImapConnectionConfig(smtpSettings: {
  host?: string;
  user?: string;
  pass?: string;
}): ImapConnectionConfig | null {
  const envHost = String(process.env.DOCUMENTS_EMAIL_IMAP_HOST || "").trim();
  const envPort = readOptionalPositiveNumber(process.env.DOCUMENTS_EMAIL_IMAP_PORT);
  const envSecure = parseOptionalBoolean(process.env.DOCUMENTS_EMAIL_IMAP_SECURE);
  const envUser = String(process.env.DOCUMENTS_EMAIL_IMAP_USER || "").trim();
  const envPass = String(process.env.DOCUMENTS_EMAIL_IMAP_PASS || "").trim();

  const host = envHost || inferImapHost(String(smtpSettings.host || ""));
  const user = envUser || String(smtpSettings.user || "").trim();
  const pass = envPass || String(smtpSettings.pass || "").trim();

  if (!host || !user || !pass) return null;

  const port = envPort || 993;
  const secure = envSecure ?? port === 993;

  return { host, port, secure, user, pass };
}

function isTransientImapFailure(rawMessage: string): boolean {
  const lower = rawMessage.toLowerCase();
  return (
    lower.includes("timeout") ||
    lower.includes("connection not available") ||
    lower.includes("socket closed") ||
    lower.includes("econnreset") ||
    lower.includes("ecconnreset") ||
    lower.includes("ehostunreach") ||
    lower.includes("enotfound")
  );
}

type ParsedAttachment = {
  name: string;
  content: Buffer;
  mimeType?: string;
  sizeBytes?: number;
  contentDisposition?: string;
  inline?: boolean;
};

function shouldIngestAttachment(item: ParsedAttachment): boolean {
  const minAttachmentBytes = Math.max(0, Number(process.env.DOCUMENTS_EMAIL_MIN_ATTACHMENT_BYTES || 2048));
  if ((item.sizeBytes || 0) < minAttachmentBytes) return false;
  if (item.inline || String(item.contentDisposition || "").toLowerCase() === "inline") return false;

  const extension = item.name.split(".").pop()?.toLowerCase() || "";
  const mime = String(item.mimeType || "").toLowerCase();
  const allowedExtensions = new Set(["pdf", "csv", "xls", "xlsx", "jpg", "jpeg", "png", "webp", "tif", "tiff"]);
  const allowedMimePrefixes = [
    "application/pdf",
    "image/",
    "text/csv",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml",
  ];

  const extAllowed = extension ? allowedExtensions.has(extension) : false;
  const mimeAllowed = allowedMimePrefixes.some((prefix) => mime.startsWith(prefix));
  return extAllowed || mimeAllowed;
}

async function collectAttachments(parsed: any, depth = 0): Promise<ParsedAttachment[]> {
  const results: ParsedAttachment[] = [];
  if (!parsed) return results;

  for (const attachment of parsed.attachments || []) {
    if (!attachment?.content) continue;

    const name = attachment.filename || `attachment-${Date.now()}`;
    const mime = String(attachment.contentType || "").toLowerCase();
    const isInline = Boolean((attachment as unknown as { related?: boolean }).related);

    // Forwarded emails often carry a nested RFC822 message that contains the real PDF.
    if ((mime === "message/rfc822" || name.toLowerCase().endsWith(".eml")) && depth < 2) {
      try {
        const nested = await simpleParser(attachment.content as Buffer);
        const nestedAttachments = await collectAttachments(nested, depth + 1);
        results.push(...nestedAttachments);
      } catch {
        // Ignore nested parse failures and continue with other attachments.
      }
      continue;
    }

    results.push({
      name,
      content: attachment.content as Buffer,
      mimeType: attachment.contentType,
      sizeBytes: attachment.size,
      contentDisposition: attachment.contentDisposition,
      inline: isInline,
    });
  }

  return results;
}

async function runMailboxPollPass(args: {
  orgId: string;
  mailboxAddress: string;
  connection: ImapConnectionConfig;
  imapDebug: boolean;
  socketTimeout: number;
  connectionTimeout: number;
  greetingTimeout: number;
}): Promise<void> {
  const {
    orgId,
    mailboxAddress,
    connection,
    imapDebug,
    socketTimeout,
    connectionTimeout,
    greetingTimeout,
  } = args;

  let latestClientError: string | null = null;

  const client = new ImapFlow({
    host: connection.host,
    port: connection.port,
    secure: connection.secure,
    logger: imapDebug ? undefined : false,
    logRaw: imapDebug,
    emitLogs: false,
    socketTimeout,
    connectionTimeout,
    greetingTimeout,
    auth: {
      user: connection.user,
      pass: connection.pass,
    },
  });

  client.on("error", (err) => {
    latestClientError = String(err?.message || err || "IMAP error");
    if (imapDebug) {
      console.warn(`IMAP connection error for org ${orgId}:`, latestClientError);
    }
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");

    try {
      for await (const message of client.fetch({ seen: false }, { uid: true, envelope: true, source: true })) {
        const parsed = await simpleParser(message.source as Buffer);
        const attachments = [] as Array<{
          name: string;
          url: string;
          publicId: string;
          mimeType?: string;
          sizeBytes?: number;
          contentDisposition?: string;
          inline?: boolean;
        }>;

        const discovered = await collectAttachments(parsed);
        for (const attachment of discovered) {
          if (!shouldIngestAttachment(attachment)) continue;

          const uploaded = await uploadBuffer(
            attachment.content,
            `documents/${orgId}`,
            undefined,
            "auto",
            "authenticated",
          );

          attachments.push({
            name: attachment.name,
            url: uploaded.url,
            publicId: uploaded.publicId,
            mimeType: attachment.mimeType,
            sizeBytes: attachment.sizeBytes,
            contentDisposition: attachment.contentDisposition,
            inline: attachment.inline,
          });
        }

        await ingestEmailPayload({
          mailbox: mailboxAddress,
          sender: parsed.from?.text || "",
          subject: parsed.subject || "",
          messageId: parsed.messageId || String(message.uid),
          attachments,
        });

        await client.messageFlagsAdd(message.uid, ["\\Seen"]);
      }
    } finally {
      lock.release();
    }
  } catch (error: any) {
    const rawMessage = String(error?.message || error || latestClientError || "Unknown IMAP error");
    const endpoint = `${connection.host}:${connection.port} secure=${connection.secure}`;
    const user = maskEmail(connection.user);
    throw new Error(`${rawMessage} (imap=${endpoint}, user=${user || "***"})`);
  } finally {
    await client.logout().catch(() => undefined);
  }
}

async function pollOneOrganizationMailbox(orgId: string): Promise<void> {
  const [org, mailbox] = await Promise.all([
    Organization.findById(orgId).select("smtpSettings").lean() as Promise<
      | {
          smtpSettings?: {
            host?: string;
            user?: string;
            pass?: string;
            secure?: boolean;
          };
        }
      | null
    >,
    DocumentMailbox.findOne({ organizationId: orgId, isActive: true }).lean(),
  ]);

  if (!mailbox?.mailboxAddress) return;

  const connection = resolveImapConnectionConfig(org?.smtpSettings || {});
  if (!connection) return;

  const imapDebug = process.env.DOCUMENTS_EMAIL_IMAP_DEBUG === "true";
  const socketTimeout = Math.max(120000, Number(process.env.DOCUMENTS_EMAIL_IMAP_TIMEOUT_MS || 120000));
  const connectionTimeout = Number(process.env.DOCUMENTS_EMAIL_IMAP_CONNECT_TIMEOUT_MS || 30000);
  const greetingTimeout = Number(process.env.DOCUMENTS_EMAIL_IMAP_GREETING_TIMEOUT_MS || 20000);

  try {
    const maxAttempts = Math.max(1, Math.min(3, Number(process.env.DOCUMENTS_EMAIL_IMAP_RETRY_ATTEMPTS || 2)));
    let attempt = 0;

    while (attempt < maxAttempts) {
      attempt += 1;
      try {
        await runMailboxPollPass({
          orgId,
          mailboxAddress: mailbox.mailboxAddress,
          connection,
          imapDebug,
          socketTimeout,
          connectionTimeout,
          greetingTimeout,
        });

        // Successful pass resets transient failure backoff.
        orgBackoff.delete(orgId);
        return;
      } catch (attemptError: any) {
        const attemptMessage = String(attemptError?.message || attemptError || "Unknown IMAP error");
        const transientAttemptError = isTransientImapFailure(attemptMessage);

        if (!transientAttemptError || attempt >= maxAttempts) {
          throw attemptError;
        }

        if (imapDebug) {
          console.warn(
            `IMAP transient attempt ${attempt}/${maxAttempts} failed for org ${orgId}: ${attemptMessage}`,
          );
        }
      }
    }
  } catch (error: any) {
    const rawMessage = String(error?.message || error || "Unknown IMAP error");
    const isTransient = isTransientImapFailure(rawMessage);

    const state = orgBackoff.get(orgId) || { failures: 0, retryAfter: 0 };
    const nextFailures = state.failures + 1;
    const maxBackoffMs = Math.max(30000, Number(process.env.DOCUMENTS_EMAIL_POLL_FAILURE_BACKOFF_MAX_MS || 15 * 60 * 1000));
    const nextBackoffMs = Math.min(maxBackoffMs, 30000 * Math.pow(2, Math.min(nextFailures - 1, 6)));
    orgBackoff.set(orgId, { failures: nextFailures, retryAfter: Date.now() + nextBackoffMs });

    if (isTransient) {
      console.warn(
        `Document email polling transient failure for org ${orgId}: ${rawMessage}. Retrying in ${Math.round(nextBackoffMs / 1000)}s`,
      );
    } else {
      console.warn(`Document email polling failed for org ${orgId}:`, rawMessage);
    }
  }
}

async function pollAllMailboxes() {
  if (running) return;
  running = true;

  try {
    const mailboxes = await DocumentMailbox.find({ isActive: true }).select("organizationId").lean();
    for (const mailbox of mailboxes) {
      const orgId = String(mailbox.organizationId);
      const state = orgBackoff.get(orgId);
      if (state && state.retryAfter > Date.now()) continue;
      await pollOneOrganizationMailbox(orgId);
    }
  } finally {
    running = false;
  }
}

export function startDocumentEmailIngestionWorker() {
  const enabled = process.env.DOCUMENTS_EMAIL_POLLING_ENABLED === "true";
  if (!enabled) return;

  const intervalMs = Math.max(15000, Number(process.env.DOCUMENTS_EMAIL_POLL_INTERVAL_MS || 60000));
  if (timer) clearInterval(timer);

  pollAllMailboxes().catch(() => undefined);
  timer = setInterval(() => {
    pollAllMailboxes().catch(() => undefined);
  }, intervalMs);
}
