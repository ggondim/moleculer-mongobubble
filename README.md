# Moleculer-Mongobubble
> A ⚛️ [Moleculer](https://moleculer.services/) module for generating CRUD actions using 🍃🫧 [MongoBubble](https://mongobubble.com/).

Heavily inspired from [Moleculer's DB module](https://github.com/moleculerjs/moleculer-db/tree/master/packages/moleculer-db), this module generates automatically CRUD actions based on an entity class typed for use with MongoBubble.

## Usage

```
$ npm install --save moleculer-mongobubble
```

Assuming you have an `User` entity that extends [MongoBubble's `EntityWithLifecycle`](https://mongobubble.com/docs/modeling/class/), import the mixin factory and use it in your service schema:

```typescript
import { MongoBubbleMixin } from "moleculer-mongobubble";
import User from "./User";

const UsersService: Partial<ServiceSchema> = {
	version: 1,

	mixins: [MongoBubbleMixin<User>(User, { dbName: "dbname", uri: MONGO_URI })],
};

export default UsersService;

```

This code will automatically generate the following service actions:

### Calling from other services

| Action name | Params | Event emitted |
| --- | --- | --- |
| list | `drafts?: boolean`<br>`archived?: boolean` | - |
| getById | `id: string` | - |
| insertOne | `object` | `users.created` |
| patchOneById | `id: string`<br>`patch: object` | `users.updated` |
| patchOne | `filter: object`<br>`patch: object` | `users.updated` |
| replaceOne | `object` | `users.updated` |
| deleteOne | `id: string` | `users.deleted` |
| archive | `id: string` | `users.archived` |
| publish | `id: string` | `users.published` |
| unpublish | `id: string` | `users.unpublished` |

### Calling from API gateway (moleculer-web)

| Method | Route | Query params | Body |
| --- | --- | --- | --- |
| GET | `/api/v1/users` | `?drafts=true` (optional)<br>`?archive=true` (optional) | - |
| GET | `/api/v1/users/:id` | - | - |
| POST | `/api/v1/users` | - | `object` |
| PATCH | `/api/v1/users/:id` | - | `object` |
| PATCH | `/api/v1/users` | `?filter=object` (optional) | `object` |
| PUT | `/api/v1/users/:id` | - | `object` |
| DELETE | `/api/v1/users/:id` | - | - |
| PUT | `/api/v1/users/:id/archive` | - | - |
| PUT | `/api/v1/users/:id/publish` | - | - |
| PUT | `/api/v1/users/:id/unpublish` | - | - |

## Database connections

The mixin accepts a second parameter, an object with the following properties:

| Property | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| dbName | `string` | _required_ | - | The name of the database to use |
| uri | `string` | _optional_  | - | The URI of the MongoBubble connection |
| reuseGlobalClient | `boolean` | _optional_ | `true` | Whether to reuse a single MongoClient in the same Moleculer node |
| reuseLocalRepository | `boolean` | _optional_ | `true` | Whether to reuse a single MongoBubble repository in the same Moleculer service |

### `uri` property

If you don't provide a `uri` property, you should provide one of the [MongoBubble's connection options](https://mongobubble.com/docs/repository/connection/).

### `reuseGlobalClient` property

If you set `reuseGlobalClient` to `false`, a new MongoClient will be created for each service using the mixin. This is useful if you want to connect to different databases in different services.

You probably won't need to set this property to `false` if you're using a single database and if you want to optimize the number of connections.

When using the global client, the connection will be automatically closed when the service is stopped.

You can access the global client using the internal method `getGlobalClient()` of the service.

### `reuseLocalRepository` property

If you set `reuseLocalRepository` to `false`, a new MongoBubble repository will be created for each action invocation within the same service.

This is useful only if you need to use different repositories for the same entity in the same service.

You can access the local repository using the internal method `getRepository()` of the service.

## Repository and plugin options

The third parameter of the mixin is the [option object](https://mongobubble.com/docs/repository/constructor/#options-argument) that will be passed to the MongoBubble repository constructor. You should use it to configure the repository and to pass plugins options.

## ID params in URLs

The `id` param is a string by default inside moleculer-web.

You should always use encoded strings in URLs, specially when IDs could have special characters.

Moleculer-MongoBubble will try to automatically convert IDs to the correct identity type using MongoBubble's `parseId` static method.

In this case, default primitives accepted by `parseId` are `ObjectId`, `number` and `string`, in this order. If you need to use more complex types, you can override the `parseId` method in your entity class.

Example with an `UUID` type:

```typescript
import { EntityWithLifecycle } from "mongobubble";
import UUID from "uuid";

class User extends EntityWithLifecycle {
  static parseId(id: string) {
    return UUID.parse(id);
  }
}
```

## EJSON

The MongoBubbleService mixin always returns documents serialized in [EJSON](https://docs.mongodb.com/manual/reference/mongodb-extended-json/) to avoid losing data types.

This means an `ObjectId` will be serialized as `{ "$oid": "..." }` and a `Date` will be serialized as `{ "$date": "..." }`, for example.

```json
{
  "_id": {
    "$oid": "5f9b0b3b9b0b3b9b0b3b9b0b"
  },
  "name": "John Doe",
  "birthday": {
    "$date": "1990-01-01T00:00:00.000Z"
  }
}
```

Input documents and parameters are also required to be in EJSON format, so you should serialize them when calling the actions.

```typescript
const user = {
  _id: new ObjectId(),
  name: "John Doe",
  birthday: new Date("1990-01-01T00:00:00.000Z")
};

await broker.call("users.insertOne", EJSON.serialize(user));
```

To automatically serialize/deserialize EJSON objects, you can use the EJSON service mixin in services that would call other services built with MongoBubbleService mixin.

This mixin will add a service-level method `call` that wraps the broker `call` method to automatically serialize/deserialize EJSON objects.

```typescript
import { Context, ServiceSchema } from "moleculer";
import { inspect } from "util";
import { EjsonServiceMixin } from "moleculer-mongobubble";

const CustomService: Partial<ServiceSchema> = {
  version: 1,
  name: "custom-service",

  mixins: [EjsonServiceMixin],

  actions: {
    callUsersList: {
      async handler(ctx: Context<{ param1: string }>) {

        // params are serialized to EJSON
        const result = await this.call("v1.users.list", { drafts: true });

        // results are BSON native objects
        console.log("log", inspect(result));
      },
    },
  },
}

export default CustomService;
```

>⚠️ This would be the best solution when working with automatic EJSON serialization, until [this moleculer issue](https://github.com/moleculerjs/moleculer/issues/1241) is solved.

<!-- ```typescript
// moleculer.config.js
import { MongoBubbleBrokerMiddleware } from "moleculer-mongobubble";

module.exports = {
  middlewares: [MongoBubbleBrokerMiddleware]
};

// service.schema.ts
const user = {
  _id: new ObjectId(),
  name: "John Doe",
  birthday: new Date("1990-01-01T00:00:00.000Z")
};

await broker.call("users.insertOne", user); // user will be automatically serialized to EJSON
``` -->

## Roadmap
- [ ] Authoring and auditing metadata
- [ ] Implement the remaining MongoBubble's methods
- [ ] Replace connection utility by MongoBubble's connection managers
- [ ] Implement other Moleculer features, like caching
- [ ] Unit tests
