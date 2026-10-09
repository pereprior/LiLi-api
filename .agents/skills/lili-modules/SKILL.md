---
name: lili-modules
description: Crea o amplía módulos funcionales de LiLi siguiendo la estructura y el flujo de tasks, con servicios por operación, entidades, DTOs, repositorio abstracto, adaptador Prisma y mappers. Úsala al implementar módulos nuevos o nuevas operaciones; incluye la integración HTTP cuando forme parte del encargo.
---

# Módulos de LiLi

Usa `src/tasks/` como ejemplo de organización y separación de responsabilidades.
Adapta el patrón al dominio y a las operaciones solicitadas.

## Antes de implementar

- Lee `AGENTS.md`, `package.json`, el módulo objetivo y los ejemplos actuales de
  tasks citados abajo. Comprueba las rutas: el código actual y las instrucciones
  del usuario prevalecen sobre esta skill.
- Identifica operaciones, entradas, salidas, reglas, propietario de los datos y
  límites de persistencia. Un módulo nuevo no implica un CRUD completo.
- Usa `nestjs-best-practices` para decisiones específicas de NestJS, respetando
  las convenciones del proyecto, y `lili-testing` al trabajar con tests.

## Estructura

Crea cada carpeta solo cuando tenga contenido y una responsabilidad real.
Los nombres siguientes son ilustrativos.

```text
src/<feature>/
├── <feature>.module.ts
├── <feature>.controller.ts                 # Si necesita entrada HTTP
├── dto/
│   ├── create-<resource>.dto.ts
│   └── update-<resource>-details.dto.ts
├── entities/
│   └── <resource>.entity.ts
├── exceptions/
│   ├── <resource>.exception.ts
│   └── <resource>-not-found.exception.ts
├── mappers/
│   └── <resource>.mapper.ts
├── repositories/
│   ├── <resource>.repository.ts
│   └── prisma-<resource>.repository.ts
├── services/
│   └── create-<resource>/
│       ├── create-<resource>.service.ts
│       └── create-<resource>.service.spec.ts
├── types/data/
│   ├── create-<resource>.data.ts
│   └── update-<resource>.data.ts
├── responses/                             # Si necesita salida HTTP propia
├── utils/                                 # Cálculos puros del dominio
└── config/                                # Configuración propia, si existe
```

Usa archivos en kebab-case y nombres TypeScript en inglés. El módulo posee sus
DTOs, entidades, excepciones y utilidades. Lleva a `src/shared/` solo elementos
realmente compartidos; reutiliza los existentes cuando encajen.

## Flujo y responsabilidades

```text
Entrada HTTP → Controller → Service.execute → Repository abstracto
                                            → Adaptador Prisma → Base de datos
Salida HTTP  ← Response   ← Entity          ← Mapper            ← Registro
```

Otros puntos de entrada invocan la misma operación de aplicación. Para HTTP,
lee [references/http.md](references/http.md): completa la estructura de tasks,
que actualmente no tiene controlador, con una guía y un ejemplo ilustrativo.

### Servicios por operación

- Crea un servicio `@Injectable()` por operación, con método público `execute`
  y dependencias por constructor. Coloca servicio y spec en `services/<operation>/`.
  Evita un servicio único que acumule todo el módulo.
- Nombra las modificaciones `Update...Service`; el DTO puede usar otro verbo,
  como `ChangeTaskStatusDto`.
- El servicio coordina consultas, normaliza entradas, establece valores iniciales
  y comprueba reglas de negocio. Usa el repositorio abstracto, sin acceder a Prisma.
- Reutiliza otro servicio cuando aporte comportamiento real de aplicación.
  `FindTaskByUuidService` centraliza búsqueda accesible y error de ausencia;
  `UpdateTaskDetailsService` lo invoca antes de combinar datos y validar.
- Conserva la distinción entre `undefined` (no modificar) y `null` (vaciar si
  el contrato lo permite) en actualizaciones parciales.
- Tasks recibe `ParamUuidDto` para usuario y recurso, más el DTO de la operación.
  Tómalo como referencia; no fuerces DTOs de UUID sobre entradas con otro significado.
- Cuando autorización, auditoría o varias interfaces requieran un actor explícito,
  aplica actor + acción + payload + handler según `AGENTS.md`. El ejemplo de tasks
  no exige un dispatcher, CQRS ni capas adicionales por defecto.

### Entidades, DTOs y datos

