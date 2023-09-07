import { EJSON } from 'bson';
import { ServiceSchema } from 'moleculer';

const mixin: Partial<ServiceSchema> = {

  hooks: {
    before: {
      '*': [
        async (ctx) => {
          ctx.params = EJSON.deserialize(ctx.params);
        },
      ],
    },
  },

  methods: {
    async call(method: string, params: unknown, opts: unknown): Promise<unknown> {
      const p = EJSON.serialize(params);
      const result = await this.broker.call(method, p, opts);
      return EJSON.deserialize(result);
    },
  },
};

export default mixin;
