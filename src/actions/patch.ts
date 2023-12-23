import { Document, EJSON } from 'bson';
import { ActionVisibility, Context } from 'moleculer';
import { unmergeAndValidate } from '../utils/params';
import { isEJSON } from '../utils/ejson';
import { MongoBubbleMetadata } from '../utils/types';

export const patchOneByIdRest = {
  rest: 'PATCH /:id',
  handler: async (ctx: Context<Document, MongoBubbleMetadata>) => {
    const id = ctx.service?.parseId(ctx);
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
            stopPropagation: { type: 'boolean' },
          },
        },
      },
    }, ['id']);

    const bsonBody = isEJSON(params.body) ? EJSON.deserialize(params.body) : params.body;

    return ctx.call(`${ctx.service?.fullName}.patchOneById`, {
      id,
      patch: bsonBody,
      stopPropagation: params?.query?.stopPropagation,
    }, {
      meta: {
        eventPrefix: ctx.meta?.eventPrefix,
      },
    });
  },
};

export const patchOneById = {
  visibility: 'public' as ActionVisibility,
  params: {
    patch: { type: 'object' },
  },
  handler: async (ctx: Context<Document, MongoBubbleMetadata>) => {
    const repository = await (async () => ctx.service?.getRepository())();

    const options = { snapshot: {} };

    const bsonId = isEJSON(ctx.params.id) ? EJSON.deserialize(ctx.params.id) : ctx.params.id;
    const bsonPatch = isEJSON(ctx.params.patch)
      ? EJSON.deserialize(ctx.params.patch)
      : ctx.params.patch;

    const result = await repository.patchOne({
      _id: bsonId,
    }, bsonPatch, options);

    const serialized = EJSON.serialize(result);

    if (ctx.params?.stopPropagation) {
      return serialized;
    }

    const prefix = ctx.meta?.eventPrefix || '';
    ctx.broker.emit(`${prefix}${ctx.service?.fullName}.updated`, {
      id: ctx.params.id,
      result: serialized,
      old: options.snapshot,
      patch: ctx.params.patch,
    });

    return serialized;
  },
};

export const patchOneRest = {
  rest: 'PATCH /',
  handler: async (ctx: Context<Document, MongoBubbleMetadata>) => {
    const params = ctx.service?.unmergeAndValidate(ctx, {
      type: 'object',
      properties: {
        body: {
          type: 'object',
          additionalProperties: true,
        },
        query: {
          type: 'object',
          properties: {
            filter: { type: 'string' },
            // upsert: { type: 'boolean' },
            stopPropagation: { type: 'boolean' },
          },
          required: ['filter'],
        },
      },
    }, ['id']);

    const jsonFilter = JSON.parse(params.query?.filter || '{}');
    const bsonFilter = isEJSON(jsonFilter) ? EJSON.deserialize(jsonFilter) : jsonFilter;

    return ctx.call(`${ctx.service?.fullName}.patchOne`, {
      filter: bsonFilter,
      upsert: params.query.upsert,
      patch: params.body,
      stopPropagation: params?.query?.stopPropagation,
    }, {
      meta: {
        eventPrefix: ctx.meta?.eventPrefix,
      },
    });
  },
};

export const patchOne = {
  visibility: 'public' as ActionVisibility,
  params: {
    filter: { type: 'object' },
    // upsert: { type: 'boolean', optional: true },
    patch: { type: 'object' },
  },
  handler: async (ctx: Context<Document, MongoBubbleMetadata>) => {
    const repository = await (async () => ctx.service?.getRepository())();

    const snapshot = {};
    const options = ctx.params.upsert ? { upsert: true, snapshot } : { snapshot };

    const bsonFilter = isEJSON(ctx.params.filter)
      ? EJSON.deserialize(ctx.params.filter)
      : ctx.params.filter;
    const bsonPatch = isEJSON(ctx.params.patch)
      ? EJSON.deserialize(ctx.params.patch)
      : ctx.params.patch;

    const result = await repository.patchOne(
      bsonFilter,
      bsonPatch,
      options,
    );

    const serialized = EJSON.serialize(result);

    if (ctx?.params?.stopPropagation) {
      return serialized;
    }

    const prefix = ctx.meta?.eventPrefix || '';
    ctx.broker.emit(`${prefix}${ctx.service?.fullName}.updated`, {
      id: ctx.params.id,
      result: serialized,
      old: options.snapshot,
      patch: ctx.params.patch,
    });

    return serialized;
  },
};
