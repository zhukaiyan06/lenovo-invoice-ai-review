import { createHmac, timingSafeEqual } from 'node:crypto'
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import { User } from '@prisma/client'
import { hashPassword } from '../users/demo-users'
import { UsersService } from '../users/users.service'

export interface AuthenticatedUser {
  id: string
  username: string
  role: string
  orgName: string
  region: string | null
}

interface TokenPayload {
  sub: string
  username: string
  role: string
  iat: number
}

const tokenSecret = process.env.AUTH_TOKEN_SECRET ?? 'local-dev-token-secret'

function base64Url(input: string) {
  return Buffer.from(input).toString('base64url')
}

function fromBase64Url(input: string) {
  return Buffer.from(input, 'base64url').toString('utf8')
}

function sign(value: string) {
  return createHmac('sha256', tokenSecret).update(value).digest('base64url')
}

function publicUser(user: User): AuthenticatedUser {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    orgName: user.orgName,
    region: user.region
  }
}

@Injectable()
export class AuthService {
  constructor(@Inject(UsersService) private readonly users: UsersService) {}

  async login(username: string, password: string) {
    const user = await this.users.findByUsername(username)
    if (!user || user.passwordHash !== hashPassword(password)) {
      throw new UnauthorizedException('用户名或密码错误')
    }

    const token = this.issueToken(user)

    return {
      token,
      user: publicUser(user)
    }
  }

  async verifyToken(token: string): Promise<AuthenticatedUser> {
    const [payloadPart, signature] = token.split('.')
    if (!payloadPart || !signature) {
      throw new UnauthorizedException('登录状态无效')
    }

    const expected = sign(payloadPart)
    const expectedBuffer = Buffer.from(expected)
    const actualBuffer = Buffer.from(signature)

    if (
      expectedBuffer.length !== actualBuffer.length ||
      !timingSafeEqual(expectedBuffer, actualBuffer)
    ) {
      throw new UnauthorizedException('登录状态无效')
    }

    const payload = JSON.parse(fromBase64Url(payloadPart)) as TokenPayload
    const user = await this.users.findById(payload.sub)
    if (!user) {
      throw new UnauthorizedException('用户不存在')
    }

    return publicUser(user)
  }

  private issueToken(user: User) {
    const payload: TokenPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      iat: Math.floor(Date.now() / 1000)
    }
    const payloadPart = base64Url(JSON.stringify(payload))

    return `${payloadPart}.${sign(payloadPart)}`
  }
}
