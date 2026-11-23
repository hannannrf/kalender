import type { Request } from 'express';

// Set only by identity.requireUser(). Modules read the User from here, never from the body, query or URL.
export interface AuthedRequest extends Request {
  userId: string;
}

export function userIdOf(req: Request): string {
  return (req as AuthedRequest).userId;
}
