export interface ITokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface IAuthService {
  hashPassword(password: string): Promise<string>;
  comparePassword(password: string, hash: string): Promise<boolean>;
  generateTokens(userId: string, role: string): ITokenPair;
  generateAccessToken(userId: string, role: string): string;
  verifyAccessToken(token: string): { userId: string; role: string };
  verifyRefreshToken(token: string): { userId: string };
}
