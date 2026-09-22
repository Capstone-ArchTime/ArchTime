export interface IOtp {
  id: string;
  email: string;
  code: string;
  expiresAt: Date;
  createdAt: Date;
}
