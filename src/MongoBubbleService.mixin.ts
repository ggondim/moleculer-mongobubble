/* eslint-disable eslint-comments/disable-enable-pair */
/* eslint-disable eslint-comments/no-unlimited-disable */
/* eslint-disable */
import {
  ClonableConstructor, MongoRepositoryOptions, PreventedResult, PreventedResultError,
} from '@mongobubble/core';
import { ObjectId, EJSON } from 'bson';
import { ServiceSchema, Context } from 'moleculer';
import { EntityWithLifecycle, LifecyclePluginOptions, MongoBubble } from 'mongobubble';
import { MongoClient, Document } from 'mongodb';
import { inspect } from 'util';

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

export default function createDbServiceMixin<
  TEntity extends EntityWithLifecycle<TEntity, Identity>,
  Identity = ObjectId,
>(
  entityClass: ClonableConstructor<TEntity>,
  mixinOptions: MongoBubbleMixinOptions = {} as MongoBubbleMixinOptions,
  repositoryOptions = {} as Document & MongoRepositoryOptions & LifecyclePluginOptions,
): Partial<ServiceSchema> {
  const mixin: MongoBubbleMixin<TEntity, Identity> = {
    name: (entityClass as unknown as Document).COLLECTION,

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
      try {
        if (this.repository) {
          this.repository.dispose();
        }
        if (GLOBAL_CLIENT && GLOBAL_CLIENT.close) {
          GLOBAL_CLIENT.close();
        }
      } catch (e) {
        // this.logger.warn("Unable to stop database connection gracefully.", e);
      }
    },

    methods: {
      async newReusableRepository() {
        return new MongoBubble<TEntity, Identity>(
          entityClass,
          {
            ...repositoryOptions,
            client: GLOBAL_CLIENT,
            db: mixinOptions.dbName,
            autoConnectionSwitch: false,
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
          entityClass,
          {
            ...repositoryOptions,
            autoConnectionSwitch: true,
          },
        );
      },

      getGlobalClient(): MongoClient {
        return GLOBAL_CLIENT;
      },
    },

    actions: {

      list: {
        rest: 'GET /',
        mergeParams: true,
        params: {
          drafts: { type: 'boolean', optional: true },
          archived: { type: 'boolean', optional: true },
        },
        handler: async (ctx: Context<Document>) => {
          const repository = ctx.service?.getRepository();

          let results: TEntity[];

          if (ctx.params.query?.drafts) {
            const errorOrResults = await repository.listDrafts();
            if (errorOrResults instanceof PreventedResult) {
              throw new PreventedResultError(errorOrResults);
            }
            results = errorOrResults;
          } else if (ctx.params?.archived) {
            const errorOrResults = await repository.listArchive();
            if (errorOrResults instanceof PreventedResult) {
              throw new PreventedResultError(errorOrResults);
            }
            results = errorOrResults;
          } else {
            results = await repository.list();
          }

          return EJSON.serialize(results);
        },
      },

      getById: {
        rest: 'GET /:id',
        mergeParams: true,
        handler: async (ctx: Context<Document>) => {
          const repository = ctx.service?.getRepository();
          const result = await repository.get(ctx.params.id);

          if (!result) {
            // eslint-ignore-next-line
            ctx.meta["$statusCode"] = 404;
            return {};
          }
          return EJSON.serialize(result);
        },
      },

      insertOne: {
        rest: 'POST /',
        mergeParams: true,
        handler: async (ctx: Context<Document>) => {
          const repository = ctx.service?.getRepository() as MongoBubble<TEntity, Identity>;

          const result = await repository.insertOne(EJSON.deserialize(ctx.params));
          const serialized = EJSON.serialize(result);


          ctx.broker.emit(`${ctx.service?.name}.created`, serialized);

          return serialized;
        },
      },

      patchOneByIdRest: {
        rest: 'PATCH /:id',
        mergeParams: false,
        params: {
          body: { type: 'object' },
        },
        handler: async (ctx: Context<Document>) => {
          (() => { })();
          return ctx.call(`${ctx.service?.name}.patchOneById`, {
            id: ctx.params.params.id,
            patch: ctx.params.body,
          });
        },
      },

      patchOneById: {
        visibility: 'public',
        params: {
          id: { type: 'string' },
          patch: { type: 'object' },
        },
        handler: async (ctx: Context<Document>) => {
          const repository = ctx.service?.getRepository() as MongoBubble<TEntity, Identity>;

          const result = await repository.patchOne({
            _id: ctx.params.id,
          }, EJSON.deserialize(ctx.params.patch));

          const serialized = EJSON.serialize(result);

          ctx.broker.emit(`${ctx.service?.name}.updated`, serialized);

          return serialized;
        },
      },

      patchOneRest: {
        rest: 'PATCH /',
        mergeParams: false,
        params: {
          // this validation is breaking moleculer
          // query: {
          //   filter: { type: 'object' },
          //   upsert: { type: 'boolean', optional: true },
          // },
          body: { type: 'object' },
        },
        handler: async (ctx: Context<Document>) => {
          (() => { })();
          return ctx.call(`${ctx.service?.name}.patchOne`, {
            filter: ctx.params.params.filter,
            upsert: ctx.params.params.upsert,
            patch: ctx.params.body,
          });
        },
      },

      patchOne: {
        visibility: 'public',
        params: {
          filter: { type: 'object' },
          upsert: { type: 'boolean', optional: true },
          patch: { type: 'object' },
        },
        handler: async (ctx: Context<Document>) => {
          const repository = ctx.service?.getRepository() as MongoBubble<TEntity, Identity>;

          const options = ctx.params.upsert ? { upsert: true } : {};

          const result = await repository.patchOne(
            EJSON.deserialize(ctx.params.filter),
            EJSON.deserialize(ctx.params.patch),
            options,
          );

          const serialized = EJSON.serialize(result);

          ctx.broker.emit(`${ctx.service?.name}.updated`, serialized);

          return serialized;
        },
      },

      replaceOneRest: {
        rest: 'PUT /:id',
        mergeParams: false,
        params: {
          body: { type: 'object' },
        },
        handler: async (ctx: Context<Document>) => {
          (() => { })();
          return ctx.call(`${ctx.service?.name}.replaceOne`, ctx.params.body);
        },
      },

      replaceOne: {
        visibility: 'public',
        params: {
          document: { type: 'object' },
        },
        handler: async (ctx: Context<Document>) => {
          const repository = ctx.service?.getRepository() as MongoBubble<TEntity, Identity>;
          const result = await repository.replaceOne(EJSON.deserialize(ctx.params.document));
          const serialized = EJSON.serialize(result);

          ctx.broker.emit(`${ctx.service?.name}.updated`, serialized);

          return serialized;
        },
      },

      deleteOne: {
        rest: 'DELETE /:id',
        mergeParams: true,
        params: {
          id: { type: 'string' },
        },
        handler: async (ctx: Context<Document>) => {
          const repository = ctx.service?.getRepository() as MongoBubble<TEntity, Identity>;
          const result = await repository.deleteOne(ctx.params.id);
          const serialized = EJSON.serialize(result);

          ctx.broker.emit(`${ctx.service?.name}.deleted`, serialized);

          return serialized;
        },
      },

      publish: {
        rest: 'PUT /:id/publish',
        mergeParams: true,
        params: {
          id: { type: 'string' },
        },
        handler: async (ctx: Context<Document>) => {
          const repository = ctx.service?.getRepository();
          const entity = await repository.get(ctx.params.id);
          const patch = entity.publish();
          const result = await repository.patchOne({ _id: entity._id }, patch);
          const serialized = EJSON.serialize(result);

          ctx.broker.emit(`${ctx.service?.name}.published`, serialized);

          return serialized;
        },
      },

      archive: {
        rest: 'PUT /:id/archive',
        mergeParams: true,
        params: {
          id: { type: 'string' },
        },
        handler: async (ctx: Context<Document>) => {
          const repository = ctx.service?.getRepository();
          const entity = await repository.get(ctx.params.id);
          const patch = entity.archive();
          const result = await repository.patchOne({ _id: entity._id }, patch);
          const serialized = EJSON.serialize(result);

          ctx.broker.emit(`${ctx.service?.name}.archived`, serialized);

          return serialized;
        },
      },
    },
  };

  return mixin as Partial<ServiceSchema>;
}
