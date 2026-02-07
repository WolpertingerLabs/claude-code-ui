import { chatFileService } from "./chat-file-service.js";
import type { StoredImage } from "shared/types/index.js";

/**
 * Generate a unique message ID for storing image metadata.
 */
function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substring(2)}`;
}

/**
 * Store image IDs associated with a user message in chat metadata.
 * Used when sending a message with attached images (stream routes).
 */
export async function storeMessageImages(chatId: string, imageIds: string[]): Promise<void> {
  const chat = chatFileService.getChat(chatId);

  if (!chat) {
    console.warn(`Chat ${chatId} not found in database, skipping image metadata storage`);
    return;
  }

  const metadata = JSON.parse(chat.metadata || "{}");
  const messageId = generateMessageId();

  if (!metadata.messageImages) {
    metadata.messageImages = {};
  }

  metadata.messageImages[messageId] = {
    imageIds,
    timestamp: new Date().toISOString(),
    messageType: "user",
  };

  chatFileService.updateChat(chatId, {
    metadata: JSON.stringify(metadata),
  });
}

/**
 * Store full image objects associated with an upload in chat metadata.
 * Used when uploading images directly to a chat (image routes).
 */
export async function updateChatWithImages(chatId: string, images: StoredImage[]): Promise<void> {
  const chat = chatFileService.getChat(chatId);

  if (!chat) {
    console.warn(`Chat ${chatId} not found in database, skipping metadata update`);
    return;
  }

  const metadata = JSON.parse(chat.metadata || "{}");
  const messageId = generateMessageId();

  if (!metadata.images) {
    metadata.images = {};
  }

  metadata.images[messageId] = images;

  chatFileService.updateChat(chatId, {
    metadata: JSON.stringify(metadata),
  });
}
