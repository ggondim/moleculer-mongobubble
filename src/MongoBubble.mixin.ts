import {
  ClonableConstructor, MongoRepositoryOptions, PreventedResult, PreventedResultError,
} from '@mongobubble/core';
import { ObjectId, EJSON } from 'bson';
import { ServiceSchema, Context } from 'moleculer';
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

    repository: undefined,

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
        handler: async (ctx: Context<Document>) => {
          const repository = ctx.service?.getRepository();
          const result = await repository.get(ctx.params.params.id);
          return EJSON.serialize(result);
        },
      },

      insertOne: {
        rest: 'POST /',
        handler: async (ctx: Context<Document>) => {
          const repository = ctx.service?.getRepository() as MongoBubble<TEntity, Identity>;

          const result = await repository.insertOne(EJSON.deserialize(ctx.params.body));
          const serialized = EJSON.serialize(result);

          ctx.broker.emit(`${ctx.service?.name}.created`, serialized);

          return serialized;
        },
      },

      patchOne: {
        rest: 'PATCH /:id',
        params: {
          id: { type: 'string' },
        },
        handler: async (ctx: Context<Document>) => {
          const repository = ctx.service?.getRepository() as MongoBubble<TEntity, Identity>;

          const result = await repository.patchOne({
            _id: ctx.params.params.id,
          }, EJSON.deserialize(ctx.params.body));

          const serialized = EJSON.serialize(result);

          ctx.broker.emit(`${ctx.service?.name}.updated`, serialized);

          return serialized;
        },
      },

      replaceOne: {
        rest: 'PUT /:id',
        params: {
          id: { type: 'string' },
        },
        handler: async (ctx: Context<Document>) => {
          const repository = ctx.service?.getRepository() as MongoBubble<TEntity, Identity>;
          const result = await repository.replaceOne(EJSON.deserialize(ctx.params.body));
          const serialized = EJSON.serialize(result);

          ctx.broker.emit(`${ctx.service?.name}.updated`, serialized);

          return serialized;
        },
      },

      deleteOne: {
        rest: 'DELETE /:id',
        params: {
          id: { type: 'string' },
        },
        handler: async (ctx: Context<Document>) => {
          const repository = ctx.service?.getRepository() as MongoBubble<TEntity, Identity>;
          const result = await repository.deleteOne(ctx.params.params.id);
          const serialized = EJSON.serialize(result);

          ctx.broker.emit(`${ctx.service?.name}.deleted`, serialized);

          return serialized;
        },
      },

      publish: {
        rest: 'PUT /:id/publish',
        params: {
          id: { type: 'string' },
        },
        handler: async (ctx: Context<Document>) => {
          const repository = ctx.service?.getRepository();
          const entity = await repository.get(ctx.params.params.id);
          const patch = entity.publish();
          const result = await repository.patchOne({ _id: entity._id }, patch);
          const serialized = EJSON.serialize(result);

          ctx.broker.emit(`${ctx.service?.name}.published`, serialized);

          return serialized;
        },
      },

      archive: {
        rest: 'PUT /:id/archive',
        params: {
          id: { type: 'string' },
        },
        handler: async (ctx: Context<Document>) => {
          const repository = ctx.service?.getRepository();
          const entity = await repository.get(ctx.params.params.id);
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