- Usa clases con campos `public readonly` declarados en el constructor para
  entidades, como `TaskEntity`. No conviertas la entidad en un DTO validado ni
  en una copia de todos los campos de la tabla.
- Los DTOs validan la forma de entrada con los validadores existentes. Las reglas
  que dependen del estado o de otras entidades pertenecen a la aplicación.
- Los tipos `Create...Data` y `Update...Data` viven en `types/data/` y expresan
  el contrato de persistencia. No uses inputs de Prisma como contrato del servicio
  ni hagas que la entidad implemente el tipo de creación.
- Extrae conversiones a mappers y cálculos puros a utils cuando tengan una
  responsabilidad clara. Evita repartir lógica sencilla entre muchos helpers.

### Repositorios y mappers

- Para módulos con persistencia, sigue `TaskRepository`: clase abstracta como
  contrato y token de DI, con solo los métodos que necesitan sus operaciones.
- Implementa el contrato en `Prisma<Resource>Repository`, inyectando `PrismaService`.
  El adaptador posee consultas y devuelve entidades; los inputs y registros
  Prisma quedan dentro de la frontera de persistencia.
- Sigue `TaskMapper`: `toEntity`, `toListEntity` si se necesita, `toCreateInput`
  y `toUpdateInput`. Son conversiones, no lugares para permisos o reglas de negocio.
- En datos de un usuario, filtra consultas y mutaciones por propietario además
  del identificador. Aplica la visibilidad del dominio; no copies automáticamente
  `deletedAt`, borrado lógico ni una estrategia de eliminación de tasks.
- Decide atomicidad según las invariantes del dominio. Leer y después escribir
  no garantiza seguridad ante concurrencia; usa transacciones o condiciones de
  escritura cuando se necesiten. No atribuyas transacciones ni reintentos al
  ejemplo sin comprobar su código actual.
- Un módulo sin persistencia no necesita repositorio, adaptador ni mapper de BD.

### Excepciones y logging

- Sigue la familia de `TaskException`: base del módulo y variantes para errores
  esperados como ausencia, conflicto o validación.
- Conserva excepciones esperadas y transforma fallos inesperados en el error
  público genérico del módulo, sin exponer mensajes de Prisma o detalles internos.
- Usa `AppLogger` con el nombre del servicio y contexto de la operación. Sigue
  tasks para inicio, éxito, rechazo esperado y fallo. No registres payloads
  completos, secretos ni datos personales innecesarios.

### Composición de Nest

- Importa los módulos que proporcionan dependencias, registra servicios y enlaza
  contrato y adaptador con
  `{ provide: ResourceRepository, useClass: PrismaResourceRepository }`.
- Importa el repositorio abstracto como valor cuando sea token del constructor;
  `import type` elimina ese token en runtime. Sigue los imports `#src/...js`.
- Registra el controlador en `controllers` cuando exista. Exporta solo lo que
  consuman otros módulos; no copies toda la lista de exports de `TasksModule`.
- Integra el módulo en la composición correspondiente. Importa el módulo dueño
  de un servicio en vez de volver a declarar su provider en otro módulo.

## Ejemplos que consultar

Rutas relativas a la raíz del repositorio:

- `src/tasks/tasks.module.ts`: registro del contrato y del adaptador.
- `src/tasks/services/create-task/create-task.service.ts`: coordinación,
  normalización, valores iniciales y validación de relaciones.
- `src/tasks/services/update-task-details/update-task-details.service.ts`:
  actualización parcial y validación con valores actuales.
- `src/tasks/services/find-task-by-uuid/find-task-by-uuid.service.ts`:
  búsqueda accesible y traducción de ausencia a excepción del módulo.
- `src/tasks/repositories/`, `src/tasks/mappers/`, `src/tasks/entities/` y
  `src/tasks/types/data/`: frontera y conversiones de persistencia.

Reutiliza su organización, no sus reglas sobre tareas, subtareas, estados o
fechas. No refactorices tasks como parte de crear otro módulo.

## Verificación

Prueba operaciones y reglas nuevas con `lili-testing`. Si hay endpoints, cubre
validación HTTP, autenticación, acceso a recursos y respuestas. No añadas specs
que solo revaliden el comportamiento de class-validator en DTOs.

Ejecuta primero tests relevantes y después `pnpm typecheck`, `pnpm lint` y
`pnpm format:check`. Usa `pnpm run ci` para cambios sustanciales. Si cambia el
schema, crea migraciones con los comandos de `AGENTS.md`; no escribas SQL de
migración a mano. Informa de verificaciones realizadas y resultados.
