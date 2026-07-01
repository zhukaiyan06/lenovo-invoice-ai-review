import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import { AuthService } from './auth.service'

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest()
    const header = request.headers.authorization as string | undefined
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null

    if (!token) {
      throw new UnauthorizedException('请先登录')
    }

    request.user = await this.auth.verifyToken(token)

    return true
  }
}
