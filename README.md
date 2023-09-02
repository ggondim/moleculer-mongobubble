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
| patchOne | `filter: object`<br>`patch: object`<br>`upsert?: boolean` | `users.updated` |
| replaceOne | `object` | `users.updated` |
| deleteOne | `id: string` | `users.deleted` |
| archive | `id: string` | `users.archived` |
| publish | `id: string` | `users.published` |

### Calling from API gateway (moleculer-web)

| Method | Route | Query params | Body |
| --- | --- | --- | --- |
| GET | `/api/v1/users` | `?drafts=true` (optional)<br>`?archive=true` (optional) | - |
| GET | `/api/v1/users/:id` | - | - |
| POST | `/api/v1/users` | - | `object` |
| PATCH | `/api/v1/users/:id` | - | `object` |
| PATCH | `/api/v1/users` | `?filter=object`<br>`&upsert=true` (optional) | `object` |
| PUT | `/api/v1/users/:id` | - | `object` |
| DELETE | `/api/v1/users/:id` | - | - |
| PUT | `/api/v1/users/:id/archive` | - | - |
| PUT | `/api/v1/users/:id/publish` | - | - |

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

## EJSON

This mixin always returns documents serialized in [EJSON](https://docs.mongodb.com/manual/reference/mongodb-extended-json/).

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

~~To automatically serialize/deserialize EJSON objects, you can use the broker middleware:~~

>⚠️ The broker middleware that wraps the broker `call` method to automatically serialize/deserialize EJSON objects is not working due to an [issue with moleculer](https://github.com/moleculerjs/moleculer/issues/1241). Please use the `EJSON.serialize` and `EJSON.deserialize` methods until this issue is fixed.

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
- [ ] Implement the remaining MongoBubble's methods
- [ ] Replace connection utility by MongoBubble's connection managers
- [ ] Implement other Moleculer features, like caching
- [ ] Unit tests
