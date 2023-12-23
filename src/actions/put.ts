import { Document, EJSON } from 'bson';
import { Context } from 'moleculer';
import { parseIdFromParams } from '../utils/params';

export const publish = {
  rest: 'PUT /:id/publish',
  handler: async (ctx: Context<Document>) => {
    const repository = await (async () => ctx.service?.getRepository())();
    const id = parseIdFromParams(ctx);

    const result = await repository.publishById(id);
    const serialized = EJSON.serialize(result);

    if (ctx.params?.stopPropagation) {
      return serialized;
    }

    ctx.broker.emit(`${ctx.service?.fullName}.published`, serialized);

    return serialized;
  },
};

export const archive = {
  rest: 'PUT /:id/archive',
  handler: async (ctx: Context<Document>) => {
    const repository = await (async () => ctx.service?.getRepository())();
    const id = parseIdFromParams(ctx);

    const result = await repository.archiveById(id);
    const serialized = EJSON.serialize(result);

    if (ctx.params?.stopPropagation) {
      return serialized;
    }

    ctx.broker.emit(`${ctx.service?.fullName}.archived`, serialized);

    return serialized;
  },
};

export const unpublish = {
  rest: 'PUT /:id/unpublish',
  handler: async (ctx: Context<Document>) => {
    const repository = await (async () => ctx.service?.getRepository())();
    const id = parseIdFromParams(ctx);

    const result = await repository.unpublishById(id);
    const serialized = EJSON.serialize(result);

    if (ctx.params?.stopPropagation) {
      return serialized;
    }

    ctx.broker.emit(`${ctx.service?.fullName}.unpublished`, serialized);

    return serialized;
  },
};
