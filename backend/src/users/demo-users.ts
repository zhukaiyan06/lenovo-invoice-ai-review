import { createHash } from 'node:crypto'

export const demoPassword = 'demo123'

export function hashPassword(password: string) {
  return createHash('sha256').update(password).digest('hex')
}

export const demoUsers = [
  {
    username: 'l2-a',
    passwordHash: hashPassword(demoPassword),
    role: 'L2',
    orgName: '山东百诺冉合电子科技有限公司',
    region: '山东 / 聊城 / 阳谷'
  },
  {
    username: 'l2-b',
    passwordHash: hashPassword(demoPassword),
    role: 'L2',
    orgName: '济南渠道服务商样例',
    region: '山东 / 济南 / 历下'
  },
  {
    username: 'auditor-a',
    passwordHash: hashPassword(demoPassword),
    role: 'AUDITOR',
    orgName: '联想渠道审核组',
    region: '山东'
  },
  {
    username: 'auditor-b',
    passwordHash: hashPassword(demoPassword),
    role: 'AUDITOR',
    orgName: '联想渠道审核组',
    region: '华北'
  },
  {
    username: 'supervisor',
    passwordHash: hashPassword(demoPassword),
    role: 'SUPERVISOR',
    orgName: '联想渠道管理',
    region: null
  }
]
