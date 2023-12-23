/* eslint-disable eslint-comments/disable-enable-pair */
/* eslint-disable eslint-comments/no-unlimited-disable */
/* eslint-disable */
import {
  ClonableConstructor, MongoRepositoryOptions,
} from '@mongobubble/core';
import { ObjectId } from 'bson';
import { ServiceSchema } from 'moleculer';
import { EntityWithLifecycle, LifecyclePluginOptions, MongoBubble } from 'mongobubble';
import { MongoClient, Document } from 'mongodb';
import { list, listArchive, listDrafts } from './actions/list';
import { getById } from './actions/get';
import { insertOne } from './actions/create';
import { patchOneByIdRest, patchOneById, patchOneRest, patchOne } from './actions/patch';
import { replaceOneRest, replaceOne } from './actions/replace';
import { deleteOne } from './actions/delete';
import { publish, archive, unpublish } from './actions/put';
import { call } from './utils/call-override';

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

    entityClass,

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

      call,
    },

    actions: {
      list,
      listDrafts,
      listArchive,
      getById,
      insertOne,
      patchOneByIdRest,
      patchOneById,
      patchOneRest,
      patchOne,
      replaceOneRest,
      replaceOne,
      deleteOne,
      publish,
      archive,
      unpublish,
    },
  };

  return mixin as Partial<ServiceSchema>;
}
