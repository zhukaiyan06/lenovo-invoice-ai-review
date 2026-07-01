import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

const port = Number(process.env.BACKEND_PORT ?? 3000)

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  app.setGlobalPrefix('api')
  app.enableCors({
    origin: ['http://127.0.0.1:5173', 'http://localhost:5173'],
    credentials: true
  })

  await app.listen(port, '127.0.0.1')
}

bootstrap()
