declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        telegramId: number;
      };
    }
  }
}

export {};
