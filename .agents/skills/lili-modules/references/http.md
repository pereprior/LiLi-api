# Entrada y salida HTTP

Lee esta referencia cuando el módulo necesite endpoints. Tasks actualmente
expone servicios, pero no tiene controlador. Usa `src/auth/auth.controller.ts`
como referencia real de integración HTTP y comprueba también:

- `src/auth/decorators/authenticated-session.decorator.ts` y los guards
  registrados en `src/auth/auth.module.ts`.
- `src/config/app.config.ts`: configuración global de `ValidationPipe`.
- `src/shared/dto/param-uuid.dto.ts`: validación del parámetro UUID.
- `src/auth/responses/auth-me.response.ts`: salida pública explícita.
- `src/docs/`: OpenAPI externo, dividido en YAML.

## Responsabilidad del controlador

- Coloca `<feature>.controller.ts` junto a `<feature>.module.ts` y regístralo
  en `controllers`. Inyecta servicios por constructor.
- Recibe parámetros y body en DTOs concretos, importa esas clases como valores
  y usa la validación global. No repitas una `ValidationPipe` local sin necesidad.
- Obtén la identidad de `@Authenticated()` para operaciones del usuario.
  No permitas elegir el propietario mediante un `userUuid` enviado en el body.
  La autenticación no sustituye filtrar el acceso al recurso.
- Adapta entradas HTTP, llama a `execute` y construye la salida pública.
  Mantén reglas de negocio, consultas Prisma y coordinación del dominio fuera
  del controlador.
- Define ruta, método y status según el contrato acordado. Aprovecha los guards
  globales; no añadas `@Public()` por comodidad.
- Usa `responses/` cuando haga falta una representación pública explícita.
  Devuelve solo campos del contrato, sin serializar automáticamente la entidad
  o el registro Prisma. Añade un mapper de respuesta solo si la complejidad o
  reutilización de la conversión lo justifica.
- Documenta operaciones y schemas en `src/docs/`, con permisos, entradas,
  respuestas y errores. No añadas decoradores OpenAPI al código.

## Ejemplo ilustrativo

Este fragmento muestra cómo un futuro controlador podría invocar un servicio
existente de tasks. No es un endpoint implementado ni define su contrato final;
los campos de salida son un ejemplo mínimo.

```ts
import { Controller, Get, Param } from '@nestjs/common';

import { Authenticated } from '#src/auth/decorators/authenticated-session.decorator.js';
import type { AuthenticatedSession } from '#src/auth/types/authenticated-session.type.js';
import { ParamUuidDto } from '#src/shared/dto/param-uuid.dto.js';
import { TaskResponse } from '#src/tasks/responses/task.response.js';
import { FindTaskByUuidService } from '#src/tasks/services/find-task-by-uuid/find-task-by-uuid.service.js';

@Controller('tasks')
export class TasksController {
  constructor(private readonly findTaskByUuid: FindTaskByUuidService) {}

  @Get(':uuid')
  async findByUuid(
    @Authenticated() session: AuthenticatedSession,
    @Param() uuidDto: ParamUuidDto,
  ): Promise<TaskResponse> {
    const task = await this.findTaskByUuid.execute(
      { uuid: session.user.uuid },
      uuidDto,
    );

    return new TaskResponse(task.uuid, task.name);
  }
}
```

La clase ilustrativa `TaskResponse` viviría en `responses/task.response.ts`:

```ts
export class TaskResponse {
  constructor(
    public readonly uuid: string,
    public readonly name: string,
  ) {}
}
```

Los DTOs de ruta y body necesitan clases en runtime para validación; la sesión
es un tipo porque su obtención corresponde al decorador existente.
Verifica el flujo HTTP con tests E2E: los tests de tasks que invocan servicios
con PostgreSQL no prueban rutas, guards ni validación de peticiones.
