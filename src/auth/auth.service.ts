import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { WalletsService } from '../wallets/wallets.service';
import { Network } from '../wallets/entities/wallet.entity';
import { RegisterDto } from '../users/dto/register.dto';

type SafeUser = Omit<User, 'passwordhash'>;

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly walletsService: WalletsService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<{ user: SafeUser; token: string }> {
    const user = await this.usersService.create(dto);
    await Promise.all([
      this.walletsService.provisionWallet(user.id, Network.ETHEREUM),
      this.walletsService.provisionWallet(user.id, Network.POLYGON),
    ]);
    const token = this.signToken(user.id, user.email);
    return { user: this.sanitize(user), token };
  }

  async login(
    email: string,
    password: string,
  ): Promise<{ user: SafeUser; token: string }> {
    const user = await this.usersService.findByEmail(email);
    if (!user) throw new UnauthorizedException('Invalid credentials');
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');
    const token = this.signToken(user.id, user.email);
    return { user: this.sanitize(user), token };
  }

  private signToken(userId: string, email: string): string {
    return this.jwtService.sign({ sub: userId, email });
  }

  private sanitize(user: User): SafeUser {
    const { passwordHash: _omitted, ...safe } = user;
    return safe;
  }
}
