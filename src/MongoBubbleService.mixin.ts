/* eslint-disable eslint-comments/disable-enable-pair */
/* eslint-disable eslint-comments/no-unlimited-disable */
/* eslint-disable */
import {
  ClonableConstructor, MongoRepositoryOptions, PreventedResult, PreventedResultError,
} from '@mongobubble/core';
import Ajv from 'ajv';
import { ObjectId, EJSON } from 'bson';
import { ServiceSchema, Context, Errors } from 'moleculer';
import { EntityWithLifecycle, LifecyclePluginOptions, MongoBubble } from 'mongobubble';
import { MongoClient, Document } from 'mongodb';

let GLOBAL_CLIENT: MongoClient;

export type MongoBubbleMixinOptions = {
  reuseGlobalClient?: boolean;
  reuseLocalRepository?: boolean;
  dbName: string;
  uri?: string;
};

export type MongoBubbleMixin<
  TEntity extends EntityWithLifecycle<TEntity, Identity>,
  Identity,
> = Partial<ServiceSchema> & {
  repository?: MongoBubble<TEntity, Identity>,
  mongobubbleMixinOptions: MongoBubbleMixinOptions;
};

export type EntityClassWithStatics<TEntity> = ClonableConstructor<TEntity> & Partial<{
  COLLECTION: string,
  parseId: (id: string) => ObjectId | number | string,
}>;

export default function createDbServiceMixin<
  TEntity extends EntityWithLifecycle<TEntity, Identity>,
  Identity = ObjectId,
