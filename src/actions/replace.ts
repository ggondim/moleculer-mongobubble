import { Document, EJSON } from 'bson';
import { ActionVisibility, Context } from 'moleculer';
import { unmergeAndValidate } from '../utils/params';
import { isEJSON } from '../utils/ejson';

export const replaceOneRest = {
  rest: 'PUT /',
  handler: async (ctx: Context<Document>) => {
    const params = unmergeAndValidate(ctx, {
      type: 'object',
      properties: {
        body: {
          type: 'object',
          additionalProperties: true,
        },
        query: {
          type: 'object',
          properties: {
            upsert: { type: 'boolean' },
            stopPropagation: { type: 'boolean' },
          },
        },
      },
    });
    return ctx.call(`${ctx.service?.fullName}.replaceOne`, {
      document: params.body,
      upsert: params.query.upsert,
      stopPropagation: params?.query?.stopPropagation,
    });
  },
};

export const replaceOne = {
  visibility: 'public' as ActionVisibility,
  handler: async (ctx: Context<Document>) => {
    const repository = await (async () => ctx.service?.getRepository())();

    const options = { snapshot: {}, upsert: null };
    if (ctx.params?.upsert) {
      options.upsert = true;
    } else {
      Reflect.deleteProperty(options, 'upsert');
    }

    const document = isEJSON(ctx.params.document)
      ? EJSON.deserialize(ctx.params.document)
      : ctx.params.document;

    const result = await repository.replaceOne(document, options);
    const serialized = EJSON.serialize(result);

    if (ctx.params?.stopPropagation) {
      return serialized;
    }

    ctx.broker.emit(`${ctx.service?.fullName}.updated`, {
      id: ctx.params.id,
      result: serialized,
      old: options.snapshot,
      document,
      upsert: ctx.params.upsert,
    });

    return serialized;
  },
};
