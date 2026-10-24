// Which files the chat accepts (PDF and Word, up to 10 MB) and how they are sent: as a data
// URL inside the message. The server reads the text out of it (see lib/uploads.ts).
import type { AttachmentAdapter } from "@assistant-ui/react";
import { generateId } from "ai";

export const MAX_FILE_MB = 10;
const ALLOWED = /\.(pdf|docx|xlsx|pptx|png|jpe?g)$/i;

const toDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

export const documentAttachmentAdapter: AttachmentAdapter = {
  accept:
    ".pdf,.docx,.xlsx,.pptx,.png,.jpg,.jpeg,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.presentationml.presentation,.png,.jpg,.jpeg,image/png,image/jpeg",

  async add({ file }) {
    if (!ALLOWED.test(file.name)) {
      throw new Error("Only PDF, Word, Excel, PowerPoint and picture (PNG, JPG) files can be attached.");
    }
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      throw new Error(`The file is larger than ${MAX_FILE_MB} MB.`);
    }
    return {
      id: generateId(),
      type: "file",
      name: file.name,
      file,
      contentType: file.type,
      content: [],
      status: { type: "requires-action", reason: "composer-send" },
    };
  },

  async send(attachment) {
    return {
      ...attachment,
      status: { type: "complete" },
      content: [
        {
          type: "file",
          mimeType: attachment.contentType ?? "",
          filename: attachment.name,
          data: await toDataUrl(attachment.file),
        },
      ],
    };
  },

  async remove() {},
};
