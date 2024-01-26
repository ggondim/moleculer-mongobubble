import { Document, EJSON } from 'bson';
import { Context } from 'moleculer';
import { parseIdFromParams } from '../utils/params';
import { MongoBubbleMetadata } from '../utils/types';

export const deleteOne = {
  rest: 'DELETE /:id',
  handler: async (ctx: Context<Document, MongoBubbleMetadata>) => {
    const repository = await (async () => ctx.service?.getRepository('write'))();
    const id = parseIdFromParams(ctx);
    const result = await repository.deleteOneById(id);
    const serialized = EJSON.serialize(result);

    if (ctx?.params?.stopPropagation) {
      return serialized;
    }

    const prefix = ctx.meta?.eventPrefix || '';
    ctx.broker.emit(`${prefix}${ctx.service?.fullName}.deleted`, serialized);

    return serialized;
  },
};
