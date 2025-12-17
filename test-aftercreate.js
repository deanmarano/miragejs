import { Factory } from 'miragejs';

export default Factory.extend({
  async afterCreate(agentPool) {
    await agentPool.update({ organizationId: agentPool.organization.id });
    return agentPool;
  }
});
