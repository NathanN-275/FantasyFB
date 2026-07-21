export interface ObservabilityProvider {
  info(event: string, fields?: Readonly<Record<string, string | number | boolean>>): void;
  error(event: string, fields?: Readonly<Record<string, string | number | boolean>>): void;
}
