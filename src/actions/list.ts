import { Document, EJSON } from 'bson';
import { Context } from 'moleculer';
import { PreventedResult, PreventedResultError } from '@mongobubble/core';
import { unmergeAndValidate } from '../utils/params';

export const list = {
  rest: 'GET /',
  handler: async (ctx: Context<Document>) => {
    const repository = await (async () => ctx.service?.getRepository())();

    const params = unmergeAndValidate(ctx, {
      type: 'object',
      properties: {
        query: {
          type: 'object',
          properties: {
            drafts: { type: 'boolean' },
            archived: { type: 'boolean' },
            page: { type: 'number' },
            limit: { type: 'number' },
          },
        },
      },
    });

    const statuses = ['PUBLISHED'];

    if (params.query?.drafts) {
      statuses.push('DRAFT');
    }
    if (params.query?.archived) {
      statuses.push('ARCHIVED');
    }

    const pipeline = [{
      $match: { '_meta.status': { $in: statuses } },
    }] as Document[];

    if (params.query?.page || params.query?.limit) {
      const page = params.query?.page || 1;
      const limit = params.query?.limit || 100;
      const skip = (page - 1) * limit;
      pipeline.push({ $skip: skip }, { $limit: limit });
    }

    const results = await repository.list(pipeline);
    return EJSON.serialize(results);
  },
} as const;

export const listDrafts = {
  rest: 'GET /drafts',
  handler: async (ctx: Context<Document>) => {
    const repository = await (async () => ctx.service?.getRepository())();

    const errorOrResults = await repository.listDrafts();
    if (errorOrResults instanceof PreventedResult) {
      throw new PreventedResultError(errorOrResults);
    }

    const results = errorOrResults;
    return EJSON.serialize(results);
  },
} as const;

export const listArchive = {
  rest: 'GET /archive',
  handler: async (ctx: Context<Document>) => {
    const repository = await (async () => ctx.service?.getRepository())();

    const errorOrResults = await repository.listArchive();
    if (errorOrResults instanceof PreventedResult) {
      throw new PreventedResultError(errorOrResults);
    }

    const results = errorOrResults;
    return EJSON.serialize(results);
  },
} as const;
