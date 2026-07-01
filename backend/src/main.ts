import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

// ponytail: Render injects PORT; fall back to BACKEND_PORT for local dev.
const port = Number(process.env.PORT ?? process.env.BACKEND_PORT ?? 3000)

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  app.setGlobalPrefix('api')
  app.enableCors({
    origin: [
      'http://127.0.0.1:5173',
      'http://localhost:5173',
      'https://incredible-lolly-796942.netlify.app'
    ],
    credentials: true
  })

  await app.listen(port, '0.0.0.0')
}

bootstrap()
