// Typed error thrown by core domain functions, so callers can distinguish
// domain-rule violations from unexpected runtime errors.

export class DomainError extends Error {
  readonly name = "DomainError";
}
