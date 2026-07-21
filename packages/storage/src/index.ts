export interface StorageProvider {
  putPrivateObject(input: { key: string; contentType: string; body: Uint8Array }): Promise<void>;
  deletePrivateObject(key: string): Promise<void>;
}
