import { Document, EJSON } from 'bson';
import { Context } from 'moleculer';
import { parseIdFromParams } from '../utils/params';

export const deleteOne = {
  rest: 'DELETE /:id',
  handler: async (ctx: Context<Document>) => {
    const repository = await (async () => ctx.service?.getRepository())();
    const id = parseIdFromParams(ctx);
    const result = await repository.deleteOneById(id);
    const serialized = EJSON.serialize(result);

    if (ctx?.params?.stopPropagation) {
      return serialized;
    }

    ctx.broker.emit(`${ctx.service?.fullName}.deleted`, serialized);

    return serialized;
  },
};
