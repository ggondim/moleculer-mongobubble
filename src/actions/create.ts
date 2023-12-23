import { Document, EJSON } from 'bson';
import { Context } from 'moleculer';
import { unmergeAndValidate } from '../utils/params';
import { isEJSON } from '../utils/ejson';
import { MongoBubbleMetadata } from '../utils/types';

export const insertOne = {
  rest: 'POST /',
  handler: async (ctx: Context<Document, MongoBubbleMetadata>) => {
    const repository = ctx.service?.getRepository('write');

    const params = unmergeAndValidate(ctx, {
      type: 'object',
      // TODO: get schema from entity class
      properties: {
        body: {
          type: 'object',
          additionalProperties: true,
        },
        query: {
          type: 'object',
          properties: {
            stopPropagation: { type: 'boolean' },
          },
        },
      },
    });

    // TODO: replicate this logic in all actions
    // prevents EJSON from converting BSON to JSON (ie. ObjectId to string) instead EJSON to BSON
    const deserializedBody = isEJSON(params.body) ? EJSON.deserialize(params.body) : params.body;

    const result = await repository.insertOne(deserializedBody);
    const serialized = EJSON.serialize(result);

    if (params?.query?.stopPropagation) {
      return serialized;
    }

    const prefix = ctx.meta?.eventPrefix || '';
    ctx.broker.emit(`${prefix}${ctx.service?.fullName}.created`, serialized);

    return serialized;
  },
} as const;
