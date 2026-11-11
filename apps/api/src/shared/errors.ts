/** Erros de aplicação. Não conhecem HTTP; o mapeamento para status fica em app.ts. */
export class AppError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = new.target.name;
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Recurso não encontrado") {
    super("not_found", message);
  }
}
export class UnauthorizedError extends AppError {
  constructor(message = "Autenticação necessária") {
    super("unauthorized", message);
  }
}
export class ForbiddenError extends AppError {
  constructor(message = "Operação não permitida") {
    super("forbidden", message);
  }
}
export class ConflictError extends AppError {
  constructor(message: string) {
    super("conflict", message);
  }
}
/** Regra de negócio violada (entrada bem formada, mas inválida para o domínio). */
export class BusinessRuleError extends AppError {
  constructor(message: string) {
    super("business_rule", message);
  }
}
