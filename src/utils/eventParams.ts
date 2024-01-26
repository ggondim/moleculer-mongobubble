import { Document } from 'bson';
import { OptionalUnlessRequiredId, UpdateResult } from 'mongodb';

export type CreatedEventParams<
  TEntity = Document,
> = OptionalUnlessRequiredId<TEntity>;

export type UpdatedEventParams<
  TEntity = Document,
  Identity = unknown,
> = {
  id: Identity,
  result: UpdateResult,
  old: OptionalUnlessRequiredId<TEntity>,
  patch: Document,
};
