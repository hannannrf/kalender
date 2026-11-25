// Public entry of the chats module (architecture section 6.1).
export { router } from './routes';
export { approveChat, listChats, previewExport, revokeChat, updateChat, type Approved, type ChatView, type Refusal, type Upload } from './service';
// AC-13.3: called only by identity's account deletion, in its own transaction (architecture 6.3).
export { deleteAllForUser } from './repository';
