import { Document, EJSON } from 'bson';

export async function call(method: string, params: Document, opts: unknown): Promise<unknown> {
  const p = EJSON.serialize(params);
  const result = await this.broker.call(method, p, opts);
  return EJSON.deserialize(result);
}