>(
  entityClass: EntityClassWithStatics<TEntity>,
  mixinOptions: MongoBubbleMixinOptions = {} as MongoBubbleMixinOptions,
  repositoryOptions = {} as Document & MongoRepositoryOptions<TEntity> & LifecyclePluginOptions,
): Partial<ServiceSchema> {
  const mixin: MongoBubbleMixin<TEntity, Identity> = {
    name: entityClass.COLLECTION,

    mongobubbleMixinOptions: mixinOptions,

    repository: null,

    async created(this): Promise<void> {
      mixinOptions.reuseGlobalClient = typeof mixinOptions.reuseGlobalClient === 'undefined'
        ? true
        : mixinOptions.reuseGlobalClient;
      mixinOptions.reuseLocalRepository = typeof mixinOptions.reuseLocalRepository === 'undefined'
        ? true
        : mixinOptions.reuseLocalRepository;

      if (mixinOptions.reuseGlobalClient && !GLOBAL_CLIENT) {
        GLOBAL_CLIENT = await MongoClient.connect(mixinOptions.uri || 'mongodb://localhost:27017');
      }

      if (mixinOptions.reuseLocalRepository && !this.repository) {
        this.repository = await this.newReusableRepository();
      }
    },

    stopped(this) {
      // try {
      //   if (this.repository) {
      //     this.repository.dispose();
      //   }
      //   if (GLOBAL_CLIENT && GLOBAL_CLIENT.close) {
      //     GLOBAL_CLIENT.close();
      //   }
      // } catch (e) {
      //   // this.logger.warn("Unable to stop database connection gracefully.", e);
      // }
    },

    methods: {
      async newReusableRepository() {
        return new MongoBubble<TEntity, Identity>(
          {
            ...repositoryOptions,
            client: GLOBAL_CLIENT,
            db: mixinOptions.dbName,
            autoConnectionSwitch: false,
            EntityClass: entityClass,
          },
        );
      },

      getRepository(): MongoBubble<TEntity, Identity> {
        if (mixinOptions.reuseLocalRepository) {
          return this.repository;
        }

        if (mixinOptions.reuseGlobalClient) {
          return this.newRepository();
        }

        return new MongoBubble<TEntity, Identity>(
          {
            ...repositoryOptions,
            autoConnectionSwitch: true,
          },
        );
      },

      getGlobalClient(): MongoClient {
        return GLOBAL_CLIENT;
      },

      async call(method: string, params: any, opts: any): Promise<any> {
        const p = EJSON.serialize(params);
        const result = await this.broker.call(method, p, opts);
        return EJSON.deserialize(result);
      },

      unmergeParams(ctx: Context<Document>, {
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
        const params = {} as { query?: { [k: string]: any }, body?: { [k: string]: any } };

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
          const additionalProps = Object.keys(ctx.params).filter((prop) => {
            return !queryProps.includes(prop)
              && !bodyProps.includes(prop)
              && !paramsProps.includes(prop);
          });
          additionalProps.forEach((prop) => {
            params.body[prop] = ctx.params[prop];
          });
        }
        return params;
      },

      validateParams(params: any, schema: any) {
        const ajv = new Ajv({
          coerceTypes: true,
          useDefaults: true,
        });
        const validate = ajv.compile(schema);
        const valid = validate(params);
        if (!valid) {
          throw new Errors.ValidationError(`Invalid params: ${ajv.errorsText(validate.errors)}`);
        }
      },

      unmergeAndValidate(ctx: Context<Document>, schema: any, excludeParams: string[] = []) {
        const params = this.unmergeParams(ctx, {
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
        this.validateParams(params, schema);
        return params;
      },

      parseId(ctx: Context<Document>) {
        let id = ctx.params.id || ctx.params?.params?.id;
        if (!id) {
          throw new Errors.ValidationError('Missing id in params');
        }

        id = decodeURIComponent(id);

        if (entityClass.parseId) {
          id = entityClass.parseId(id);
        }

        return id;
      },
    },

    actions: {

      list: {
        rest: 'GET /',
        handler: async (ctx: Context<Document>) => {
          const repository = ctx.service?.getRepository();

          const params = ctx.service?.unmergeAndValidate(ctx, {
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

          let results: TEntity[];

          const statuses = ["PUBLISHED"];

          if (params.query?.drafts) {
            statuses.push("DRAFT");
          }
          if (params.query?.archived) {
            statuses.push("ARCHIVED");
          }

          const pipeline = [{
            $match: { '_meta.status': { $in: statuses } },
          }] as any[];

          if (params.query?.page || params.query?.limit) {
            const page = params.query?.page || 1;
            const limit = params.query?.limit || 100;
            const skip = (page - 1) * limit;
            pipeline.push({ $skip: skip }, { $limit: limit });
          }

          results = await repository.list(pipeline);
          return EJSON.serialize(results);
        },
      },

      listDrafts: {
        rest: 'GET /drafts',
        handler: async (ctx: Context<Document>) => {
          const repository = ctx.service?.getRepository();
          let results: TEntity[];

          const errorOrResults = await repository.listDrafts();
          if (errorOrResults instanceof PreventedResult) {
            throw new PreventedResultError(errorOrResults);
          }
          results = errorOrResults;

          return EJSON.serialize(results);
        },
      },

      listArchive: {
        rest: 'GET /archive',
        handler: async (ctx: Context<Document>) => {
          const repository = ctx.service?.getRepository();
          let results: TEntity[];

          const errorOrResults = await repository.listArchive();
          if (errorOrResults instanceof PreventedResult) {
            throw new PreventedResultError(errorOrResults);
          }
          results = errorOrResults;

          return EJSON.serialize(results);
        },
      },

      getById: {
        rest: 'GET /:id',
        handler: async (ctx: Context<Document>) => {
          const repository = ctx.service?.getRepository();
          const id = ctx.service?.parseId(ctx);
          const result = await repository.get(id);

          if (!result) {
            // eslint-ignore-next-line
            ctx.meta["$statusCode"] = 404;
            return null;
          }
          return EJSON.serialize(result);
        },
      },

      insertOne: {
        rest: 'POST /',
        handler: async (ctx: Context<Document>) => {
          const repository = ctx.service?.getRepository() as MongoBubble<TEntity, Identity>;

          const params = ctx.service?.unmergeAndValidate(ctx, {
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

          const result = await repository.insertOne(EJSON.deserialize(params.body));
          const serialized = EJSON.serialize(result);

          if (params.query.stopPropagation) {
            return serialized;
          }

          ctx.broker.emit(`${ctx.service?.fullName}.created`, serialized);

          return serialized;
        },
      },

      patchOneByIdRest: {
        rest: 'PATCH /:id',
        handler: async (ctx: Context<Document>) => {
          const id = ctx.service?.parseId(ctx);
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
                  stopPropagation: { type: 'boolean' },
                },
              },
            },
          }, ['id']);

          return ctx.call(`${ctx.service?.fullName}.patchOneById`, {
            id: id,
            patch: params.body,
            stopPropagation: params.query.stopPropagation,
          });
        },
      },

      patchOneById: {
        visibility: 'public',
        params: {
          patch: { type: 'object' },
        },
        handler: async (ctx: Context<Document>) => {
          const repository = ctx.service?.getRepository() as MongoBubble<TEntity, Identity>;

          const options = { snapshot: {} };

          const result = await repository.patchOne({
            _id: ctx.params.id,
          }, EJSON.deserialize(ctx.params.patch), options);

          const serialized = EJSON.serialize(result);

          if (ctx.params.stopPropagation) {
            return serialized;
          }

          ctx.broker.emit(`${ctx.service?.fullName}.updated`, {
            id: ctx.params.id,
            result: serialized,
            old: options.snapshot,
            patch: ctx.params.patch,
          });

          return serialized;
        },
      },

      patchOneRest: {
        rest: 'PATCH /',
        handler: async (ctx: Context<Document>) => {
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

          params.query.filter = EJSON.parse(params.query.filter);

          return ctx.call(`${ctx.service?.fullName}.patchOne`, {
            filter: params.query.filter,
            upsert: params.query.upsert,
            patch: params.body,
            stopPropagation: params.query.stopPropagation,
          });
        },
      },

      patchOne: {
        visibility: 'public',
        params: {
          filter: { type: 'object' },
          // upsert: { type: 'boolean', optional: true },
          patch: { type: 'object' },
        },
        handler: async (ctx: Context<Document>) => {
          const repository = ctx.service?.getRepository() as MongoBubble<TEntity, Identity>;

          const snapshot = {};
          const options = ctx.params.upsert ? { upsert: true, snapshot } : { snapshot };

          const result = await repository.patchOne(
            EJSON.deserialize(ctx.params.filter),
            EJSON.deserialize(ctx.params.patch),
            options,
          );

          const serialized = EJSON.serialize(result);

          if (ctx.params.stopPropagation) {
            return serialized;
          }

          ctx.broker.emit(`${ctx.service?.fullName}.updated`, {
            id: ctx.params.id,
            result: serialized,
            old: options.snapshot,
            patch: ctx.params.patch,
          });

          return serialized;
        },
      },

      replaceOneRest: {
        rest: 'PUT /',
        handler: async (ctx: Context<Document>) => {
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
                  upsert: { type: 'boolean' },
                  stopPropagation: { type: 'boolean' },
                },
              },
            },
          });
          return ctx.call(`${ctx.service?.fullName}.replaceOne`, {
            document: params.body,
            upsert: params.query.upsert,
            stopPropagation: params.query.stopPropagation,
          });
        },
      },

      replaceOne: {
        visibility: 'public',
        handler: async (ctx: Context<Document>) => {
          const repository = ctx.service?.getRepository() as MongoBubble<TEntity, Identity>;

          const options = { snapshot: {} };
          if (ctx.params.upsert) {
            options['upsert'] = true;
          }

          const document = EJSON.deserialize(ctx.params.document);
          const result = await repository.replaceOne(document, options);
          const serialized = EJSON.serialize(result);

          if (ctx.params.stopPropagation) {
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
      },

      deleteOne: {
        rest: 'DELETE /:id',
        handler: async (ctx: Context<Document>) => {
          const repository = ctx.service?.getRepository() as MongoBubble<TEntity, Identity>;
          const id = ctx.service?.parseId(ctx);
          const result = await repository.deleteOneById(id);
          const serialized = EJSON.serialize(result);

          if (ctx.params.stopPropagation) {
            return serialized;
          }

          ctx.broker.emit(`${ctx.service?.fullName}.deleted`, serialized);

          return serialized;
        },
      },

      publish: {
        rest: 'PUT /:id/publish',
        handler: async (ctx: Context<Document>) => {
          const repository = ctx.service?.getRepository();
          const id = ctx.service?.parseId(ctx);

          console.log("id", id);

          const result = await repository.publishById(id)
          const serialized = EJSON.serialize(result);

          if (ctx.params.stopPropagation) {
            return serialized;
          }

          ctx.broker.emit(`${ctx.service?.fullName}.published`, serialized);

          return serialized;
        },
      },

      archive: {
        rest: 'PUT /:id/archive',
        handler: async (ctx: Context<Document>) => {
          const repository = ctx.service?.getRepository();
          const id = ctx.service?.parseId(ctx);

          const result = await repository.archiveById(id)
          const serialized = EJSON.serialize(result);

          if (ctx.params.stopPropagation) {
            return serialized;
          }

          ctx.broker.emit(`${ctx.service?.fullName}.archived`, serialized);

          return serialized;
        },
      },

      unpublish: {
        rest: 'PUT /:id/unpublish',
        handler: async (ctx: Context<Document>) => {
          const repository = ctx.service?.getRepository();
          const id = ctx.service?.parseId(ctx);

          const result = await repository.unpublishById(id)
          const serialized = EJSON.serialize(result);

          if (ctx.params.stopPropagation) {
            return serialized;
          }

          ctx.broker.emit(`${ctx.service?.fullName}.unpublished`, serialized);

          return serialized;
        },
      },
    },
  };

  return mixin as Partial<ServiceSchema>;
}
