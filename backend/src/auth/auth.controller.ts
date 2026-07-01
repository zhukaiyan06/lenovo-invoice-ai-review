import { Body, Controller, Get, Inject, Post, UseGuards } from '@nestjs/common'
import { CurrentUser } from './current-user'
import type { AuthenticatedUser } from './auth.service'
import { AuthGuard } from './auth.guard'
import { AuthService } from './auth.service'

interface LoginBody {
  username?: string
  password?: string
}

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post('login')
  async login(@Body() body: LoginBody) {
    return this.auth.login(body.username ?? '', body.password ?? '')
  }

  @Get('me')
  @UseGuards(AuthGuard)
  async me(@CurrentUser() user: AuthenticatedUser) {
    return { user }
  }
}
