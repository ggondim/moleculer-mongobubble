# Moleculer-Mongobubble
> A ⚛️ [Moleculer](https://moleculer.services/) module for generating CRUD APIs using 🍃🫧 [MongoBubble](https://mongobubble.com/).

Heavily inspired from [Moleculer's DB module](https://github.com/moleculerjs/moleculer-db/tree/master/packages/moleculer-db), this module generates automatically API CRUD routes based on an entity class typed for use with MongoBubble.

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

This code will generate the following API actions:

| Action name | Method | Route | MongoBubble method | Query params |
| --- | --- | --- | --- | --- |
| list | GET | `/api/v1/users` | `list()`, `listDrafts()` and `listArchive()` | ?drafts=true&archive=true
| getById | GET | `/api/v1/users/:id` | `get(id)` |
| insertOne | POST | `/api/v1/users` | `insertOne()` |
| patchOne | PATCH | `/api/v1/users/:id` | `patchOne()` |
| replaceOne | PUT | `/api/v1/users/:id` | `replaceOne()` |
| deleteOne | DELETE | `/api/v1/users/:id` | `deleteOne()` |
| archive | PUT | `/api/v1/users/:id/archive` |  |
| publish | PUT | `/api/v1/users/:id/publish` |  |

## Connections

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

### `reuseLocalRepository` property

If you set `reuseLocalRepository` to `false`, a new MongoBubble repository will be created for each action invocation within the same service.

This is useful only if you need to use different repositories for the same entity in the same service.

## Repository and plugin options

The third parameter of the mixin is the [option object](https://mongobubble.com/docs/repository/constructor/#options-argument) that will be passed to the MongoBubble repository constructor. You should use it to configure the repository and to pass plugins options.

## Roadmap
- [ ] Implement the remaining MongoBubble's methods
- [ ] Replace connection utility by MongoBubble's connection managers
- [ ] Implement other Moleculer features, like caching
- [ ] Unit tests
