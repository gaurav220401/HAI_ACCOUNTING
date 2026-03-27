import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import Organization from "../models/organization.model";
import DocumentMailbox from "../models/document-mailbox.model";
import { uploadBuffer } from "../utils/cloudinary";
import { ingestEmailPayload } from "../controllers/document.controller";

let running = false;
let timer: NodeJS.Timeout | null = null;

function inferImapHost(smtpHost: string): string {
  if (!smtpHost) return "";
  if (smtpHost.startsWith("smtp.")) return smtpHost.replace(/^smtp\./, "imap.");
  return smtpHost;
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

  if (!org?.smtpSettings?.host || !org?.smtpSettings?.user || !org?.smtpSettings?.pass) return;
  if (!mailbox?.mailboxAddress) return;

  const host = inferImapHost(org.smtpSettings.host);
  if (!host) return;

  const client = new ImapFlow({
    host,
    port: 993,
    secure: true,
    auth: {
      user: org.smtpSettings.user,
      pass: org.smtpSettings.pass,
    },
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
        }>;

        for (const attachment of parsed.attachments || []) {
          if (!attachment.content) continue;
          const uploaded = await uploadBuffer(
            attachment.content,
            `documents/${mailbox.organizationId}`,
            undefined,
            "auto",
            "authenticated",
          );
          attachments.push({
            name: attachment.filename || `attachment-${Date.now()}`,
            url: uploaded.url,
            publicId: uploaded.publicId,
            mimeType: attachment.contentType,
            sizeBytes: attachment.size,
          });
        }

        await ingestEmailPayload({
          mailbox: mailbox.mailboxAddress,
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
    console.warn(`Document email polling failed for org ${orgId}:`, error?.message || error);
  } finally {
    await client.logout().catch(() => undefined);
  }
}

async function pollAllMailboxes() {
  if (running) return;
  running = true;

  try {
    const mailboxes = await DocumentMailbox.find({ isActive: true }).select("organizationId").lean();
    for (const mailbox of mailboxes) {
      await pollOneOrganizationMailbox(String(mailbox.organizationId));
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
