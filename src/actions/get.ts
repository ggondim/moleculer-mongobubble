import { Document, EJSON } from 'bson';
import { Context } from 'moleculer';
import { parseIdFromParams } from '../utils/params';

export const getById = {
  rest: 'GET /:id',
  handler: async (ctx: Context<Document>) => {
    const repository = ctx.service?.getRepository('read');
    const id = parseIdFromParams(ctx);
    const result = await repository.get(id);

    if (!result) {
      // eslint-disable-next-line @typescript-eslint/dot-notation
      ctx.meta['$statusCode'] = 404;
      return null;
    }
    return EJSON.serialize(result);
  },
} as const;
