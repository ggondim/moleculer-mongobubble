import Ajv from 'ajv';
import { Document, EJSON } from 'bson';
import { Context, Errors } from 'moleculer';
import { isEJSON } from './ejson';
import { inspect } from 'util';

export function unmergeParams(ctx: Context<Document>, {
  paramsProps = [] as string[],
  queryProps = [] as string[],
  bodyProps = [] as string[],
  mergeAdditionalProps = false,
} = {}) {
  // This was necessary because moleculer-web has an issue that
  // `mergeParams` cannot be defined per action when using auto-aliases
  // https://github.com/moleculerjs/moleculer-web/issues/333

  // Then, I were also forced to develop a new validation method
  // that would work with the unmerged params and also coerce types

  // TODO: remove this when the issue is fixed?

  // TODO: make another community module with those workarounds?

  if (ctx.params.params || ctx.params.query || ctx.params.body) {
    // already unmerged
    return ctx.params;
  }
  const params = {} as { query?: Document, body?: Document };

  if (!queryProps?.length && !bodyProps?.length && !mergeAdditionalProps) {
    params.body = ctx.params;
    return params;
  }

  if (queryProps.length) {
    params.query = {};
    queryProps.forEach((prop) => {
      params.query[prop] = ctx.params[prop];
    });
  }
  if (bodyProps.length) {
    params.body = {};
    bodyProps.forEach((prop) => {
      params.body[prop] = ctx.params[prop];
    });
  }
  if (mergeAdditionalProps) {
    if (!params.body) {
      params.body = {};
    }
    const additionalProps = Object
      .keys(ctx.params)
      .filter(prop => !queryProps.includes(prop)
        && !bodyProps.includes(prop)
        && !paramsProps.includes(prop));
    additionalProps.forEach((prop) => {
      params.body[prop] = ctx.params[prop];
    });
  }
  return params;
}

export function validateParams(params: Document, schema: Document) {
  const ajv = new Ajv({
    coerceTypes: true,
    useDefaults: true,
  });
  const validate = ajv.compile(schema);
  const valid = validate(params);
  if (!valid) {
    throw new Errors.ValidationError(`Invalid params: ${ajv.errorsText(validate.errors)}`);
  }
}

export function unmergeAndValidate(
  ctx: Context<Document>,
  schema: Document,
  excludeParams: string[] = [],
) {
  const params = unmergeParams(ctx, {
    queryProps: schema.properties.query
      ? Object.keys(schema.properties.query?.properties || {})
      : [],
    paramsProps: excludeParams,
    bodyProps: schema.properties.body
      ? Object.keys(schema.properties.body?.properties || {})
      : [],
    mergeAdditionalProps: schema.properties.body
      ? schema.properties.body.additionalProperties
      : false,
  });
  validateParams(params, schema);
  return params;
}

export function parseIdFromParams(ctx: Context<Document>) {
  let id = ctx.params.id || ctx.params?.params?.id;
  if (!id) {
    throw new Errors.ValidationError('Missing id in params');
  }

  if (typeof id === 'object' && isEJSON(id)) {
    id = EJSON.deserialize(id);
  } else if (typeof id === 'object' && id._id) {
    id = id._id;
  } else {
    id = decodeURIComponent(id);
  }

  if (ctx.service?.entityClass?.parseId) {
    id = ctx.service?.entityClass?.parseId(id);
  }

  return id;
}
