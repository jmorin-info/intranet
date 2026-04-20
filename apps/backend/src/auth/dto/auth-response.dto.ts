export class AuthResponseDto {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    departmentId?: string;
    isActive: boolean;
    lastLoginAt?: Date;
    createdAt: Date;
  };
}
